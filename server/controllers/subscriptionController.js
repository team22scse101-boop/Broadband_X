const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');

// @desc    Create subscription
// @route   POST /api/subscriptions
// @access  Private
const createSubscription = asyncHandler(async (req, res) => {
  const {
    planId,
    billingCycle = 'monthly',
    installationAddress,
    startDate,
    discountCode
  } = req.body;

  // Check if user already has an active subscription
  const existingSubscription = await Subscription.findActiveByUser(req.user._id);
  if (existingSubscription) {
    return res.status(400).json({
      status: 'error',
      message: 'You already have an active subscription. Please upgrade/downgrade instead.'
    });
  }

  // Get plan details
  const plan = await Plan.findById(planId);
  if (!plan || plan.status !== 'active') {
    return res.status(404).json({
      status: 'error',
      message: 'Plan not found or not available'
    });
  }

  // Calculate pricing
  const basePrice = billingCycle === 'yearly' ? plan.pricing.yearly : plan.pricing.monthly;
  let finalPrice = basePrice;
  let discountApplied = 0;

  // Apply discount if provided
  if (discountCode) {
    // Discount logic would go here
    // For now, just apply a sample 10% discount
    discountApplied = basePrice * 0.1;
    finalPrice = basePrice - discountApplied;
  }

  // Calculate dates — monthly plans are always exactly 30 days
  const subscriptionStartDate = startDate ? new Date(startDate) : new Date();
  const endDate = new Date(subscriptionStartDate);
  if (billingCycle === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setDate(endDate.getDate() + 30); // 30-day billing cycle
  }

  // Calculate tax (example: 8% tax)
  const taxAmount = finalPrice * 0.08;
  const totalAmount = finalPrice + taxAmount;

  // Create subscription directly
  const subscription = await Subscription.create({
    user: req.user._id,
    plan: planId,
    status: 'active',
    startDate: subscriptionStartDate,
    endDate,
    billingCycle,
    pricing: {
      basePrice,
      discountApplied,
      finalPrice,
      currency: plan.pricing.currency,
      taxAmount,
      totalAmount
    },
    installation: {
      address: installationAddress || req.user.address
    }
  });

  await subscription.addServiceHistory(
    'activated',
    'Subscription activated',
    req.user._id,
    { planName: plan.name, billingCycle }
  );

  subscription.paymentHistory.push({
    date: new Date(),
    amount: totalAmount,
    paymentMethod: 'direct',
    status: 'completed',
    transactionId: `sub-${Date.now()}`
  });
  await subscription.save();

  await subscription.populate('plan user');

  res.status(201).json({
    status: 'success',
    message: 'Subscription activated successfully',
    data: {
      subscription
    }
  });
});

// @desc    Get user subscriptions
// @route   GET /api/subscriptions/my-subscriptions
// @access  Private
const getUserSubscriptions = asyncHandler(async (req, res) => {
  const { status = 'active', page = 1, limit = 10 } = req.query;

  // Default filter to only show active subscriptions
  const filter = { user: req.user._id, status: 'active' };
  if (status && status !== 'active') {
    filter.status = status; // Allow other statuses if explicitly requested
  }

  const subscriptions = await Subscription.find(filter)
    .populate('plan')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Subscription.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    data: {
      subscriptions,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    }
  });
});

// @desc    Get subscription by ID
// @route   GET /api/subscriptions/:id
// @access  Private
const getSubscriptionById = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id)
    .populate('plan user', '-password')
    .populate('serviceHistory.performedBy', 'firstName lastName')
    .populate('customerNotes.addedBy', 'firstName lastName');

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      subscription
    }
  });
});

// @desc    Update subscription (Admin only)
// @route   PUT /api/subscriptions/:id
// @access  Private/Admin
const updateSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  const updatedSubscription = await Subscription.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate('plan user');

  // Add service history
  await updatedSubscription.addServiceHistory(
    'updated',
    'Subscription updated by admin',
    req.user._id,
    req.body
  );

  res.status(200).json({
    status: 'success',
    message: 'Subscription updated successfully',
    data: {
      subscription: updatedSubscription
    }
  });
});

