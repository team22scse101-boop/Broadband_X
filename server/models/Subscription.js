const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: [true, 'Plan is required']
  },
  status: {
    type: String,
    enum: ['active', 'grace_period', 'suspended', 'cancelled', 'expired'],
    default: 'active'
  },
  paymentFailures: {
    type: Number,
    default: 0,
    min: 0
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  gracePeriodEnd: {
    type: Date,
    default: null
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    required: [true, 'Billing cycle is required'],
    default: 'monthly'
  },
  pricing: {
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Base price cannot be negative']
    },
    discountApplied: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative']
    },
    finalPrice: {
      type: Number,
      required: [true, 'Final price is required'],
      min: [0, 'Final price cannot be negative']
    },
    currency: {
      type: String,
      default: 'USD'
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: [0, 'Tax amount cannot be negative']
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative']
    }
  },
  installation: {
    scheduled: { type: Boolean, default: false },
    scheduledDate: Date,
    completed: { type: Boolean, default: false },
    completedDate: Date,
    technician: {
      name: String,
      phone: String,
      notes: String
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      instructions: String
    }
  },
  usage: {
    currentMonth: {
      dataUsed: { type: Number, default: 0 }, // in GB
      lastUpdated: { type: Date, default: Date.now }
    },
    history: [{
      month: { type: Number, required: true }, // 1-12
      year: { type: Number, required: true },
      dataUsed: { type: Number, default: 0 }, // in GB
      averageSpeed: {
        download: Number,
        upload: Number
      },
      peakUsageHours: [String], // e.g., ["20:00", "21:00"]
      qualityMetrics: {
        uptime: { type: Number, default: 99.9 }, // percentage
        avgLatency: Number, // in ms
        speedConsistency: Number // percentage
      }
    }]
  },
  paymentHistory: [{
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    paymentMethod: String,
    transactionId: String,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      required: true
    },
    invoiceNumber: String,
    notes: String
  }],
  discounts: [{
    type: {
      type: String,
      enum: ['percentage', 'fixed', 'free-months'],
      required: true
    },
    value: { type: Number, required: true },
    description: String,
    validFrom: Date,
    validUntil: Date,
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String
  }],
  notifications: {
    dataUsageAlerts: {
      enabled: { type: Boolean, default: true },
      threshold: { type: Number, default: 80 }, // percentage
      lastAlert: Date
    },
    paymentReminders: {
      enabled: { type: Boolean, default: true },
      daysBefore: { type: Number, default: 3 }
    },
    serviceUpdates: {
      enabled: { type: Boolean, default: true }
    }
  },
  serviceHistory: [{
    date: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: ['created', 'activated', 'suspended', 'resumed', 'upgraded', 'downgraded', 'cancelled', 'expired', 'renewed'],
      required: true
    },
    description: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    metadata: mongoose.Schema.Types.Mixed // For storing additional data like old plan details
  }],
  autoRenewal: {
    enabled: { type: Boolean, default: false },
    nextRenewalDate: Date,
    paymentMethodId: String
  },
  cancellation: {
    requestDate: Date,
    effectiveDate: Date,
    reason: String,
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    feedback: String,
    refundEligible: { type: Boolean, default: false },
    refundAmount: Number
  },
  customerNotes: [{
    date: { type: Date, default: Date.now },
    note: { type: String, required: true },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['general', 'billing', 'technical', 'complaint', 'compliment'],
      default: 'general'
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for subscription duration
subscriptionSchema.virtual('duration').get(function () {
  if (this.startDate && this.endDate) {
    const diffTime = Math.abs(this.endDate - this.startDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // days
  }
  return 0;
});

// Virtual for days remaining
subscriptionSchema.virtual('daysRemaining').get(function () {
  if (this.endDate) {
    const diffTime = this.endDate - new Date();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }
  return 0;
});

// Virtual for current usage percentage
subscriptionSchema.virtual('currentUsagePercentage').get(function () {
  if (this.usage.currentMonth.dataUsed && this.plan && this.plan.features.dataLimit.amount) {
    return (this.usage.currentMonth.dataUsed / this.plan.features.dataLimit.amount) * 100;
  }
  return 0;
});

// Virtual for monthly savings
subscriptionSchema.virtual('monthlySavings').get(function () {
  return this.pricing.basePrice - this.pricing.finalPrice;
});

// Indexes for performance
subscriptionSchema.index({ user: 1 });
subscriptionSchema.index({ plan: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ startDate: 1 });
subscriptionSchema.index({ endDate: 1 });
subscriptionSchema.index({ billingCycle: 1 });
subscriptionSchema.index({ 'autoRenewal.nextRenewalDate': 1 });

// Compound indexes
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ status: 1, endDate: 1 });

// Pre-save middleware
subscriptionSchema.pre('save', function (next) {
  // Calculate total amount including tax
  if (this.pricing.finalPrice && this.pricing.taxAmount) {
    this.pricing.totalAmount = this.pricing.finalPrice + this.pricing.taxAmount;
  }

  // Auto-renewal is disabled by default — users renew manually
  // nextRenewalDate is kept as endDate for display purposes only
  if (this.endDate) {
    this.autoRenewal.nextRenewalDate = this.endDate;
  }

  next();
});

// Static method to get user's active subscription
subscriptionSchema.statics.findActiveByUser = function (userId) {
  return this.findOne({
    user: userId,
    status: 'active',
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  }).populate('plan user');
};

// Static method to get expiring subscriptions
subscriptionSchema.statics.findExpiring = function (days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    status: 'active',
    endDate: { $lte: futureDate, $gte: new Date() }
  }).populate('plan user');
};

// Static method to get subscription statistics
subscriptionSchema.statics.getSubscriptionStats = function () {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$pricing.totalAmount' }
      }
    }
  ]);
};

// Method to calculate next bill date
subscriptionSchema.methods.getNextBillDate = function () {
  if (!this.autoRenewal.enabled) return null;
  // endDate is always the correct next billing date
  return this.endDate || null;
};

// Method to add service history entry
subscriptionSchema.methods.addServiceHistory = function (type, description, performedBy, metadata = {}) {
  this.serviceHistory.push({
    type,
    description,
    performedBy,
    metadata
  });
  return this.save();
};

// Method to add customer note
subscriptionSchema.methods.addCustomerNote = function (note, addedBy, type = 'general') {
  this.customerNotes.push({
    note,
    addedBy,
    type
  });
  return this.save();
};

// Method to check if subscription is expiring soon
subscriptionSchema.methods.isExpiringSoon = function (days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  return this.endDate <= futureDate && this.endDate >= new Date();
};

module.exports = mongoose.model('Subscription', subscriptionSchema);