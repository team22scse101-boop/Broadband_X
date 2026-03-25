const { asyncHandler } = require('../middleware/errorHandler');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const PaymentFailureLogger = require('../utils/PaymentFailureLogger');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

// @desc    Create Razorpay order
// @route   POST /api/razorpay/create-order
// @access  Private
exports.createOrder = asyncHandler(async (req, res) => {
  const { subscriptionId, planId, amount } = req.body;
  const Plan = require('../models/Plan');

  // Validate Razorpay configuration
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({
      success: false,
      message: 'Payment gateway not configured. Please contact administrator.'
    });
  }

  let subscription;
  let plan;
  let isNewSubscription = false;

  // Check if this is for an existing subscription or a new plan purchase
  if (subscriptionId) {
    // Existing subscription payment
    subscription = await Subscription.findById(subscriptionId).populate('plan');
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Check if user owns this subscription
    if (subscription.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to pay for this subscription'
      });
    }
    plan = subscription.plan;
  } else if (planId) {
    // New plan purchase - validate plan exists
    plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found. Please select a valid plan.'
      });
    }
    isNewSubscription = true;
  } else {
    return res.status(400).json({
      success: false,
      message: 'Either subscriptionId or planId is required'
    });
  }

  // Create Razorpay order
  const options = {
    amount: amount, // Already in paise from frontend
    currency: 'INR',
    receipt: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    payment_capture: 1, // Auto capture payment
    notes: {
      planId: plan._id.toString(),
      subscriptionId: subscriptionId || 'new',
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      planName: plan.name,
      isNewSubscription: isNewSubscription
    }
  };

  const order = await razorpay.orders.create(options);

  // Create payment record in database
  const payment = await Payment.create({
    user: req.user.id,
    subscription: subscriptionId || null,
    razorpayOrderId: order.id,
    amount: amount / 100, // Store in rupees
    currency: 'INR',
    status: 'created',
    description: `Payment for ${plan.name}`,
    notes: {
      planId: plan._id.toString(),
      subscriptionId: subscriptionId ? subscriptionId.toString() : 'new',
      userId: req.user.id.toString(),
      userName: `${req.user.firstName} ${req.user.lastName}`,
      planName: plan.name,
      isNewSubscription: isNewSubscription.toString()
    }
  });

  res.status(201).json({
    success: true,
    data: {
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency
      },
      payment: {
        id: payment._id
      },
      key: process.env.RAZORPAY_KEY_ID
    }
  });
});