// @desc    Cancel subscription
// @route   PUT /api/subscriptions/:id/cancel
// @access  Private
const cancelSubscription = asyncHandler(async (req, res) => {
  const { reason, effectiveDate } = req.body;

  const subscription = await Subscription.findById(req.params.id).populate('plan');

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  if (subscription.status === 'cancelled') {
    return res.status(400).json({
      status: 'error',
      message: 'Subscription is already cancelled'
    });
  }

  // Calculate cancellation date
  const cancellationDate = effectiveDate ? new Date(effectiveDate) : new Date();
  
  // Check if refund is eligible (within 30 days and less than 10% usage)
  const daysSinceStart = Math.floor((Date.now() - subscription.startDate) / (1000 * 60 * 60 * 24));
  const isRefundEligible = daysSinceStart <= 30 && subscription.currentUsagePercentage < 10;

  // Update subscription
  subscription.status = 'cancelled';
  subscription.cancellation = {
    requestDate: new Date(),
    effectiveDate: cancellationDate,
    reason,
    requestedBy: req.user._id,
    refundEligible: isRefundEligible,
    refundAmount: isRefundEligible ? subscription.pricing.totalAmount : 0
  };

  await subscription.save();

  // Add service history
  await subscription.addServiceHistory(
    'cancelled',
    `Subscription cancelled. Reason: ${reason}`,
    req.user._id,
    { refundEligible: isRefundEligible }
  );

  // Emit real-time event for subscription cancellation
  if (global.realTimeEvents) {
    global.realTimeEvents.subscriptionCancelled(req.user._id.toString(), subscription);
  }

  res.status(200).json({
    status: 'success',
    message: 'Subscription cancelled successfully',
    data: {
      subscription,
      refundEligible: isRefundEligible
    }
  });
});

// @desc    Upgrade plan
// @route   PUT /api/subscriptions/:id/upgrade
// @access  Private
const upgradePlan = asyncHandler(async (req, res) => {
  const { newPlanId } = req.body;

  const subscription = await Subscription.findById(req.params.id).populate('plan');
  const newPlan = await Plan.findById(newPlanId);

  if (!subscription || !newPlan) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription or new plan not found'
    });
  }

  if (subscription.status !== 'active') {
    return res.status(400).json({
      status: 'error',
      message: 'Can only upgrade active subscriptions'
    });
  }

  // Check if it's actually an upgrade
  if (newPlan.pricing.monthly <= subscription.plan.pricing.monthly) {
    return res.status(400).json({
      status: 'error',
      message: 'New plan must be higher tier than current plan'
    });
  }

  // Calculate prorated pricing
  const remainingDays = subscription.daysRemaining;
  const totalDays = subscription.billingCycle === 'yearly' ? 365 : 30;
  const proratedCredit = (subscription.pricing.finalPrice / totalDays) * remainingDays;
  
  const newPrice = subscription.billingCycle === 'yearly' ? newPlan.pricing.yearly : newPlan.pricing.monthly;
  const proratedNewPrice = (newPrice / totalDays) * remainingDays;
  const additionalCost = proratedNewPrice - proratedCredit;

  // Store old plan for history
  const oldPlan = subscription.plan;

  // Update subscription
  subscription.plan = newPlanId;
  subscription.pricing.basePrice = newPrice;
  subscription.pricing.finalPrice = newPrice;
  subscription.pricing.taxAmount = 0; // NO TAX POLICY
  subscription.pricing.totalAmount = newPrice;

  await subscription.save();

  // Add service history
  await subscription.addServiceHistory(
    'upgraded',
    `Plan upgraded from ${oldPlan.name} to ${newPlan.name}`,
    req.user._id,
    { 
      oldPlan: oldPlan.name, 
      newPlan: newPlan.name,
      additionalCost 
    }
  );

  await subscription.populate('plan');

  // Emit real-time event for subscription upgrade
  if (global.realTimeEvents) {
    global.realTimeEvents.subscriptionModified(req.user._id.toString(), subscription, {
      type: 'upgrade',
      oldPlan: oldPlan.name,
      newPlan: newPlan.name,
      additionalCost
    });
    
    // Also emit billing update for immediate UI refresh
    global.realTimeEvents.billingUpdated(req.user._id.toString(), {
      subscription,
      planChanged: true,
      oldPlan: oldPlan.name,
      newPlan: newPlan.name
    });
  }

  res.status(200).json({
    status: 'success',
    message: 'Plan upgraded successfully',
    data: {
      subscription,
      additionalCost
    }
  });
});

