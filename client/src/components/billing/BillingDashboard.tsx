import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Receipt as ReceiptIcon,
  QrCode as QrCodeIcon,
  ContentCopy as CopyIcon,
  Payment as PaymentIcon,
  History as HistoryIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useRealtime } from '../../contexts/RealtimeContext';
// import { useAuth } from '../../context/AuthContext';
// import { InvoicePaymentButton } from './InvoicePaymentButton';

// QR Payment Modal Component
const QRPaymentModal = ({ open, onClose, invoice, onPaymentSuccess }: any) => {
  const [loading, setLoading] = useState(false);
  const [transactionId] = useState(`TXN${Date.now()}`);

  const upiDetails = {
    id: '9570329856@ptyes',
    name: 'BroadbandX Services',
    amount: invoice?.amount || 0,
    transactionRef: transactionId,
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log('Copied to clipboard:', text);
    });
  };

  const generateUPILink = () => {
    return `upi://pay?pa=${upiDetails.id}&pn=${encodeURIComponent(upiDetails.name)}&am=${upiDetails.amount}&tr=${upiDetails.transactionRef}&tn=${encodeURIComponent('BroadbandX Invoice Payment')}`;
  };

  const handlePaymentComplete = async () => {
    setLoading(true);
    try {
      console.log(`💳 Processing payment for invoice ${invoice.id}`);

      // Call server to complete payment in database
      const response = await axios.post('http://localhost:5001/api/billing/complete-payment', {
        invoiceId: invoice.id,
        paymentId: invoice.id,
        transactionId: transactionId
      });

      console.log('✅ Server payment completion response:', response.data);

      if (response.data.success) {
        // Create updated invoice object with Paid status
        const updatedInvoice = {
          ...invoice,
          status: 'Paid', // Ensure this is exactly 'Paid'
          paymentDate: new Date().toISOString(),
          transactionId: response.data.payment?.transactionId || transactionId
        };

        console.log('✅ Payment completed successfully, updated invoice:', updatedInvoice);
        console.log('🔍 Before payment - Invoice status:', invoice.status);
        console.log('🔍 After payment - Invoice status:', updatedInvoice.status);

        // Close modal first
        onClose();

        // Immediately notify parent with updated invoice
        setTimeout(() => {
          console.log('📤 Sending payment success to parent component');
          onPaymentSuccess?.(updatedInvoice);
        }, 100);

        // Force reload billing data from server to get updated status
        setTimeout(() => {
          console.log('🔄 Forcing billing data reload after payment');
          window.location.reload(); // Force complete page refresh to ensure updated data
        }, 500);

        alert(`✅ Payment of ₹${invoice.amount} completed successfully!`);
      } else {
        throw new Error(response.data.message || 'Payment completion failed');
      }
    } catch (error: any) {
      console.error('❌ Payment completion error:', error);
      alert(`❌ Payment failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <QrCodeIcon color="primary" />
          <Typography variant="h6">UPI Payment</Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Card sx={{ mb: 2, bgcolor: 'primary.50' }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              Invoice: {invoice?.invoiceNumber || 'INV-001'}
            </Typography>
            <Typography variant="h5" color="primary">
              ₹{invoice?.amount?.toFixed(2) || '0.00'}
            </Typography>
          </CardContent>
        </Card>

        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box sx={{
            p: 3,
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 2,
            backgroundColor: 'primary.50',
            minHeight: '160px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <QrCodeIcon sx={{ fontSize: 60, color: 'primary.main', mb: 1 }} />
            <Typography variant="h6" color="primary">
              UPI QR Code
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Scan with any UPI app
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{
          p: 2,
          backgroundColor: 'grey.100',
          borderRadius: 1
        }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            UPI ID:
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography
              variant="body1"
              sx={{ fontFamily: 'monospace', fontWeight: 'bold', flex: 1 }}
            >
              {upiDetails.id}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CopyIcon />}
              onClick={() => copyToClipboard(upiDetails.id)}
            >
              Copy
            </Button>
          </Stack>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            fullWidth
            component="a"
            href={generateUPILink()}
            target="_blank"
            startIcon={<PaymentIcon />}
            sx={{ mb: 2 }}
          >
            Pay with UPI App
          </Button>
        </Box>

        <Alert severity="info">
          <Typography variant="body2">
            <strong>Popular UPI Apps:</strong> PhonePe, Google Pay, Paytm, BHIM, Amazon Pay
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handlePaymentComplete}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <CheckCircleIcon />}
        >
          {loading ? 'Verifying...' : "I've Paid"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Simple placeholder for InvoicePaymentButton
const InvoicePaymentButton = ({ invoice, onPaymentSuccess, onPaymentError, paidInvoices }: any) => {
  const [showQRPayment, setShowQRPayment] = useState(false);

  console.log(`🔍 Rendering InvoicePaymentButton for invoice ${invoice.id} with status: ${invoice.status}`);
  console.log(`💰 PaidInvoices set contains ${invoice.id}:`, paidInvoices?.has(invoice.id));

  const handleDownloadPDF = async (invoice: any) => {
    try {
      console.log('📄 Attempting to download PDF for invoice:', invoice);
      console.log('📄 Invoice._id:', invoice._id);
      console.log('📄 Invoice.id:', invoice.id);

      // Check if invoice is paid before attempting download
      if (invoice.status?.toLowerCase() !== 'paid') {
        alert('⚠️ PDF invoice is only available after payment completion. Please complete the payment first.');
        return;
      }

      // Use _id (MongoDB ObjectId) directly
      const pdfInvoiceId = invoice._id || invoice.id;
      console.log('📄 Using PDF invoice ID:', pdfInvoiceId, 'for invoice:', invoice.invoiceNumber);

      // Open PDF in new window for paid invoices only (no userId needed)
      const pdfUrl = `http://localhost:5001/api/pdf/invoice/${pdfInvoiceId}`;
      console.log('📄 Opening PDF URL:', pdfUrl);
      window.open(pdfUrl, '_blank');

    } catch (error) {
      console.error('Failed to download PDF:', error);
      alert('Error downloading PDF. Please try again.');
    }
  };

  const handlePaymentComplete = (updatedInvoice: any) => {
    console.log('💳 Payment completed in button, updated invoice:', updatedInvoice);

    // Create new invoice with updated status
    const newInvoice = {
      ...updatedInvoice,
      status: 'Paid',
      paymentDate: new Date().toISOString(),
      transactionId: `TXN${Date.now()}`
    };

    // Call parent success handler with updated invoice
    onPaymentSuccess?.(newInvoice);
  };

  // Check if invoice is paid (case insensitive) - check both status and paidInvoices set
  const isPaid = invoice.status?.toLowerCase() === 'paid' || paidInvoices?.has(invoice.id);

  console.log(`🎯 Invoice ${invoice.id} isPaid: ${isPaid}, status: ${invoice.status}, inPaidSet: ${paidInvoices?.has(invoice.id)}`);

  if (isPaid) {
    return (
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ReceiptIcon />}
          onClick={() => handleDownloadPDF(invoice)}
        >
          Download PDF
        </Button>
        <Chip
          label="Paid"
          color="success"
          size="small"
          icon={<CheckCircleIcon />}
        />
      </Stack>
    );
  }

  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          color="primary"
          onClick={() => setShowQRPayment(true)}
          startIcon={<QrCodeIcon />}
        >
          Pay with UPI
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ReceiptIcon />}
          onClick={() => handleDownloadPDF(invoice)}
        >
          Download PDF
        </Button>
      </Stack>

      <QRPaymentModal
        open={showQRPayment}
        onClose={() => setShowQRPayment(false)}
        invoice={invoice}
        onPaymentSuccess={handlePaymentComplete}
      />
    </>
  );
};

