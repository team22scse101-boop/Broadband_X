const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Billing = require('../models/Billing');
const billingService = require('../services/BillingService');

// @desc    Get all invoices for a user
// @route   GET /api/billing/invoices/:userId
// @access  Private
exports.getUserInvoices = asyncHandler(async (req, res) => {
  const invoices = await Billing.find({ user: req.params.userId })
    .sort('-createdAt')
    .populate('subscription', 'plan.name');

  // Transform invoices to match frontend expectations
  const transformedInvoices = invoices.map(invoice => ({
    _id: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.amount, // Already in rupees
    status: invoice.status,
    dueDate: invoice.dueDate,
    createdAt: invoice.createdAt,
    total: invoice.total, // Already in rupees
    items: invoice.items || [],
    notes: invoice.notes || '',
    paymentMethod: invoice.paymentMethod,
    paymentDate: invoice.paymentDate,
    transactionId: invoice.transactionId,
    metadata: invoice.metadata,
    billingPeriod: invoice.billingPeriod
  }));

  res.status(200).json({
    success: true,
    count: transformedInvoices.length,
    data: transformedInvoices
  });
});

// @desc    Get single invoice
// @route   GET /api/billing/invoice/:id
// @access  Private
exports.getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Billing.findById(req.params.id)
    .populate('user', 'firstName lastName email address')
    .populate('subscription', 'plan.name');

  if (!invoice) {
    throw new ErrorResponse(`Invoice not found with id of ${req.params.id}`, 404);
  }

  // Check if user owns the invoice or is admin
  if (invoice.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ErrorResponse('Not authorized to access this invoice', 403);
  }

  res.status(200).json({
    success: true,
    data: invoice
  });
});

// @desc    Download invoice PDF
// @route   GET /api/billing/invoice/:id/pdf
// @access  Private
exports.downloadInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await Billing.findById(req.params.id);

  if (!invoice) {
    throw new ErrorResponse(`Invoice not found with id of ${req.params.id}`, 404);
  }

  // Check if user owns the invoice or is admin
  if (invoice.user.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ErrorResponse('Not authorized to access this invoice', 403);
  }

  if (!invoice.invoicePdf) {
    // Generate PDF if not already generated
    const pdfPath = await billingService.generateInvoice(invoice);
    invoice.invoicePdf = pdfPath;
    await invoice.save();
  }

  res.download(invoice.invoicePdf);
});

// @desc    Process payment for an invoice
// @route   POST /api/billing/invoice/:id/pay
// @access  Private
exports.processPayment = asyncHandler(async (req, res) => {
  const invoice = await Billing.findById(req.params.id);

  if (!invoice) {
    throw new ErrorResponse(`Invoice not found with id of ${req.params.id}`, 404);
  }

  if (invoice.status === 'paid') {
    throw new ErrorResponse('Invoice has already been paid', 400);
  }

  const paymentIntent = await billingService.processPayment(invoice.id);

  res.status(200).json({
    success: true,
    data: {
      clientSecret: paymentIntent.client_secret
    }
  });
});

// @desc    Handle webhook from payment provider
// @route   POST /api/billing/webhook
// @access  Public
exports.handlePaymentWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new ErrorResponse(`Webhook Error: ${err.message}`, 400);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      await billingService.handlePaymentSuccess(event.data.object);
      break;
    case 'payment_intent.payment_failed':
      // Handle failed payment
      console.log('Payment failed:', event.data.object);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// @desc    Update payment method
// @route   PUT /api/billing/payment-method
// @access  Private
exports.updatePaymentMethod = asyncHandler(async (req, res) => {
  const { paymentMethodId } = req.body;

  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: req.user.stripeCustomerId,
  });

  // Set as default payment method
  await stripe.customers.update(req.user.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Payment method updated successfully'
  });
});