// @desc    Downgrade plan
// @route   PUT /api/subscriptions/:id/downgrade
// @access  Private
const downgradePlan = asyncHandler(async (req, res) => {
  const { newPlanId, effectiveDate } = req.body;

  const subscription = await Subscription.findById(req.params.id).populate('plan');
  const newPlan = await Plan.findById(newPlanId);

  if (!subscription || !newPlan) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription or new plan not found'
    });
  }

  // Check if it's actually a downgrade
  if (newPlan.pricing.monthly >= subscription.plan.pricing.monthly) {
    return res.status(400).json({
      status: 'error',
      message: 'New plan must be lower tier than current plan'
    });
  }

  // Downgrade takes effect at next billing cycle unless immediate
  const downgradeDate = effectiveDate ? new Date(effectiveDate) : subscription.endDate;
  
  // Store downgrade request
  const oldPlan = subscription.plan;
  
  if (downgradeDate > new Date()) {
    // Schedule downgrade for future
    subscription.serviceHistory.push({
      type: 'downgrade',
      description: `Downgrade scheduled from ${oldPlan.name} to ${newPlan.name}`,
      performedBy: req.user._id,
      metadata: { 
        oldPlan: oldPlan.name, 
        newPlan: newPlan.name,
        effectiveDate: downgradeDate,
        scheduled: true
      }
    });
    
    await subscription.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Downgrade scheduled for next billing cycle',
      data: {
        subscription,
        effectiveDate: downgradeDate
      }
    });
  } else {
    // Immediate downgrade
    subscription.plan = newPlanId;
    subscription.pricing.basePrice = subscription.billingCycle === 'yearly' ? newPlan.pricing.yearly : newPlan.pricing.monthly;
    subscription.pricing.finalPrice = subscription.pricing.basePrice;
    subscription.pricing.taxAmount = 0; // NO TAX POLICY
    subscription.pricing.totalAmount = subscription.pricing.basePrice;

    await subscription.save();

    // Add service history
    await subscription.addServiceHistory(
      'downgraded',
      `Plan downgraded from ${oldPlan.name} to ${newPlan.name}`,
      req.user._id,
      { oldPlan: oldPlan.name, newPlan: newPlan.name }
    );

    await subscription.populate('plan');

    res.status(200).json({
      status: 'success',
      message: 'Plan downgraded successfully',
      data: {
        subscription
      }
    });
  }
});

