const mongoose = require('mongoose');

const paymentFailureSchema = new mongoose.Schema({
  userId: { type: String, default: 'unknown' },
  userEmail: { type: String, default: 'unknown' },
  userName: { type: String, default: 'unknown' },
  amount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  planName: { type: String, default: 'unknown' },
  planId: { type: String, default: '' },
  errorCode: { type: String, default: 'unknown' },
  errorDescription: { type: String, default: 'Payment failed' },
  razorpayOrderId: { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },
  source: { type: String, enum: ['client', 'webhook', 'server'], default: 'client' },
  type: { type: String, enum: ['subscription', 'renewal', 'other'], default: 'subscription' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true // adds createdAt and updatedAt automatically
});

// Index for efficient queries
paymentFailureSchema.index({ createdAt: -1 });
paymentFailureSchema.index({ userEmail: 1 });
paymentFailureSchema.index({ type: 1 });

module.exports = mongoose.model('PaymentFailure', paymentFailureSchema);