interface BillingDashboardProps {
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
}

interface BillingData {
  subscription: any;
  invoices: any[];
}

const BillingDashboard: React.FC<BillingDashboardProps> = ({ onError, onSuccess }) => {
  console.log('🚀 SIMPLIFIED BILLING DASHBOARD LOADED - WITH REAL-TIME UPDATES');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState<string>('');
  const [localRefreshTrigger, setLocalRefreshTrigger] = useState(0); // Local refresh trigger
  const [paidInvoices, setPaidInvoices] = useState<Set<string>>(new Set()); // Track paid invoices

  // Use RealtimeContext for consistent real-time updates
  const { refreshTrigger } = useRealtime();

  // Manual refresh function
  const refreshBillingData = async () => {
    console.log('🔄 Manual refresh triggered - clearing cache and fetching latest data');

    // Clear any cached data
    setData(null);
    setPaidInvoices(new Set());
    setLoading(true);

    // Force fresh data load with cache-busting
    await loadBillingData(true);
    setLocalRefreshTrigger(Date.now());
  };

  // Load billing data on mount
  useEffect(() => {
    console.log('🔄 Starting billing data fetch');
    loadBillingData(true);
  }, []);

  // Watch for real-time subscription changes from RealtimeContext
  useEffect(() => {
    // The refreshTrigger from context changes when subscription events occur
    if (refreshTrigger > 0) {
      console.log('📡 Real-time update detected (trigger:', refreshTrigger, '), refreshing billing data...');
      loadBillingData(true);
    }
  }, [refreshTrigger]); // Trigger refresh when RealtimeContext detects changes

  const loadBillingData = async (forceFresh = false) => {
    try {
      setLoading(true);
      console.log('🌐 Making API call to fetch subscription data', forceFresh ? '(FORCE FRESH)' : '');

      const userId = localStorage.getItem('userId');
      const token = localStorage.getItem('access_token'); // Use correct token key

      if (!userId || !token) {
        console.log('❌ Missing auth data:', { userId: !!userId, token: !!token });
        console.log('Available localStorage keys:', Object.keys(localStorage));
        throw new Error('Authentication required');
      }

      console.log('👤 User ID:', userId);
      console.log('🔑 Token found:', token ? 'YES' : 'NO');

      // Force cache bust to ensure fresh data
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };

      // Make single API call to get subscription data with cache busting
      const cacheBuster = forceFresh ? `&t=${Date.now()}&cb=${Math.random()}` : '';
      const response = await axios.get(
        `http://localhost:5001/api/customer/subscriptions?userId=${userId}${cacheBuster}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 15000 // 15 second timeout
        }
      );

      console.log('✅ API Response received:', response.data);
      console.log('🔍 Response structure check:', {
        isArray: Array.isArray(response.data),
        hasSuccessAndData: response.data?.success && response.data?.data,
        dataLength: response.data?.data?.length || response.data?.length,
        dataType: typeof response.data,
        actualData: response.data?.data || response.data
      });

      // Handle both response formats: direct array or {success, data} wrapper
      let subscriptionsArray;
      if (response.data?.success && response.data?.data) {
        // Format: {success: true, data: {...}} or {success: true, data: [...]}
        if (Array.isArray(response.data.data)) {
          subscriptionsArray = response.data.data;
        } else {
          // Single subscription object wrapped in success response
          subscriptionsArray = [response.data.data];
        }
      } else if (Array.isArray(response.data)) {
        // Format: direct array
        subscriptionsArray = response.data;
      } else if (response.data && typeof response.data === 'object') {
        // Single subscription object without wrapper
        subscriptionsArray = [response.data];
      } else {
        subscriptionsArray = [];
      }

      console.log('🔍 Extracted subscriptions array:', subscriptionsArray);

      if (subscriptionsArray.length > 0) {
        console.log('📊 Using REAL subscription data from API');

        let subscriptionData = subscriptionsArray[0]; // Get first item from array
        console.log('🔍 Raw subscription data structure:', subscriptionData);
        console.log('🔍 Subscription keys:', Object.keys(subscriptionData || {}));

        // Handle nested subscription structure
        if (subscriptionData?.subscriptions && Array.isArray(subscriptionData.subscriptions)) {
          console.log('🔍 Found nested subscriptions array, extracting first subscription');
          subscriptionData = subscriptionData.subscriptions[0];
          console.log('🔍 Extracted subscription data:', subscriptionData);
        }

        // Validate that this subscription belongs to the current user
        const currentUserId = localStorage.getItem('userId');
        const subscriptionUserId = subscriptionData?.user?.toString() || subscriptionData?.userId?.toString();

        console.log('🔐 User validation check:', {
          currentUserId,
          subscriptionUserId,
          match: currentUserId === subscriptionUserId
        });

        if (currentUserId !== subscriptionUserId) {
          console.error('❌ SECURITY ALERT: Subscription data belongs to different user!');
          console.error('  Current user:', currentUserId);
          console.error('  Subscription user:', subscriptionUserId);
          throw new Error('Data integrity error: Received subscription for different user');
        }

        // Fetch REAL invoices from Billing collection instead of paymentHistory
        console.log('📄 Fetching real invoices from Billing API for user:', userId);

        let processedInvoices = [];

        try {
          console.log('🔍 Fetching invoices with userId:', userId);
          const invoicesResponse = await axios.get(
            `http://localhost:5001/api/billing/invoices/${userId}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 10000
            }
          );

          console.log('✅ Billing API response:', invoicesResponse.data);
          console.log('📊 Invoice count:', invoicesResponse.data?.data?.length || 0);

          if (invoicesResponse.data?.success && invoicesResponse.data?.data) {
            processedInvoices = invoicesResponse.data.data.map((invoice: any) => {
              const invoiceId = invoice._id;
              const isInPaidSet = paidInvoices.has(invoiceId);
              const apiStatus = invoice.status?.toLowerCase();
              const isPaidStatus = apiStatus === 'paid';

              console.log(`📋 Processing invoice:`, {
                invoiceId,
                invoiceNumber: invoice.invoiceNumber,
                apiStatus,
                isPaidStatus,
                isInPaidSet,
                amount: invoice.total
              });

              // Priority: Local paid state > API paid status > Default pending
              const finalStatus = isInPaidSet ? 'Paid' : (isPaidStatus ? 'Paid' : 'Pending');

              return {
                _id: invoiceId,           // Use MongoDB _id for PDF download
                id: invoiceId,            // Backwards compatibility
                invoiceNumber: invoice.invoiceNumber,
                amount: invoice.total,
                status: finalStatus,
                date: new Date(invoice.createdAt).toLocaleDateString('en-GB'),
                dueDate: new Date(invoice.dueDate).toLocaleDateString('en-GB'),
                description: invoice.items?.[0]?.description || `${subscriptionData.planName || 'Subscription'} - Monthly`,
                ...(isPaidStatus ? {
                  paymentDate: invoice.paymentDate,
                  transactionId: invoice.transactionId
                } : {})
              };
            });
          }

          console.log('💳 Processed invoices from Billing collection:', processedInvoices);

        } catch (invoiceError) {
          console.warn('⚠️ Failed to fetch invoices from Billing API:', invoiceError);
          console.log('📋 Falling back to empty invoice list');
          processedInvoices = [];
        }

        setData({
          subscription: {
            plan: {
              name: subscriptionData.planName || subscriptionData.plan?.name || 'Unknown Plan',
              price: subscriptionData.pricing?.totalAmount || subscriptionData.pricing?.finalPrice || 0
            },
            status: subscriptionData.status,
            nextBilling: subscriptionData.endDate ? new Date(subscriptionData.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          },
          invoices: processedInvoices
        });
        console.log('📊 Subscription data loaded successfully');
      } else {
        console.log('⚠️ No subscription data found, showing empty invoices');

        // Don't show fake invoices - only show real payment data
        setData({
          subscription: {
            plan: { name: 'No Active Plan', price: 0 },
            status: 'inactive',
            nextBilling: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          },
          invoices: []
        });
      }

      setError('');
      console.log('🎉 Billing data loaded successfully!');
    } catch (error: any) {
      console.error('❌ Error loading billing data:', error);
      setError(error.message || 'Failed to load billing data');
      onError?.(error.message || 'Failed to load billing data');

      // Don't show fake invoices on error - show empty state
      setData({
        subscription: {
          plan: { name: 'No Active Plan', price: 0 },
          status: 'inactive',
          nextBilling: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        },
        invoices: []
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading billing information...</Typography>
      </Box>
    );
  }

  if (error) {
    // Show friendly message instead of raw error for auth/data issues
    if (error.includes('Authentication')) {
      return (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="h6">Please log in again</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>Your session may have expired. Please log out and log back in.</Typography>
        </Alert>
      );
    }
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        <Typography variant="h6">Unable to load billing information</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>{error}</Typography>
        <Button
          variant="outlined"
          onClick={() => loadBillingData(true)}
          sx={{ mt: 2 }}
          startIcon={<ScheduleIcon />}
        >
          Retry Loading
        </Button>
      </Alert>
    );
  }

  const { subscription, invoices } = data || {};

  // Friendly empty state for users without an active subscription
  if (!subscription || subscription.status === 'inactive' || subscription.plan?.name === 'No Active Plan') {
    return (
      <Box>
        <Card sx={{ mb: 2, textAlign: 'center', p: 3 }}>
          <Box sx={{ display: 'inline-flex', p: 1.5, borderRadius: 2, bgcolor: '#e3f2fd', mb: 2 }}>
            <ReceiptIcon sx={{ fontSize: 48, color: '#1976d2' }} />
          </Box>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
            No Active Subscription
          </Typography>
          <Typography variant="body1" color="textSecondary" paragraph>
            You don't have any active broadband plan.  
            Subscribe to a plan to start using BroadbandX and manage your billing here.
          </Typography>
          <Alert severity="info" sx={{ mb: 2, mx: 'auto', maxWidth: 450, textAlign: 'left' }}>
            Once you subscribe to a plan, this section will show your invoices, payment history, and billing details.
          </Alert>
        </Card>

        {/* Still show past invoices if any */}
        {invoices && invoices.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Past Invoices
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Invoice #</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {invoices.map((invoice: any, index: number) => (
                      <TableRow key={`${invoice.id || index}`}>
                        <TableCell>{invoice.invoiceNumber || `INV-${index + 1}`}</TableCell>
                        <TableCell>₹{invoice.amount}</TableCell>
                        <TableCell>
                          <Chip
                            label={invoice.status}
                            color={invoice.status?.toLowerCase() === 'paid' ? 'success' : 'warning'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{invoice.date}</TableCell>
                        <TableCell>
                          <InvoicePaymentButton
                            invoice={invoice}
                            paidInvoices={paidInvoices}
                            onPaymentSuccess={() => {}}
                            onPaymentError={() => {}}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}
      </Box>
    );
  }

  return (
    <Box>
      {/* Current Subscription Card */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <ReceiptIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Current Subscription
          </Typography>

          {subscription && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">Plan</Typography>
                <Typography variant="h6">{subscription.plan?.name || 'Unknown Plan'}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">Price</Typography>
                <Typography variant="h6">₹{subscription.plan?.price || 0}/month</Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`Status: ${subscription.status || 'Active'}`}
                  color={subscription.status === 'active' ? 'success' : 'warning'}
                />
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent Invoices
          </Typography>

          {invoices && invoices.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice #</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((invoice: any, index: number) => (
                    <TableRow key={`${invoice.id || index}-${invoice.status}-${refreshTrigger}`}>
                      <TableCell>{invoice.invoiceNumber || `INV-${index + 1}`}</TableCell>
                      <TableCell>₹{invoice.amount}</TableCell>
                      <TableCell>
                        <Chip
                          label={invoice.status}
                          color={
                            (invoice.status?.toLowerCase() === 'paid')
                              ? 'success'
                              : 'warning'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{invoice.date}</TableCell>
                      <TableCell>
                        <InvoicePaymentButton
                          key={`payment-${invoice.id}-${invoice.status}-${refreshTrigger}-${Array.from(paidInvoices).join('-')}`}
                          invoice={invoice}
                          paidInvoices={paidInvoices}
                          onPaymentSuccess={(updatedInvoice: any) => {
                            console.log('🎉 PAYMENT SUCCESS RECEIVED IN MAIN COMPONENT:', updatedInvoice);

                            // Track this invoice as paid permanently
                            const newPaidInvoices = new Set(Array.from(paidInvoices).concat([updatedInvoice.id]));
                            setPaidInvoices(newPaidInvoices);

                            // Force immediate re-render trigger
                            setLocalRefreshTrigger(prev => prev + 1000); // Large increment to ensure uniqueness

                            // Create completely new invoice data with Paid status
                            const paidInvoice = {
                              ...updatedInvoice,
                              status: 'Paid', // Ensure status is exactly 'Paid'
                              paymentDate: new Date().toISOString(),
                              transactionId: `TXN${Date.now()}`
                            };

                            console.log('🔄 Payment state update:', {
                              invoiceId: paidInvoice.id,
                              oldStatus: updatedInvoice.status,
                              newStatus: paidInvoice.status,
                              timestamp: new Date().toISOString(),
                              paidInvoicesSet: Array.from(newPaidInvoices)
                            });

                            // Force immediate state update with completely new data
                            if (data?.invoices) {
                              const newInvoices = data.invoices.map(inv => {
                                if (inv.id === paidInvoice.id) {
                                  console.log(`💰 Updating invoice ${inv.id} from ${inv.status} to ${paidInvoice.status}`);
                                  return { ...paidInvoice }; // Create new object reference
                                }
                                return { ...inv }; // Ensure all objects are new references
                              });

                              console.log('📊 New invoices array:', newInvoices);

                              // Force complete state replacement with new object references
                              const newData = {
                                subscription: { ...data.subscription },
                                invoices: newInvoices
                              };

                              setData(newData);

                              // Multiple refresh triggers for UI update
                              setLocalRefreshTrigger(Date.now());
                              setTimeout(() => setLocalRefreshTrigger(Date.now()), 100);
                              setTimeout(() => setLocalRefreshTrigger(Date.now()), 500);
                              setTimeout(() => setLocalRefreshTrigger(Date.now()), 1000);
                            }

                            // Show success message
                            alert(`✅ Payment of ₹${paidInvoice.amount} completed! Invoice status updated to Paid.`);
                            onSuccess?.('Payment completed successfully');
                          }}
                          onPaymentError={(error: string) => {
                            console.error('Payment error:', error);
                            onError?.(error);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">
              <Typography variant="body2">No invoices found. Your payment history will appear here.</Typography>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Box sx={{ mt: 2, textAlign: 'center', display: 'flex', gap: 2, justifyContent: 'center' }}>
        <Button
          variant="outlined"
          onClick={() => loadBillingData(true)}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : <ScheduleIcon />}
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </Button>
      </Box>
    </Box>
  );
};

export default BillingDashboard;