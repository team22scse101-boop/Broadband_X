import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  TextField
} from '@mui/material';
import { Plan } from '../types/index';
import { apiClient } from '../services/api';

// Declare Razorpay on window object
declare global {
  interface Window {
    Razorpay: any;
  }
}

interface RazorpayPaymentFormProps {
  plan: Plan;
  onSuccess: () => void;
  onCancel: () => void;
}

const RazorpayPaymentForm: React.FC<RazorpayPaymentFormProps> = ({ plan, onSuccess, onCancel }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if this is a fallback plan ID
      if (plan._id.startsWith('fallback-')) {
        throw new Error('This plan is not available for purchase at the moment. Please try again later or contact support.');
      }

      console.log('Creating Razorpay order for plan:', plan._id);

      // Load Razorpay script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Failed to load Razorpay SDK. Please check your internet connection.');
      }

      // Create Razorpay order
      const orderResponse = await apiClient.post('/razorpay/create-order', {
        planId: plan._id,
        amount: plan.pricing.monthly * 100 // Convert to paise
      });

      const { order, payment } = (orderResponse.data as any).data;

      console.log('Razorpay order created:', order.id);

      // Razorpay payment options
      const options = {
        key: process.env.REACT_APP_RAZORPAY_KEY_ID || 'rzp_test_RvlGVIoKWbOQVK',
        amount: order.amount,
        currency: order.currency,
        name: 'BroadbandX',
        description: `${plan.name} - ${plan.features.speed.download} ${plan.features.speed.unit}`,
        order_id: order.id,
        config: {
          display: {
            blocks: {
              banks: {
                name: 'All payment methods',
                instruments: [
                  { method: 'card' },
                  { method: 'netbanking' },
                  { method: 'upi' },
                  { method: 'wallet' }
                ]
              }
            },
            sequence: ['block.banks'],
            preferences: {
              show_default_blocks: true
            }
          }
        },
        handler: async function (response: any) {
          try {
            console.log('Payment successful, verifying...', response);

            // Verify payment
            const verifyResponse = await apiClient.post('/razorpay/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            if ((verifyResponse.data as any).success) {
              console.log('Payment verified successfully');
              onSuccess();
            } else {
              throw new Error('Payment verification failed');
            }
          } catch (error: any) {
            console.error('Payment verification error:', error);
            setError(error.response?.data?.message || 'Payment verification failed. Please contact support.');
            setLoading(false);
          }
        },
        prefill: {
          name: '',
          email: '',
          contact: ''
        },
        notes: {
          plan_id: plan._id,
          plan_name: plan.name
        },
        theme: {
          color: '#2196F3'
        },
        modal: {
          ondismiss: async function () {
            console.log('Payment cancelled by user');
            setLoading(false);
            setError('Payment cancelled. Please try again.');
            // Log cancellation as failure
            try {
              await apiClient.post('/payment-failures/log', {
                amount: plan.pricing.monthly,
                planName: plan.name,
                planId: plan._id,
                errorCode: 'USER_DISMISSED',
                errorDescription: 'User cancelled/dismissed payment',
                razorpayOrderId: order.id,
                type: 'subscription'
              });
            } catch (e) { console.error('Failed to log dismissal:', e); }
          }
        }
      };

      const razorpayInstance = new window.Razorpay(options);
      
      razorpayInstance.on('payment.failed', async function (response: any) {
        console.error('Payment failed:', response.error);
        setError(`Payment failed: ${response.error.description}`);
        setLoading(false);
        // Log failure to server
        try {
          await apiClient.post('/payment-failures/log', {
            amount: plan.pricing.monthly,
            planName: plan.name,
            planId: plan._id,
            errorCode: response.error.code || 'RAZORPAY_ERROR',
            errorDescription: response.error.description || 'Payment failed',
            razorpayOrderId: order.id,
            razorpayPaymentId: response.error.metadata?.payment_id || '',
            type: 'subscription'
          });
        } catch (e) { console.error('Failed to log payment failure:', e); }
      });

      razorpayInstance.open();
      
    } catch (err: any) {
      console.error('Payment initiation error:', err);
      
      // Handle specific error types
      if (err.message?.includes('network') || err.message?.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else if (err.response?.status === 401) {
        setError('Authentication required. Please log in again.');
      } else if (err.response?.status === 404) {
        setError('Plan not found. Please select a valid plan.');
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to initiate payment');
      }
      setLoading(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, maxWidth: 500, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom align="center">
        Payment Details
      </Typography>

      <Box sx={{ my: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          <strong>Plan:</strong> {plan.name}
        </Typography>
        <Typography variant="subtitle1" gutterBottom>
          <strong>Speed:</strong> {plan.features.speed.download} {plan.features.speed.unit} Download / {plan.features.speed.upload} {plan.features.speed.unit} Upload
        </Typography>
        <Typography variant="subtitle1" gutterBottom>
          <strong>Data Limit:</strong> {plan.features.dataLimit.unlimited ? 'Unlimited' : `${plan.features.dataLimit.amount} ${plan.features.dataLimit.unit}`}
        </Typography>
        <Typography variant="h6" color="primary" gutterBottom>
          <strong>Amount:</strong> ₹{plan.pricing.monthly.toLocaleString('en-IN')}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
        <Button
          variant="outlined"
          fullWidth
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          fullWidth
          onClick={handlePayment}
          disabled={loading}
          startIcon={loading && <CircularProgress size={20} />}
        >
          {loading ? 'Processing...' : 'Pay with Razorpay'}
        </Button>
      </Box>

      <Typography variant="caption" display="block" textAlign="center" sx={{ mt: 2 }} color="text.secondary">
        Secure payment powered by Razorpay
      </Typography>
    </Paper>
  );
};

export default RazorpayPaymentForm;
