const BillingPlan = require('../models/BillingPlan');
const BillingSubscription = require('../models/BillingSubscription');
const SubscriptionPlanHistory = require('../models/SubscriptionPlanHistory');
const BillingAdjustment = require('../models/BillingAdjustment');
const BillingInvoice = require('../models/BillingInvoice');
const InvoiceLineItem = require('../models/InvoiceLineItem');
const JournalEntry = require('../models/JournalEntry');
const ProrationService = require('./ProrationService');

/**
 * BillingService - Core billing operations
 * Handles subscription lifecycle, plan changes, cancellations, and invoice generation
 */
class BillingService {

  /**
   * Change subscription plan with proration
   * @param {string} subscriptionId - Subscription to change
   * @param {string} newPlanId - New plan ID
   * @param {Date} effectiveDate - When change takes effect (default: now)
   * @param {string} reason - Reason for change
   * @returns {Object} Plan change result with proration details
   */
  static async changePlan(subscriptionId, newPlanId, effectiveDate = null, reason = 'Customer requested plan change') {
    effectiveDate = effectiveDate || new Date();
    effectiveDate = ProrationService.normalizeToUTCMidnight(effectiveDate);

    try {
      // Fetch subscription and validate
      const subscription = await BillingSubscription.findById(subscriptionId)
        .populate('current_plan_id');

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status !== 'ACTIVE') {
        throw new Error('Can only change plan for active subscriptions');
      }

      // Fetch new plan and validate
      const newPlan = await BillingPlan.findById(newPlanId);
      if (!newPlan || newPlan.status !== 'ACTIVE') {
        throw new Error('New plan not found or inactive');
      }

      // Check if already on this plan
      if (subscription.current_plan_id._id.toString() === newPlanId) {
        throw new Error('Subscription is already on the requested plan');
      }

      // Get current billing period
      const billingPeriod = ProrationService.getBillingPeriod(subscription.billing_cycle_anchor);

      // Validate effective date is within current billing period or future
      if (effectiveDate < billingPeriod.period_start) {
        throw new Error('Effective date cannot be before current billing period');
      }

      // Calculate proration if change is within current period
      let prorationType = 'IMMEDIATE';
      let proratedAdjustment = null;
      let adjustmentAmount = 0;

      if (effectiveDate < billingPeriod.period_end) {
        // Change within current period - calculate proration
        prorationType = 'PRORATED';
        proratedAdjustment = ProrationService.calculatePlanChangeProration(
          subscription.current_plan_id,
          newPlan,
          effectiveDate,
          billingPeriod.period_start,
          billingPeriod.period_end
        );
        adjustmentAmount = proratedAdjustment.net_adjustment_cents;
      } else {
        // Change at next billing cycle - no proration needed
        prorationType = 'NEXT_CYCLE';
        effectiveDate = billingPeriod.period_end;
      }

      // Create plan history record
      const planHistory = new SubscriptionPlanHistory({
        subscription_id: subscription._id,
        old_plan_id: subscription.current_plan_id._id,
        new_plan_id: newPlan._id,
        change_type: 'PLAN_CHANGE',
        effective_from: effectiveDate,
        effective_to: null, // Will be set when plan changes again
        proration_type: prorationType,
        proration_amount_cents: adjustmentAmount,
        proration_details: proratedAdjustment,
        reason: reason,
        metadata: {
          old_plan_name: subscription.current_plan_id.name,
          new_plan_name: newPlan.name,
          old_plan_price_cents: subscription.current_plan_id.monthly_price_cents,
          new_plan_price_cents: newPlan.monthly_price_cents
        }
      });

      await planHistory.save();

      // Create adjustment if needed
      let adjustment = null;
      if (adjustmentAmount !== 0) {
        adjustment = new BillingAdjustment({
          subscription_id: subscription._id,
          amount_cents: adjustmentAmount,
          adjustment_type: adjustmentAmount > 0 ? 'CHARGE' : 'CREDIT',
          reason: 'PLAN_CHANGE_PRORATION',
          description: `Plan change proration: ${subscription.current_plan_id.name} → ${newPlan.name}`,
          effective_date: effectiveDate,
          status: 'PENDING',
          related_plan_history_id: planHistory._id,
          metadata: {
            plan_change: proratedAdjustment,
            old_plan_id: subscription.current_plan_id._id,
            new_plan_id: newPlan._id
          }
        });

        await adjustment.save();
      }

      // Update subscription if change is immediate
      if (prorationType === 'PRORATED') {
        // Close current plan history
        await SubscriptionPlanHistory.findOneAndUpdate(
          {
            subscription_id: subscription._id,
            effective_to: null,
            _id: { $ne: planHistory._id }
          },
          { effective_to: effectiveDate }
        );

        // Update subscription
        subscription.current_plan_id = newPlan._id;
        subscription.current_plan_name = newPlan.name;
        subscription.monthly_price_cents = newPlan.monthly_price_cents;
        subscription.last_plan_change_date = effectiveDate;

        await subscription.save();
      }

      return {
        success: true,
        subscription_id: subscription._id,
        old_plan: {
          id: subscription.current_plan_id._id,
          name: subscription.current_plan_id.name,
          price_cents: subscription.current_plan_id.monthly_price_cents
        },
        new_plan: {
          id: newPlan._id,
          name: newPlan.name,
          price_cents: newPlan.monthly_price_cents
        },
        effective_date: effectiveDate,
        proration_type: prorationType,
        proration_details: proratedAdjustment,
        adjustment_amount_cents: adjustmentAmount,
        adjustment_id: adjustment?._id || null,
        plan_history_id: planHistory._id
      };

    } catch (error) {
      throw new Error(`Plan change failed: ${error.message}`);
    }
  }

  /**
   * Cancel subscription with proration
   * @param {string} subscriptionId - Subscription to cancel
   * @param {Date} cancellationDate - When cancellation takes effect (default: now)
   * @param {string} reason - Reason for cancellation
   * @param {boolean} immediate - Whether to cancel immediately or at period end
   * @returns {Object} Cancellation result with refund details
   */
  static async cancelSubscription(subscriptionId, cancellationDate = null, reason = 'Customer requested cancellation', immediate = true) {
    cancellationDate = cancellationDate || new Date();
    cancellationDate = ProrationService.normalizeToUTCMidnight(cancellationDate);

    try {
      // Fetch subscription and validate
      const subscription = await BillingSubscription.findById(subscriptionId)
        .populate('current_plan_id');

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (['CANCELLED', 'EXPIRED'].includes(subscription.status)) {
        throw new Error('Subscription is already cancelled or expired');
      }

      // Get current billing period
      const billingPeriod = ProrationService.getBillingPeriod(subscription.billing_cycle_anchor);

      let cancellationType = immediate ? 'IMMEDIATE' : 'END_OF_PERIOD';
      let effectiveCancellationDate = immediate ? cancellationDate : billingPeriod.period_end;
      let proratedRefund = null;
      let refundAmount = 0;

      // Calculate refund if immediate cancellation within current period
      if (immediate && cancellationDate < billingPeriod.period_end) {
        proratedRefund = ProrationService.calculateCancellationProration(
          subscription.current_plan_id,
          cancellationDate,
          billingPeriod.period_start,
          billingPeriod.period_end
        );
        refundAmount = proratedRefund.credit_amount_cents;
      }

      // Create plan history record for cancellation
      const planHistory = new SubscriptionPlanHistory({
        subscription_id: subscription._id,
        old_plan_id: subscription.current_plan_id._id,
        new_plan_id: null,
        change_type: 'CANCELLATION',
        effective_from: effectiveCancellationDate,
        effective_to: null,
        proration_type: cancellationType,
        proration_amount_cents: -refundAmount, // Negative for refund
        proration_details: proratedRefund,
        reason: reason,
        metadata: {
          plan_name: subscription.current_plan_id.name,
          plan_price_cents: subscription.current_plan_id.monthly_price_cents,
          cancellation_type: cancellationType
        }
      });

      await planHistory.save();

      // Create refund adjustment if needed
      let refundAdjustment = null;
      if (refundAmount > 0) {
        refundAdjustment = new BillingAdjustment({
          subscription_id: subscription._id,
          amount_cents: -refundAmount, // Negative for credit
          adjustment_type: 'CREDIT',
          reason: 'CANCELLATION_REFUND',
          description: `Cancellation refund for unused period`,
          effective_date: effectiveCancellationDate,
          status: 'PENDING',
          related_plan_history_id: planHistory._id,
          metadata: {
            cancellation: proratedRefund,
            cancellation_type: cancellationType
          }
        });

        await refundAdjustment.save();
      }

      // Update subscription status
      if (immediate) {
        // Close current plan history
        await SubscriptionPlanHistory.findOneAndUpdate(
          {
            subscription_id: subscription._id,
            effective_to: null,
            _id: { $ne: planHistory._id }
          },
          { effective_to: effectiveCancellationDate }
        );

        subscription.status = 'CANCELLED';
        subscription.cancelled_at = effectiveCancellationDate;
        subscription.cancellation_reason = reason;
      } else {
        subscription.status = 'PENDING_CANCELLATION';
        subscription.scheduled_cancellation_date = effectiveCancellationDate;
        subscription.cancellation_reason = reason;
      }

      await subscription.save();

      return {
        success: true,
        subscription_id: subscription._id,
        cancellation_type: cancellationType,
        effective_cancellation_date: effectiveCancellationDate,
        refund_amount_cents: refundAmount,
        proration_details: proratedRefund,
        refund_adjustment_id: refundAdjustment?._id || null,
        plan_history_id: planHistory._id,
        status: subscription.status
      };

    } catch (error) {
      throw new Error(`Cancellation failed: ${error.message}`);
    }
  }

  /**
   * Generate invoice for subscription
   * @param {string} subscriptionId - Subscription to bill
   * @param {Date} periodStart - Billing period start
   * @param {Date} periodEnd - Billing period end
   * @param {Object} options - Invoice generation options
   * @returns {Object} Generated invoice with line items
   */
  static async generateInvoice(subscriptionId, periodStart, periodEnd, options = {}) {
    const {
      taxPercentage = 18, // Default GST rate in India
      includePendingAdjustments = true,
      dueDate = null
    } = options;

    periodStart = ProrationService.normalizeToUTCMidnight(periodStart);
    periodEnd = ProrationService.normalizeToUTCMidnight(periodEnd);

    try {
      // Fetch subscription with customer info
      const subscription = await BillingSubscription.findById(subscriptionId)
        .populate('current_plan_id')
        .populate('customer_id', 'name email profile.address');

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status !== 'ACTIVE') {
        throw new Error('Can only generate invoices for active subscriptions');
      }

      // Generate invoice number
      const invoiceNumber = await BillingInvoice.generateInvoiceNumber();

      // Calculate due date as 1 month from period end (aligns with monthly billing cycle)
      const calculatedDueDate = dueDate || (() => {
        const dueDateCalc = new Date(periodEnd);
        dueDateCalc.setDate(dueDateCalc.getDate() + 30); // 30-day billing cycle
        return dueDateCalc;
      })();

      // Create invoice
      const invoice = new BillingInvoice({
        subscription_id: subscription._id,
        invoice_number: invoiceNumber,
        period_start: periodStart,
        period_end: periodEnd,
        subtotal_cents: 0, // Will be calculated
        tax_cents: 0,      // Will be calculated
        total_cents: 0,    // Will be calculated
        tax_percentage: taxPercentage,
        due_date: calculatedDueDate,
        customer_info: {
          user_id: subscription.customer_id._id,
          name: subscription.customer_id.name,
          email: subscription.customer_id.email,
          billing_address: subscription.customer_id.profile?.address || {}
        },
        company_info: {
          name: 'BroadbandX',
          address: {
            street: '123 Tech Park',
            city: 'Bangalore',
            state: 'Karnataka',
            postal_code: '560001',
            country: 'India'
          },
          tax_id: 'GST123456789',
          phone: '+91-80-12345678',
          email: 'billing@broadbandx.com'
        }
      });

      await invoice.save();

      // Generate line items
      const lineItems = [];
      let lineNumber = 1;

      // Base subscription charge
      const subscriptionItem = InvoiceLineItem.createSubscriptionItem(
        invoice._id,
        lineNumber++,
        subscription,
        subscription.current_plan_id,
        periodStart,
        periodEnd
      );
      lineItems.push(subscriptionItem);
      await subscriptionItem.save();

      // Add pending adjustments if requested
      if (includePendingAdjustments) {
        const pendingAdjustments = await BillingAdjustment.find({
          subscription_id: subscription._id,
          status: 'PENDING',
          effective_date: { $lte: periodEnd }
        });

        for (const adjustment of pendingAdjustments) {
          let adjustmentItem;

          if (adjustment.reason === 'PLAN_CHANGE_PRORATION' || adjustment.reason === 'CANCELLATION_REFUND') {
            adjustmentItem = InvoiceLineItem.createProrationItem(
              invoice._id,
              lineNumber++,
              adjustment
            );
          } else {
            adjustmentItem = InvoiceLineItem.createAdjustmentItem(
              invoice._id,
              lineNumber++,
              adjustment
            );
          }

          lineItems.push(adjustmentItem);
          await adjustmentItem.save();

          // Mark adjustment as applied
          adjustment.status = 'APPLIED';
          adjustment.applied_to_invoice_id = invoice._id;
          adjustment.applied_at = new Date();
          await adjustment.save();
        }
      }

      // Calculate totals
      const totals = await InvoiceLineItem.calculateInvoiceTotals(invoice._id, taxPercentage);

      // Update invoice with calculated totals
      invoice.subtotal_cents = totals.subtotal_cents;
      invoice.tax_cents = totals.tax_cents;
      invoice.total_cents = totals.total_cents;

      await invoice.save();

      return {
        success: true,
        invoice: invoice,
        line_items: lineItems,
        totals: totals,
        subscription: subscription
      };

    } catch (error) {
      throw new Error(`Invoice generation failed: ${error.message}`);
    }
  }

  /**
   * Process scheduled plan changes (to be run daily)
   * @returns {Object} Processing results
   */
  static async processScheduledPlanChanges() {
    const today = ProrationService.normalizeToUTCMidnight(new Date());

    try {
      // Find plan changes scheduled for today
      const scheduledChanges = await SubscriptionPlanHistory.find({
        change_type: 'PLAN_CHANGE',
        effective_from: today,
        processed: { $ne: true }
      }).populate('subscription_id').populate('new_plan_id');

      const results = [];

      for (const change of scheduledChanges) {
        try {
          const subscription = change.subscription_id;
          const newPlan = change.new_plan_id;

          // Close previous plan history
          await SubscriptionPlanHistory.findOneAndUpdate(
            {
              subscription_id: subscription._id,
              effective_to: null,
              _id: { $ne: change._id }
            },
            { effective_to: change.effective_from }
          );

          // Update subscription
          subscription.current_plan_id = newPlan._id;
          subscription.current_plan_name = newPlan.name;
          subscription.monthly_price_cents = newPlan.monthly_price_cents;
          subscription.last_plan_change_date = change.effective_from;

          await subscription.save();

          // Mark change as processed
          change.processed = true;
          await change.save();

          results.push({
            subscription_id: subscription._id,
            old_plan: change.old_plan_id,
            new_plan: newPlan._id,
            status: 'SUCCESS'
          });

        } catch (error) {
          results.push({
            subscription_id: change.subscription_id,
            error: error.message,
            status: 'FAILED'
          });
        }
      }

      return {
        success: true,
        processed_count: scheduledChanges.length,
        results: results
      };

    } catch (error) {
      throw new Error(`Scheduled plan changes processing failed: ${error.message}`);
    }
  }

  /**
   * Process scheduled cancellations (to be run daily)
   * @returns {Object} Processing results
   */
  static async processScheduledCancellations() {
    const today = ProrationService.normalizeToUTCMidnight(new Date());

    try {
      // Find subscriptions scheduled for cancellation today
      const subscriptionsToCancel = await BillingSubscription.find({
        status: 'PENDING_CANCELLATION',
        scheduled_cancellation_date: { $lte: today }
      });

      const results = [];

      for (const subscription of subscriptionsToCancel) {
        try {
          // Close current plan history
          await SubscriptionPlanHistory.findOneAndUpdate(
            {
              subscription_id: subscription._id,
              effective_to: null
            },
            { effective_to: subscription.scheduled_cancellation_date }
          );

          // Update subscription status
          subscription.status = 'CANCELLED';
          subscription.cancelled_at = subscription.scheduled_cancellation_date;
          subscription.scheduled_cancellation_date = null;

          await subscription.save();

          results.push({
            subscription_id: subscription._id,
            cancellation_date: subscription.cancelled_at,
            status: 'SUCCESS'
          });

        } catch (error) {
          results.push({
            subscription_id: subscription._id,
            error: error.message,
            status: 'FAILED'
          });
        }
      }

      return {
        success: true,
        processed_count: subscriptionsToCancel.length,
        results: results
      };

    } catch (error) {
      throw new Error(`Scheduled cancellations processing failed: ${error.message}`);
    }
  }
}

module.exports = BillingService;