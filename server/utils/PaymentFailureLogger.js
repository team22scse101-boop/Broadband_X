/**
 * Payment Failure Logger
 * Logs payment failures to MongoDB (persistent) and CSV (for download).
 * MongoDB is the source of truth. CSV is regenerated on-demand for exports.
 */

const fs = require('fs');
const path = require('path');
const PaymentFailure = require('../models/PaymentFailure');

const CSV_FILE = path.join(__dirname, '..', 'payment_failures.csv');

class PaymentFailureLogger {
  /**
   * Log a payment failure — saves to MongoDB and updates CSV
   */
  static async logFailure(failureData) {
    try {
      const entry = await PaymentFailure.create({
        userId: failureData.userId || 'unknown',
        userEmail: failureData.userEmail || 'unknown',
        userName: failureData.userName || 'unknown',
        amount: failureData.amount || 0,
        currency: failureData.currency || 'INR',
        planName: failureData.planName || 'unknown',
        planId: failureData.planId || '',
        errorCode: failureData.errorCode || 'unknown',
        errorDescription: failureData.errorDescription || 'Payment failed',
        razorpayOrderId: failureData.razorpayOrderId || '',
        razorpayPaymentId: failureData.razorpayPaymentId || '',
        source: failureData.source || 'client',
        type: failureData.type || 'subscription',
        metadata: failureData.metadata || {}
      });

      // Also update CSV for Excel download
      try {
        await PaymentFailureLogger.regenerateCSV();
      } catch (csvErr) {
        console.log('⚠️ CSV update failed (non-critical):', csvErr.message);
      }

      console.log(`⚠️ Payment failure logged: ${entry._id} - ${entry.userEmail} - ₹${entry.amount}`);
      return entry;
    } catch (err) {
      console.error('❌ Failed to log payment failure:', err.message);
    }
  }

  /**
   * Regenerate CSV from MongoDB data (for downloads)
   */
  static async regenerateCSV() {
    const failures = await PaymentFailure.find().sort({ createdAt: -1 }).limit(1000).lean();

    const headers = [
      'ID', 'Timestamp', 'User Email', 'User Name', 'Amount (INR)',
      'Plan', 'Error Code', 'Error Description', 'Type',
      'Razorpay Order ID', 'Razorpay Payment ID'
    ].join(',');

    const rows = failures.map(f => [
      f._id,
      f.createdAt ? new Date(f.createdAt).toISOString() : '',
      `"${f.userEmail}"`,
      `"${f.userName}"`,
      f.amount,
      `"${f.planName}"`,
      `"${f.errorCode}"`,
      `"${(f.errorDescription || '').replace(/"/g, '""')}"`,
      f.type,
      f.razorpayOrderId || '',
      f.razorpayPaymentId || ''
    ].join(','));

    const csv = [headers, ...rows].join('\n');
    fs.writeFileSync(CSV_FILE, csv);
  }

  /**
   * Get all payment failures from MongoDB
   */
  static async getFailures(options = {}) {
    try {
      let query = {};

      if (options.startDate) {
        query.createdAt = { ...(query.createdAt || {}), $gte: new Date(options.startDate) };
      }
      if (options.endDate) {
        query.createdAt = { ...(query.createdAt || {}), $lte: new Date(options.endDate) };
      }

      const limit = options.limit || 100;
      const failures = await PaymentFailure.find(query).sort({ createdAt: -1 }).limit(limit).lean();

      // Map to consistent format for frontend
      return failures.map(f => ({
        id: f._id,
        timestamp: f.createdAt,
        userId: f.userId,
        userEmail: f.userEmail,
        userName: f.userName,
        amount: f.amount,
        currency: f.currency,
        planName: f.planName,
        planId: f.planId,
        errorCode: f.errorCode,
        errorDescription: f.errorDescription,
        razorpayOrderId: f.razorpayOrderId,
        razorpayPaymentId: f.razorpayPaymentId,
        source: f.source,
        type: f.type
      }));
    } catch (err) {
      console.error('❌ Failed to read payment failures:', err.message);
      return [];
    }
  }

  /**
   * Get failure stats summary from MongoDB
   */
  static async getStats() {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [total, todayCount, weekCount, monthCount, amountResult] = await Promise.all([
        PaymentFailure.countDocuments(),
        PaymentFailure.countDocuments({ createdAt: { $gte: today } }),
        PaymentFailure.countDocuments({ createdAt: { $gte: weekAgo } }),
        PaymentFailure.countDocuments({ createdAt: { $gte: monthAgo } }),
        PaymentFailure.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }])
      ]);

      return {
        total,
        today: todayCount,
        thisWeek: weekCount,
        thisMonth: monthCount,
        totalAmount: amountResult.length > 0 ? amountResult[0].total : 0
      };
    } catch (err) {
      console.error('❌ Failed to get payment failure stats:', err.message);
      return { total: 0, today: 0, thisWeek: 0, thisMonth: 0, totalAmount: 0 };
    }
  }
}

module.exports = PaymentFailureLogger;