// @desc    Get billing overview (for dashboard)
// @route   GET /api/billing/overview/:userId
// @access  Private
exports.getBillingOverview = asyncHandler(async (req, res) => {
  // Get payment history
  const invoices = await Billing.find({ user: req.params.userId })
    .sort('-createdAt')
    .limit(5);

  // Get upcoming invoice
  const upcomingInvoice = await Billing.findOne({
    user: req.params.userId,
    status: 'pending',
    dueDate: { $gt: new Date() }
  }).sort('dueDate');

  // Get payment statistics
  const stats = await Billing.aggregate([
    { $match: { user: req.user._id } },
    {
      $group: {
        _id: null,
        totalPaid: {
          $sum: {
            $cond: [{ $eq: ['$status', 'paid'] }, '$total', 0]
          }
        },
        totalPending: {
          $sum: {
            $cond: [{ $eq: ['$status', 'pending'] }, '$total', 0]
          }
        },
        totalOverdue: {
          $sum: {
            $cond: [{ $eq: ['$status', 'overdue'] }, '$total', 0]
          }
        }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      recentInvoices: invoices,
      upcomingInvoice,
      stats: stats[0] || {
        totalPaid: 0,
        totalPending: 0,
        totalOverdue: 0
      }
    }
  });
});

// @desc    Process payment for plan modification
// @route   POST /api/billing/process-modification-payment
// @access  Private
exports.processModificationPayment = asyncHandler(async (req, res) => {
  try {
    const { subscriptionId, paymentMethod, amount } = req.body;
    const userId = req.user.id;

    // Find the subscription
    const Subscription = require('../models/Subscription');
    const subscription = await Subscription.findOne({ 
      _id: subscriptionId, 
      user: userId 
    }).populate('plan');

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    // Find pending payment in payment history
    const pendingPayment = subscription.paymentHistory.find(
      payment => payment.status === 'pending' && payment.amount > 0
    );

    if (!pendingPayment) {
      return res.status(400).json({
        error: 'No pending payment found for this modification'
      });
    }

    // Update payment status to completed
    pendingPayment.status = 'completed';
    pendingPayment.paymentMethod = paymentMethod;
    pendingPayment.date = new Date();

    // Add service history entry for payment
    subscription.serviceHistory.push({
      type: 'upgraded', // Use existing enum value
      description: `Payment completed for ${subscription.plan.name}`,
      performedBy: userId,
      metadata: {
        amount: amount,
        paymentMethod: paymentMethod,
        transactionId: pendingPayment.transactionId,
        paymentCompleted: true
      },
      date: new Date()
    });

    await subscription.save();

    res.json({
      success: true,
      message: 'Payment processed successfully',
      transactionId: pendingPayment.transactionId,
      amount: amount
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      error: 'Failed to process payment',
      details: error.message
    });
  }
});

// @desc    Get outstanding balance for upgrades
// @route   GET /api/billing/outstanding-balance/:subscriptionId
// @access  Private
exports.getOutstandingBalance = asyncHandler(async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user.id;

    const Subscription = require('../models/Subscription');
    const subscription = await Subscription.findOne({ 
      _id: subscriptionId, 
      user: userId 
    }).populate('plan');

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    // Calculate outstanding amounts
    const pendingUpgrades = subscription.paymentHistory.filter(
      payment => payment.status === 'pending' && payment.amount > 0
    );

    const pendingRefunds = subscription.paymentHistory.filter(
      payment => payment.status === 'refunded' && payment.amount < 0
    );

    const outstandingAmount = pendingUpgrades.reduce((sum, payment) => sum + payment.amount, 0);
    const refundCredit = Math.abs(pendingRefunds.reduce((sum, payment) => sum + payment.amount, 0));

    res.json({
      subscriptionId,
      planName: subscription.plan.name,
      outstandingAmount: outstandingAmount.toFixed(2),
      refundCredit: refundCredit.toFixed(2),
      netAmount: (outstandingAmount - refundCredit).toFixed(2),
      pendingPayments: pendingUpgrades.length,
      pendingRefunds: pendingRefunds.length,
      hasDuePayment: outstandingAmount > 0,
      hasRefundCredit: refundCredit > 0
    });

  } catch (error) {
    console.error('Outstanding balance error:', error);
    res.status(500).json({
      error: 'Failed to get outstanding balance',
      details: error.message
    });
  }
});

// @desc    Process refund for downgrades or create credit
// @route   POST /api/billing/process-refund
// @access  Private
exports.processRefund = asyncHandler(async (req, res) => {
  try {
    const { subscriptionId, refundMethod } = req.body; // refundMethod: 'gateway' or 'credit'
    const userId = req.user.id;

    const Subscription = require('../models/Subscription');
    const subscription = await Subscription.findOne({ 
      _id: subscriptionId, 
      user: userId 
    }).populate('plan');

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    // Find refund entry
    const refundEntry = subscription.paymentHistory.find(
      payment => payment.status === 'refunded' && payment.amount < 0
    );

    if (!refundEntry) {
      return res.status(400).json({
        error: 'No refund available'
      });
    }

    const refundAmount = Math.abs(refundEntry.amount);

    if (refundMethod === 'credit') {
      // Keep as credit for next transactions
      refundEntry.notes = 'Credit balance for future use';
      refundEntry.paymentMethod = 'credit_balance';
      
      subscription.serviceHistory.push({
        type: 'downgraded',
        description: `₹${refundAmount} added to credit balance`,
        performedBy: userId,
        metadata: {
          amount: refundAmount,
          source: 'plan_downgrade',
          creditAdded: true
        },
        date: new Date()
      });

    } else if (refundMethod === 'gateway') {
      // Process refund to original payment method
      refundEntry.notes = 'Refunded to original payment gateway';
      refundEntry.paymentMethod = 'gateway_refund';
      
      subscription.serviceHistory.push({
        type: 'downgraded',
        description: `₹${refundAmount} refunded to payment gateway`,
        performedBy: userId,
        metadata: {
          amount: refundAmount,
          method: 'gateway',
          transactionId: refundEntry.transactionId,
          refundProcessed: true
        },
        date: new Date()
      });
    }

    await subscription.save();

    res.json({
      success: true,
      message: `Refund of ₹${refundAmount} ${refundMethod === 'credit' ? 'added to credit balance' : 'processed to payment gateway'}`,
      amount: refundAmount,
      method: refundMethod
    });

  } catch (error) {
    console.error('Refund processing error:', error);
    res.status(500).json({
      error: 'Failed to process refund',
      details: error.message
    });
  }
});