// @desc    Renew subscription
// @route   PUT /api/subscriptions/:id/renew
// @access  Private
const renewSubscription = asyncHandler(async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id } = req.body;

  const subscription = await Subscription.findById(req.params.id).populate('plan');

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  if (subscription.status !== 'active' && subscription.status !== 'expired') {
    return res.status(400).json({
      status: 'error',
      message: 'Can only renew active or expired subscriptions'
    });
  }

  if (!razorpay_payment_id) {
    return res.status(400).json({
      status: 'error',
      message: 'Payment is required for renewal. Please complete Razorpay payment.'
    });
  }

  // Calculate new end date: current endDate + 30 days (monthly)
  const currentEndDate = new Date(subscription.endDate);
  const newEndDate = new Date(currentEndDate);
  if (subscription.billingCycle === 'yearly') {
    newEndDate.setFullYear(newEndDate.getFullYear() + 1);
  } else {
    newEndDate.setDate(newEndDate.getDate() + 30); // 30-day billing cycle
  }

  // Update subscription
  subscription.endDate = newEndDate;
  subscription.status = 'active';
  subscription.autoRenewal.nextRenewalDate = newEndDate;

  // Add payment record with Razorpay details
  const invoiceNumber = `INV-REN-${Date.now()}`;
  const paymentAmount = subscription.pricing?.totalAmount || subscription.pricing?.finalPrice || 0;

  subscription.paymentHistory.push({
    date: new Date(),
    amount: paymentAmount,
    paymentMethod: 'razorpay',
    transactionId: razorpay_payment_id,
    status: 'completed',
    invoiceNumber: invoiceNumber
  });

  await subscription.save();

  // Add service history
  await subscription.addServiceHistory(
    'renewed',
    `Subscription renewed via Razorpay (${razorpay_payment_id}). New expiry: ${newEndDate.toLocaleDateString('en-IN')}`,
    req.user._id,
    { newEndDate, paymentId: razorpay_payment_id }
  );

  // Create a Billing invoice record
  try {
    const Billing = require('../models/Billing');
    const billing = new Billing({
      user: subscription.user,
      subscription: subscription._id,
      amount: paymentAmount,
      items: [{
        description: `${subscription.plan?.name || 'Plan'} - Monthly Renewal`,
        amount: paymentAmount,
        quantity: 1,
        total: paymentAmount
      }],
      subtotal: paymentAmount,
      tax: 0,
      total: paymentAmount,
      status: 'paid',
      paymentMethod: {
        type: 'other',
        last4: 'RZPY'
      },
      transactionId: razorpay_payment_id,
      paymentDate: new Date(),
      dueDate: newEndDate,
      billingPeriod: {
        start: currentEndDate,
        end: newEndDate
      },
      notes: `Renewal payment via Razorpay. Payment ID: ${razorpay_payment_id}`
    });
    await billing.save();
    console.log('✅ Billing invoice created for renewal:', billing.invoiceNumber);
  } catch (billingErr) {
    console.error('⚠️ Failed to create billing record (non-fatal):', billingErr.message);
  }

  res.status(200).json({
    status: 'success',
    message: 'Subscription renewed successfully',
    data: {
      subscription,
      newEndDate,
      paymentId: razorpay_payment_id
    }
  });
});

// @desc    Pause subscription
// @route   PUT /api/subscriptions/:id/pause
// @access  Private
const pauseSubscription = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  if (subscription.status !== 'active') {
    return res.status(400).json({
      status: 'error',
      message: 'Can only pause active subscriptions'
    });
  }

  subscription.status = 'suspended';
  await subscription.save();

  // Add service history
  await subscription.addServiceHistory(
    'suspended',
    `Subscription paused. Reason: ${reason || 'User request'}`,
    req.user._id,
    { reason }
  );

  res.status(200).json({
    status: 'success',
    message: 'Subscription paused successfully',
    data: {
      subscription
    }
  });
});

// @desc    Resume subscription
// @route   PUT /api/subscriptions/:id/resume
// @access  Private
const resumeSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  if (subscription.status !== 'suspended') {
    return res.status(400).json({
      status: 'error',
      message: 'Can only resume suspended subscriptions'
    });
  }

  subscription.status = 'active';
  await subscription.save();

  // Add service history
  await subscription.addServiceHistory(
    'resumed',
    'Subscription resumed',
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    message: 'Subscription resumed successfully',
    data: {
      subscription
    }
  });
});

// @desc    Get subscription usage
// @route   GET /api/subscriptions/:id/usage
// @access  Private
const getSubscriptionUsage = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id).populate('plan');

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  const usageData = {
    currentMonth: subscription.usage.currentMonth,
    history: subscription.usage.history,
    usagePercentage: subscription.currentUsagePercentage,
    planLimit: subscription.plan.features.dataLimit.unlimited ? 'Unlimited' : 
               `${subscription.plan.features.dataLimit.amount} ${subscription.plan.features.dataLimit.unit}`
  };

  res.status(200).json({
    status: 'success',
    data: {
      usage: usageData
    }
  });
});

// @desc    Update usage (Admin only)
// @route   PUT /api/subscriptions/:id/usage
// @access  Private/Admin
const updateUsage = asyncHandler(async (req, res) => {
  const { dataUsed, month, year } = req.body;
  
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  // Update current month or add to history
  if (month && year) {
    // Update historical data
    const existingRecord = subscription.usage.history.find(
      record => record.month === month && record.year === year
    );
    
    if (existingRecord) {
      existingRecord.dataUsed = dataUsed;
    } else {
      subscription.usage.history.push({ month, year, dataUsed });
    }
  } else {
    // Update current month
    subscription.usage.currentMonth.dataUsed = dataUsed;
    subscription.usage.currentMonth.lastUpdated = new Date();
  }

  await subscription.save();

  res.status(200).json({
    status: 'success',
    message: 'Usage updated successfully',
    data: {
      subscription
    }
  });
});

