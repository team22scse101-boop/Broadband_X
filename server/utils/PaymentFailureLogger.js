/**
 * Payment Failure Logger
 * Logs payment failures to an Excel file and provides data for admin panel
 */

const fs = require('fs');
const path = require('path');

const FAILURES_FILE = path.join(__dirname, '..', 'payment_failures.json');

class PaymentFailureLogger {
  /**
   * Log a payment failure
   */
  static async logFailure(failureData) {
    try {
      const entry = {
        id: `PF-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: failureData.userId || 'unknown',
        userEmail: failureData.userEmail || 'unknown',
        userName: failureData.userName || 'unknown',
        amount: failureData.amount || 0,
        currency: failureData.currency || 'INR',
        planName: failureData.planName || 'unknown',
        planId: failureData.planId || 'unknown',
        errorCode: failureData.errorCode || 'unknown',
        errorDescription: failureData.errorDescription || 'Payment failed',
        razorpayOrderId: failureData.razorpayOrderId || '',
        razorpayPaymentId: failureData.razorpayPaymentId || '',
        source: failureData.source || 'razorpay',
        type: failureData.type || 'subscription', // subscription, renewal, etc.
        metadata: failureData.metadata || {}
      };

      // Read existing failures
      let failures = [];
      if (fs.existsSync(FAILURES_FILE)) {
        const raw = fs.readFileSync(FAILURES_FILE, 'utf-8');
        failures = JSON.parse(raw);
      }

      // Add new failure
      failures.unshift(entry);

      // Keep last 1000 entries
      if (failures.length > 1000) {
        failures = failures.slice(0, 1000);
      }

      // Write back
      fs.writeFileSync(FAILURES_FILE, JSON.stringify(failures, null, 2));

      // Also export to CSV/Excel-compatible format
      await PaymentFailureLogger.exportToExcel(failures);

      console.log(`⚠️ Payment failure logged: ${entry.id} - ${entry.userEmail} - ₹${entry.amount}`);
      return entry;
    } catch (err) {
      console.error('❌ Failed to log payment failure:', err.message);
    }
  }

  /**
   * Export failures to CSV (Excel-readable)
   */
  static async exportToExcel(failures) {
    const EXCEL_FILE = path.join(__dirname, '..', 'payment_failures.csv');

    const headers = [
      'ID', 'Timestamp', 'User Email', 'User Name', 'Amount (INR)',
      'Plan', 'Error Code', 'Error Description', 'Type',
      'Razorpay Order ID', 'Razorpay Payment ID'
    ].join(',');

    const rows = failures.map(f => [
      f.id,
      f.timestamp,
      `"${f.userEmail}"`,
      `"${f.userName}"`,
      f.amount,
      `"${f.planName}"`,
      `"${f.errorCode}"`,
      `"${f.errorDescription}"`,
      f.type,
      f.razorpayOrderId,
      f.razorpayPaymentId
    ].join(','));

    const csv = [headers, ...rows].join('\n');
    fs.writeFileSync(EXCEL_FILE, csv);
  }

  /**
   * Get all payment failures (for admin panel)
   */
  static getFailures(options = {}) {
    try {
      if (!fs.existsSync(FAILURES_FILE)) return [];
      const raw = fs.readFileSync(FAILURES_FILE, 'utf-8');
      let failures = JSON.parse(raw);

      // Filter by date range if provided
      if (options.startDate) {
        failures = failures.filter(f => new Date(f.timestamp) >= new Date(options.startDate));
      }
      if (options.endDate) {
        failures = failures.filter(f => new Date(f.timestamp) <= new Date(options.endDate));
      }

      // Limit
      if (options.limit) {
        failures = failures.slice(0, options.limit);
      }

      return failures;
    } catch (err) {
      console.error('❌ Failed to read payment failures:', err.message);
      return [];
    }
  }

  /**
   * Get failure stats summary
   */
  static getStats() {
    const failures = PaymentFailureLogger.getFailures();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      total: failures.length,
      today: failures.filter(f => new Date(f.timestamp) >= today).length,
      thisWeek: failures.filter(f => new Date(f.timestamp) >= weekAgo).length,
      thisMonth: failures.filter(f => new Date(f.timestamp) >= monthAgo).length,
      totalAmount: failures.reduce((sum, f) => sum + (f.amount || 0), 0),
      byType: failures.reduce((acc, f) => {
        acc[f.type] = (acc[f.type] || 0) + 1;
        return acc;
      }, {}),
      recentFailures: failures.slice(0, 10)
    };
  }
}

module.exports = PaymentFailureLogger;