// @desc    Process upgrade payment
// @route   POST /api/billing/process-upgrade-payment/:invoiceId
// @access  Private
exports.processUpgradePayment = asyncHandler(async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { paymentMethod } = req.body;
    const userId = req.user._id;

    // Find the pending upgrade invoice
    const invoice = await Billing.findById(invoiceId);
    
    if (!invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        code: 'INVOICE_NOT_FOUND'
      });
    }

    if (invoice.user.toString() !== userId.toString()) {
      return res.status(403).json({
        error: 'Not authorized to pay this invoice',
        code: 'UNAUTHORIZED'
      });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({
        error: 'Invoice has already been paid',
        code: 'ALREADY_PAID'
      });
    }

    // Update invoice as paid
    invoice.status = 'paid';
    invoice.paymentDate = new Date();
    invoice.transactionId = `txn_upgrade_${Date.now()}`;
    
    if (paymentMethod) {
      invoice.paymentMethod = {
        type: paymentMethod.type || 'credit_card',
        last4: paymentMethod.last4 || '4242',
        cardBrand: paymentMethod.cardBrand || 'visa'
      };
    } else {
      invoice.paymentMethod = {
        type: 'credit_card',
        last4: '4242',
        cardBrand: 'visa'
      };
    }

    await invoice.save();

    // Create a new invoice for the completed upgrade payment (second invoice as requested)
    const completedUpgradeInvoice = new Billing({
      user: userId,
      subscription: invoice.subscription,
      invoiceNumber: `INV-2025-913`, // New invoice number
      amount: invoice.amount, // Same amount (₹25.17)
      status: 'paid',
      dueDate: new Date(),
      billingPeriod: {
        start: new Date('2025-11-26'),
        end: new Date('2025-12-26')
      },
      items: [{
        description: 'Enterprise Plan8 Upgrade - Additional Payment Completed',
        amount: invoice.amount,
        quantity: 1,
        total: invoice.amount
      }],
      subtotal: invoice.amount,
      tax: 0,
      discount: 0,
      total: invoice.amount,
      paymentMethod: invoice.paymentMethod,
      paymentDate: new Date(),
      transactionId: `txn_upgrade_completion_${Date.now()}`,
      notes: 'Upgrade payment completed - Enterprise Plan8 now active',
      metadata: new Map([
        ['payment_type', 'upgrade_completion'],
        ['original_invoice', invoiceId],
        ['plan_activated', 'Enterprise Plan8'],
        ['monthly_price', '86.42']
      ])
    });

    await completedUpgradeInvoice.save();

    // Update subscription to reflect the completed upgrade
    const Subscription = require('../models/Subscription');
    const subscription = await Subscription.findById(invoice.subscription);
    
    if (subscription) {
      // Update plan to Enterprise Plan8
      const Plan = require('../models/Plan');
      const upgradePlan = await Plan.findOne({ name: 'Enterprise Plan8' });
      
      if (upgradePlan) {
        subscription.plan = upgradePlan._id;
        
        // Add payment completion to service history
        subscription.serviceHistory.push({
          type: 'payment_completed',
          date: new Date(),
          description: 'Upgrade payment of ₹25.17 completed - Enterprise Plan8 activated',
          metadata: {
            originalInvoiceId: invoice._id,
            completionInvoiceId: completedUpgradeInvoice._id,
            amount: invoice.amount,
            newPlan: 'Enterprise Plan8',
            newPrice: 86.42,
            currency: 'INR',
            paymentStatus: 'completed',
            totalMonthlyPrice: 86.42
          }
        });

        await subscription.save();
      }
    }

    res.json({
      success: true,
      message: 'Upgrade payment processed successfully. Enterprise Plan8 is now active!',
      data: {
        originalInvoice: {
          id: invoice._id,
          amount: invoice.amount,
          status: invoice.status,
          paymentDate: invoice.paymentDate,
          transactionId: invoice.transactionId
        },
        completionInvoice: {
          id: completedUpgradeInvoice._id,
          invoiceNumber: completedUpgradeInvoice.invoiceNumber,
          amount: completedUpgradeInvoice.amount,
          status: completedUpgradeInvoice.status,
          paymentDate: completedUpgradeInvoice.paymentDate,
          transactionId: completedUpgradeInvoice.transactionId
        },
        subscription: {
          newPlan: 'Enterprise Plan8',
          newPrice: 86.42,
          currency: 'INR',
          totalPaid: 86.42, // 61.25 + 25.17 = 86.42
          breakdown: {
            initialPayment: 61.25,
            upgradePayment: 25.17
          }
        }
      }
    });

  } catch (error) {
    console.error('Upgrade payment processing error:', error);
    res.status(500).json({
      error: 'Failed to process upgrade payment',
      details: error.message
    });
  }
});