// @desc    Schedule installation
// @route   POST /api/subscriptions/:id/schedule-installation
// @access  Private
const scheduleInstallation = asyncHandler(async (req, res) => {
  const { scheduledDate, address, instructions } = req.body;
  
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  subscription.installation = {
    ...subscription.installation,
    scheduled: true,
    scheduledDate: new Date(scheduledDate),
    address: address || subscription.installation.address,
    instructions
  };

  await subscription.save();

  // Add service history
  await subscription.addServiceHistory(
    'installation-scheduled',
    `Installation scheduled for ${scheduledDate}`,
    req.user._id,
    { scheduledDate, address }
  );

  res.status(200).json({
    status: 'success',
    message: 'Installation scheduled successfully',
    data: {
      installation: subscription.installation
    }
  });
});

// @desc    Add payment
// @route   POST /api/subscriptions/:id/payment
// @access  Private
const addPayment = asyncHandler(async (req, res) => {
  const { amount, paymentMethod, transactionId } = req.body;
  
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  const payment = {
    date: new Date(),
    amount,
    paymentMethod,
    transactionId,
    status: 'completed',
    invoiceNumber: `INV-${Date.now()}`
  };

  subscription.paymentHistory.push(payment);
  await subscription.save();

  res.status(201).json({
    status: 'success',
    message: 'Payment added successfully',
    data: {
      payment
    }
  });
});

// @desc    Get payment history
// @route   GET /api/subscriptions/:id/payments
// @access  Private
const getPaymentHistory = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      payments: subscription.paymentHistory
    }
  });
});

// @desc    Activate pending subscription (Admin only)
// @route   PUT /api/admin/subscriptions/:id/activate
// @access  Private/Admin
const activateSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id).populate('plan user');

  if (!subscription) {
    return res.status(404).json({
      status: 'error',
      message: 'Subscription not found'
    });
  }

  if (subscription.status !== 'pending') {
    return res.status(400).json({
      status: 'error',
      message: `Cannot activate subscription with status: ${subscription.status}. Only pending subscriptions can be activated.`
    });
  }

  // Activate the subscription
  subscription.status = 'active';
  subscription.startDate = new Date();

  // Add payment record to indicate manual activation
  subscription.paymentHistory.push({
    date: new Date(),
    amount: subscription.pricing.totalAmount,
    paymentMethod: 'manual-activation',
    status: 'completed',
    transactionId: `manual-${Date.now()}`
  });

  await subscription.save();

  // Add service history
  await subscription.addServiceHistory(
    'activated',
    'Subscription manually activated by admin',
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    message: 'Subscription activated successfully',
    data: {
      subscription
    }
  });
});