// @desc    Verify payment signature
// @route   POST /api/razorpay/verify
// @access  Private
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  // Generate signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest('hex');

  // Verify signature
  const isAuthentic = expectedSignature === razorpay_signature;

  if (isAuthentic) {
    // Update payment status
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // Fetch payment details from Razorpay
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = paymentDetails.status === 'captured' ? 'captured' : 'authorized';
    payment.method = paymentDetails.method;
    payment.bank = paymentDetails.bank;
    payment.wallet = paymentDetails.wallet;
    payment.vpa = paymentDetails.vpa;

    if (paymentDetails.card) {
      payment.cardLast4 = paymentDetails.card.last4;
      payment.cardNetwork = paymentDetails.card.network;
      payment.cardType = paymentDetails.card.type;
    }

    payment.capturedAt = new Date();
    await payment.save();

    // Create Billing record for captured payment
    const Billing = require('../models/Billing');
    try {
      console.log('💳 Creating billing record for payment:', razorpay_payment_id);

      // Calculate billing period (1 month from now)
      const billingStart = new Date();
      const billingEnd = new Date(billingStart);
      billingEnd.setDate(billingEnd.getDate() + 30); // 30-day billing period

      // Generate invoice number manually
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');

      // Find the latest invoice number for the current month
      const latestInvoice = await Billing.findOne({
        invoiceNumber: new RegExp(`^INV-${year}${month}-`)
      }).sort({ invoiceNumber: -1 });

      let sequence = 1;
      if (latestInvoice) {
        const lastSequence = parseInt(latestInvoice.invoiceNumber.split('-')[2]);
        sequence = lastSequence + 1;
      }

      const invoiceNumber = `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
      console.log('📄 Generated invoice number:', invoiceNumber);

      const billingRecord = new Billing({
        invoiceNumber,
        user: payment.user,
        subscription: payment.subscription,
        amount: payment.amount,
        status: 'paid',
        dueDate: billingEnd, // Due date is end of billing period (next billing date)
        billingPeriod: {
          start: billingStart,
          end: billingEnd
        },
        items: [{
          description: paymentDetails.description || 'Subscription Payment',
          amount: payment.amount,
          quantity: 1,
          total: payment.amount
        }],
        subtotal: payment.amount,
        tax: 0,
        discount: 0,
        total: payment.amount,
        paymentMethod: {
          type: payment.method === 'card' ? 'credit_card' : 'other',
          last4: payment.cardLast4,
          cardBrand: payment.cardNetwork
        },
        paymentDate: payment.capturedAt,
        transactionId: razorpay_payment_id
      });

      await billingRecord.save();
      console.log('✅ Successfully created billing record:', billingRecord.invoiceNumber);
      console.log('📊 Invoice details:', {
        invoiceNumber: billingRecord.invoiceNumber,
        userId: payment.user,
        amount: payment.amount,
        status: 'paid'
      });
    } catch (billingError) {
      console.error('❌ CRITICAL: Failed to create billing record:', billingError);
      console.error('❌ Error details:', billingError.message);
      console.error('❌ Stack trace:', billingError.stack);
      // Log but don't fail the payment - we can create it manually later if needed
    }

    // Check if this is a new subscription or existing one
    let subscription = payment.subscription ? await Subscription.findById(payment.subscription) : null;

    // If no subscription exists and this was a new plan purchase, create it
    const isNewSub = payment.notes && payment.notes.get('isNewSubscription') === 'true';
    const planId = payment.notes ? payment.notes.get('planId') : null;

    if (!subscription && isNewSub && planId) {
      // Fetch plan details
      const Plan = require('../models/Plan');
      const plan = await Plan.findById(planId);

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found'
        });
      }

      // Calculate end date based on billing cycle
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 30); // 30-day monthly billing period

      subscription = await Subscription.create({
        user: payment.user,
        plan: planId,
        status: 'active',
        startDate: startDate,
        endDate: endDate,
        billingCycle: 'monthly',
        pricing: {
          basePrice: plan.pricing.monthly,
          discountApplied: 0,
          finalPrice: plan.pricing.monthly,
          currency: plan.pricing.currency || 'INR',
          taxAmount: 0,
          totalAmount: plan.pricing.monthly
        },
        activatedAt: new Date(),
        paymentHistory: [{
          date: new Date(),
          amount: payment.amount,
          paymentMethod: payment.method || 'razorpay',
          transactionId: razorpay_payment_id,
          status: 'completed',
          invoiceNumber: `INV-${Date.now()}`,
          notes: `Initial payment for ${plan.name}`
        }]
      });

      // Generate initial usage data for the new subscription
      console.log('📊 Generating initial usage data for new subscription...');
      const UsageLog = require('../models/UsageLog');
      const usageLogs = [];
      const now = new Date();

      // Generate usage for the past 7 days (or since subscription start if less than 7 days)
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        // Only generate data from subscription start date onwards
        if (date >= startDate) {
          date.setHours(12, 0, 0, 0);

          // Random realistic usage between 0.5-3 GB per day
          const downloadBytes = (Math.random() * 2.5 + 0.5) * 1024 * 1024 * 1024; // 0.5-3 GB
          const uploadBytes = (Math.random() * 0.4 + 0.1) * 1024 * 1024 * 1024; // 0.1-0.5 GB

          usageLogs.push({
            userId: payment.user,
            deviceId: `device-${payment.user.toString().slice(-6)}`,
            deviceType: ['Desktop', 'Mobile', 'Tablet'][Math.floor(Math.random() * 3)],
            ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            timestamp: date,
            download: downloadBytes,
            upload: uploadBytes,
            downloadSpeed: plan.features?.speed?.download || 25, // Use plan speed or default
            uploadSpeed: plan.features?.speed?.upload || 5,
            latency: Math.random() * 20 + 10, // 10-30ms
            packetLoss: Math.random() * 2, // 0-2%
            sessionDuration: Math.floor(Math.random() * 120 + 30) // 30-150 minutes
          });
        }
      }

      if (usageLogs.length > 0) {
        await UsageLog.insertMany(usageLogs);
        const totalGB = usageLogs.reduce((sum, log) => sum + log.download + log.upload, 0) / (1024 * 1024 * 1024);
        console.log(`✅ Generated ${usageLogs.length} usage logs with ${totalGB.toFixed(2)} GB total usage`);
      }

      // Update payment with subscription ID
      payment.subscription = subscription._id;
      await payment.save();
    } else if (subscription && subscription.status !== 'active') {
      // Update existing subscription status to active
      subscription.status = 'active';
      subscription.activatedAt = new Date();
      await subscription.save();
    }

    // Reset payment failures on successful payment (customer recovered)
    if (subscription) {
      await Subscription.findByIdAndUpdate(subscription._id, {
        paymentFailures: 0
      });
      console.log(`✅ Reset paymentFailures to 0 for subscription ${subscription._id}`);
    }

    // Send welcome email after successful payment (for all subscriptions)
    try {
      const emailService = require('../services/emailService');
      const user = await User.findById(payment.user);

      if (user && user.email && subscription) {
        // Fetch plan details for email
        const Plan = require('../models/Plan');
        const planForEmail = await Plan.findById(subscription.plan);

        if (planForEmail) {
          await emailService.sendWelcomeEmail(user.email, {
            customerName: `${user.firstName} ${user.lastName}`,
            planName: planForEmail.name,
            speed: planForEmail.features?.speed ? `${planForEmail.features.speed.download} Mbps Download / ${planForEmail.features.speed.upload} Mbps Upload` : 'As per plan',
            data: planForEmail.features?.data || 'Unlimited',
            price: planForEmail.pricing.monthly,
            installationDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          });
          console.log('✅ Welcome email sent to:', user.email);
        } else {
          console.log('⚠️ Plan not found for subscription, skipping welcome email');
        }
      } else {
        console.log('⚠️ Email not sent - missing data:', {
          hasUser: !!user,
          hasEmail: !!(user && user.email),
          hasSubscription: !!subscription
        });
      }
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError);
      console.error('Email error details:', emailError.message);
      // Don't fail the subscription if email fails
    }

    // Emit real-time event if subscription exists
    if (subscription && global.realTimeEvents) {
      global.realTimeEvents.emitToUser(subscription.user.toString(), 'payment:success', {
        subscriptionId: subscription._id,
        amount: payment.amount,
        paymentId: payment._id
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        payment,
        subscription
      }
    });
  } else {
    // Payment verification failed
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (payment) {
      payment.status = 'failed';
      payment.errorReason = 'Signature verification failed';
      payment.failedAt = new Date();
      await payment.save();

      // Increment payment failures on the subscription for churn tracking
      if (payment.subscription) {
        await Subscription.findByIdAndUpdate(payment.subscription, {
          $inc: { paymentFailures: 1 }
        });
        console.log(`⚠️ Incremented paymentFailures for subscription ${payment.subscription}`);
      }

      // Log to Excel/CSV for admin
      const user = await User.findById(payment.user);
      await PaymentFailureLogger.logFailure({
        userId: payment.user?.toString(),
        userEmail: user?.email || 'unknown',
        userName: user ? `${user.firstName} ${user.lastName}` : 'unknown',
        amount: payment.amount,
        planName: payment.notes?.get('planName') || 'unknown',
        planId: payment.notes?.get('planId') || '',
        errorCode: 'SIGNATURE_MISMATCH',
        errorDescription: 'Razorpay signature verification failed',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        type: payment.notes?.get('isNewSubscription') === 'true' ? 'subscription' : 'renewal'
      });
    }

    res.status(400).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
});

// @desc    Get payment history
// @route   GET /api/razorpay/history
// @access  Private
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const payments = await Payment.find({ user: req.user.id })
    .sort('-createdAt')
    .skip(skip)
    .limit(limit)
    .populate('subscription', 'plan status startDate endDate')
    .populate({
      path: 'subscription',
      populate: { path: 'plan', select: 'name pricing' }
    });

  const total = await Payment.countDocuments({ user: req.user.id });

  res.status(200).json({
    success: true,
    count: payments.length,
    pagination: {
      page,
      pages: Math.ceil(total / limit),
      total
    },
    data: payments
  });
});

// @desc    Get payment by ID
// @route   GET /api/razorpay/:id
// @access  Private
exports.getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('user', 'firstName lastName email')
    .populate('subscription', 'plan status')
    .populate({
      path: 'subscription',
      populate: { path: 'plan', select: 'name pricing' }
    });

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }

  // Check if user owns this payment or is admin
  if (payment.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this payment'
    });
  }

  res.status(200).json({
    success: true,
    data: payment
  });
});

// @desc    Handle Razorpay webhook
// @route   POST /api/razorpay/webhook
// @access  Public (but secured with webhook secret)
exports.handleWebhook = asyncHandler(async (req, res) => {
  const webhookSignature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (webhookSignature !== expectedSignature) {
    return res.status(400).json({
      success: false,
      message: 'Invalid webhook signature'
    });
  }

  const event = req.body.event;
  const payload = req.body.payload.payment.entity;

  console.log('Razorpay Webhook Event:', event);

  // Handle different webhook events
  switch (event) {
    case 'payment.captured':
      // Payment was successfully captured
      await Payment.findOneAndUpdate(
        { razorpayPaymentId: payload.id },
        {
          status: 'captured',
          capturedAt: new Date(payload.created_at * 1000)
        }
      );
      break;

    case 'payment.failed':
      // Payment failed
      await Payment.findOneAndUpdate(
        { razorpayOrderId: payload.order_id },
        {
          status: 'failed',
          errorCode: payload.error_code,
          errorDescription: payload.error_description,
          errorReason: payload.error_reason,
          failedAt: new Date(payload.created_at * 1000)
        }
      );

      // Increment payment failures on the subscription for churn tracking
      try {
        const failedPayment = await Payment.findOne({ razorpayOrderId: payload.order_id });
        if (failedPayment && failedPayment.subscription) {
          await Subscription.findByIdAndUpdate(failedPayment.subscription, {
            $inc: { paymentFailures: 1 }
          });
          console.log(`⚠️ Webhook: Incremented paymentFailures for subscription ${failedPayment.subscription}`);
        }

        // Log to Excel/CSV for admin
        const user = failedPayment ? await User.findById(failedPayment.user) : null;
        await PaymentFailureLogger.logFailure({
          userId: failedPayment?.user?.toString(),
          userEmail: user?.email || 'unknown',
          userName: user ? `${user.firstName} ${user.lastName}` : 'unknown',
          amount: (payload.amount || 0) / 100,
          planName: failedPayment?.notes?.get('planName') || 'unknown',
          planId: failedPayment?.notes?.get('planId') || '',
          errorCode: payload.error_code || 'WEBHOOK_FAILURE',
          errorDescription: payload.error_description || 'Payment failed via webhook',
          razorpayOrderId: payload.order_id || '',
          razorpayPaymentId: payload.id || '',
          source: 'razorpay_webhook',
          type: failedPayment?.notes?.get('isNewSubscription') === 'true' ? 'subscription' : 'renewal'
        });
      } catch (err) {
        console.error('Failed to increment paymentFailures:', err.message);
      }
      break;

    case 'refund.created':
      // Refund was initiated
      const payment = await Payment.findOne({ razorpayPaymentId: payload.payment_id });
      if (payment) {
        payment.status = payload.amount === payment.amount * 100 ? 'refunded' : 'partial_refund';
        payment.refundAmount = payload.amount / 100;
        payment.refundedAt = new Date();
        await payment.save();
      }
      break;
  }

  res.status(200).json({ success: true });
});

module.exports = exports;