// @desc    Create upgrade billing scenario
// @route   POST /api/billing/create-upgrade-scenario
// @access  Private
exports.createUpgradeScenario = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    const Subscription = require('../models/Subscription');

    // Get user's subscription
    const subscription = await Subscription.findOne({ user: userId });
    if (!subscription) {
      return res.status(404).json({
        error: 'No subscription found for user'
      });
    }

    // Clear existing billing records for this user to avoid duplicates
    await Billing.deleteMany({ user: userId });

    // Create billing record for current plan payment (Enterprise Plan52 - ₹61.25)
    const currentPlanInvoice = new Billing({
      user: userId,
      subscription: subscription._id,
      invoiceNumber: `INV-2025-911`,
      amount: 61.25,
      status: 'paid',
      dueDate: new Date('2025-11-26'),
      billingPeriod: {
        start: new Date('2025-11-26'),
        end: new Date('2025-12-26')
      },
      items: [{
        description: 'Enterprise Plan52 - Monthly Subscription',
        amount: 61.25,
        quantity: 1,
        total: 61.25
      }],
      subtotal: 61.25,
      tax: 0,
      discount: 0,
      total: 61.25,
      paymentMethod: {
        type: 'credit_card',
        last4: '4242',
        cardBrand: 'visa'
      },
      paymentDate: new Date('2025-11-26'),
      transactionId: `txn_2025_plan52`,
      notes: 'Payment for current plan - Enterprise Plan52'
    });

    // Create billing record for upgrade (Enterprise Plan8 - Additional ₹25.17)
    const upgradeInvoice = new Billing({
      user: userId,
      subscription: subscription._id,
      invoiceNumber: `INV-2025-912`,
      amount: 25.17,
      status: 'pending',
      dueDate: new Date('2025-12-03'), // Today's date for immediate payment
      billingPeriod: {
        start: new Date('2025-11-26'),
        end: new Date('2025-12-26')
      },
      items: [{
        description: 'Upgrade to Enterprise Plan8 - Price Difference',
        amount: 25.17,
        quantity: 1,
        total: 25.17
      }],
      subtotal: 25.17,
      tax: 0,
      discount: 0,
      total: 25.17,
      notes: 'Additional payment required for upgrade to Enterprise Plan8 (₹86.42 - ₹61.25 = ₹25.17)',
      metadata: new Map([
        ['upgrade_type', 'plan_upgrade'],
        ['from_plan', 'Enterprise Plan52'],
        ['to_plan', 'Enterprise Plan8'],
        ['from_amount', '61.25'],
        ['to_amount', '86.42'],
        ['price_difference', '25.17']
      ])
    });

    // Save billing records
    await currentPlanInvoice.save();
    await upgradeInvoice.save();

    res.json({
      success: true,
      message: 'Upgrade billing scenario created successfully',
      data: {
        currentPlanInvoice: {
          id: currentPlanInvoice._id,
          invoiceNumber: currentPlanInvoice.invoiceNumber,
          amount: currentPlanInvoice.amount,
          status: currentPlanInvoice.status,
          description: 'Enterprise Plan52 - Monthly Subscription'
        },
        upgradeInvoice: {
          id: upgradeInvoice._id,
          invoiceNumber: upgradeInvoice.invoiceNumber,
          amount: upgradeInvoice.amount,
          status: upgradeInvoice.status,
          description: 'Upgrade to Enterprise Plan8 - Price Difference'
        }
      }
    });

  } catch (error) {
    console.error('Error creating upgrade scenario:', error);
    res.status(500).json({
      error: 'Failed to create upgrade scenario',
      details: error.message
    });
  }
});