// @desc    Get subscription plan history
// @route   GET /api/subscriptions/plan-history
// @access  Private
const getPlanHistory = asyncHandler(async (req, res) => {
  try {
    // Get user's current and past subscriptions with service history
    const subscriptions = await Subscription.find({ 
      user: req.user._id 
    })
    .populate('plan', 'name pricing features')
    .sort({ createdAt: 1 }); // Sort by creation date ascending

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({
        status: 'success',
        message: 'No subscription history found',
        data: { planHistory: [] }
      });
    }

    let planHistory = [];

    // Process each subscription's service history
    for (const subscription of subscriptions) {
      if (subscription.serviceHistory && subscription.serviceHistory.length > 0) {
        // Filter service history for plan-related changes
        const planChanges = subscription.serviceHistory.filter(history => 
          ['activated', 'upgraded', 'downgraded', 'created'].includes(history.type)
        );

        for (const change of planChanges) {
          let fromPlan = null;
          let toPlan = {
            _id: subscription.plan._id,
            name: subscription.plan.name,
            price: subscription.plan.pricing?.monthly ? Math.round(subscription.plan.pricing.monthly * 100) : 0,
            billingCycle: subscription.billingCycle || 'monthly',
            features: subscription.plan.features || [],
            dataLimit: subscription.plan.features?.dataLimit?.amount || 0,
            speedLimit: subscription.plan.features?.speed?.download || 0,
            status: 'active'
          };

          // If it's an upgrade or downgrade, try to get the old plan info from metadata
          if (['upgraded', 'downgraded'].includes(change.type) && change.metadata) {
            if (change.metadata.oldPlan) {
              // Try to find the old plan by name
              const oldPlan = await Plan.findOne({ name: change.metadata.oldPlan });
              if (oldPlan) {
                fromPlan = {
                  _id: oldPlan._id,
                  name: oldPlan.name,
                  price: oldPlan.pricing?.monthly ? Math.round(oldPlan.pricing.monthly * 100) : 0,
                  billingCycle: subscription.billingCycle || 'monthly',
                  features: oldPlan.features || [],
                  dataLimit: oldPlan.features?.dataLimit?.amount || 0,
                  speedLimit: oldPlan.features?.speed?.download || 0,
                  status: 'inactive'
                };
              } else {
                // Fallback: create a basic fromPlan object
                fromPlan = {
                  _id: 'unknown',
                  name: change.metadata.oldPlan,
                  price: 0,
                  billingCycle: subscription.billingCycle || 'monthly',
                  features: [],
                  dataLimit: 0,
                  speedLimit: 0,
                  status: 'inactive'
                };
              }
            }
          }

          // Add to plan history
          planHistory.push({
            _id: change._id || `${subscription._id}-${change.type}-${change.date}`,
            subscriptionId: subscription._id,
            fromPlan,
            toPlan,
            changeType: change.type,
            effectiveDate: change.date,
            createdAt: change.date,
            proration: change.metadata?.additionalCost ? {
              daysUsed: 0,
              daysTotal: subscription.billingCycle === 'yearly' ? 365 : 30,
              creditCents: 0,
              chargeCents: Math.round((change.metadata.additionalCost || 0) * 100)
            } : null
          });
        }
      }
    }

    // If we don't have detailed history, create a basic one from subscription data
    if (planHistory.length === 0 && subscriptions.length > 0) {
      let previousPlan = null;
      
      for (const subscription of subscriptions) {
        planHistory.push({
          _id: `basic-${subscription._id}`,
          subscriptionId: subscription._id,
          fromPlan: previousPlan,
          toPlan: {
            _id: subscription.plan._id,
            name: subscription.plan.name,
            price: subscription.plan.pricing?.monthly ? Math.round(subscription.plan.pricing.monthly * 100) : 0,
            billingCycle: subscription.billingCycle || 'monthly',
            features: subscription.plan.features || [],
            dataLimit: subscription.plan.features?.dataLimit?.amount || 0,
            speedLimit: subscription.plan.features?.speed?.download || 0,
            status: 'active'
          },
          changeType: previousPlan ? 'upgraded' : 'created',
          effectiveDate: subscription.startDate || subscription.createdAt,
          createdAt: subscription.createdAt
        });

        // Set this plan as previous for next iteration
        previousPlan = {
          _id: subscription.plan._id,
          name: subscription.plan.name,
          price: subscription.plan.pricing?.monthly ? Math.round(subscription.plan.pricing.monthly * 100) : 0,
          billingCycle: subscription.billingCycle || 'monthly',
          features: subscription.plan.features || [],
          dataLimit: subscription.plan.features?.dataLimit?.amount || 0,
          speedLimit: subscription.plan.features?.speed?.download || 0,
          status: 'inactive'
        };
      }
    }

    // Sort by date (most recent first)
    planHistory.sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));

    console.log('📋 Generated comprehensive plan history:', planHistory.length, 'entries');

    res.status(200).json({
      status: 'success',
      message: `Found ${planHistory.length} plan changes`,
      data: { planHistory }
    });

  } catch (error) {
    console.error('❌ Error fetching plan history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch plan history',
      error: error.message
    });
  }
});

module.exports = {
  createSubscription,
  getUserSubscriptions,
  getSubscriptionById,
  updateSubscription,
  cancelSubscription,
  upgradePlan,
  downgradePlan,
  renewSubscription,
  pauseSubscription,
  resumeSubscription,
  getSubscriptionUsage,
  updateUsage,
  scheduleInstallation,
  addPayment,
  getPaymentHistory,
  activateSubscription,
  getPlanHistory
};