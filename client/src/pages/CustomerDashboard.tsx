import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Avatar,
  Stack,
  Badge,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Wifi as PlansIcon,
  Subscriptions as SubscriptionsIcon,
  Analytics as AnalyticsIcon,
  Receipt as BillingIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Speed as SpeedIcon,
  TrendingUp,
  AttachMoney,
  DataUsage,
  SignalWifi4Bar,
  Payment,
  Support,
  Add,
  Notifications as NotificationsIcon,
  Download as DownloadIcon,
  Person as PersonIcon,
  RateReview as FeedbackIcon
} from '@mui/icons-material';
import { BillingDashboard } from '../components/billing';
import SupportCenter from '../components/SupportCenter';
import AccountSettingsSimple from '../components/AccountSettingsSimple';
import UsageTracking from '../components/UsageTracking';
import FeedbackForm from '../components/FeedbackForm';
import BillingReminders from '../components/BillingReminders';
import { useAuth } from '../contexts/AuthContext';
import { useRealtime } from '../contexts/RealtimeContext';
import webSocketService from '../services/webSocketService';
import { customerService, CustomerStats, BillingHistory } from '../services/customerService';
import { Plan, Subscription } from '../types/index';
import RazorpayPaymentForm from '../components/RazorpayPaymentForm';
import AIChatBot from '../components/AIChatBot';
import SpeedTest from '../components/SpeedTest';
import RenewalPromotionCard from '../components/RenewalPromotionCard';
import PlanPromotionCard from '../components/PlanPromotionCard';
import ProfilePage from './ProfilePage';
import { Modal, ModalBody } from '../components/Modal';

const CustomerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { isConnected, refreshSubscriptions, notifications } = useRealtime();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [stats, setStats] = useState<CustomerStats>({
    activeSubscriptions: 0,
    monthlySpending: 0,
    totalDataUsage: 0,
    averageSpeed: 0,
    upcomingBills: 0,
    supportTickets: 0,
  });
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState({
    plans: false,
    subscriptions: false,
    billing: false,
    usage: false,
  });
  const [currentUsageData, setCurrentUsageData] = useState<any>(null);

  // New state for modals and functionality
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);

  // Payment-related states
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState<any>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Renewal dialog state
  const [showRenewalDialog, setShowRenewalDialog] = useState(false);
  const [renewalSubscription, setRenewalSubscription] = useState<Subscription | null>(null);
  const [renewalLoading, setRenewalLoading] = useState(false);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info'
  });

  useEffect(() => {
    // Fetch subscriptions first, then calculate stats
    const initializeDashboard = async () => {
      try {
        console.log('Initializing dashboard...');

        // First fetch subscriptions
        const fetchedSubscriptions = await fetchSubscriptions();

        // Then fetch/calculate stats using the fetched subscriptions
        await fetchCustomerStats(fetchedSubscriptions);
      } catch (error) {
        console.error('Error initializing dashboard:', error);
        setLoading(false);
      }
    };

    initializeDashboard();

    // Auto-refresh customer stats every 60 seconds for updated data
    const refreshInterval = setInterval(() => {
      fetchCustomerStats();
    }, 60000);

    return () => clearInterval(refreshInterval);
  }, []);


  useEffect(() => {
    console.log('🧑 User data received:', user);
    console.log('📡 Real-time connection status:', isConnected);

    // Auto-authenticate WebSocket when user data is available
    if (user && user._id) {
      if (isConnected) {
        console.log('🔐 Authenticating WebSocket with user:', user._id);
        webSocketService.authenticate(user._id);
        localStorage.setItem('userId', user._id);
      } else {
        console.log('⏳ Waiting for WebSocket connection before authentication...');
        // Try to reconnect if not connected
        webSocketService.reconnect();
      }
    }

    if (user) {
      console.log('User properties:', {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        fullName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'Not available'
      });
    }
  }, [user, isConnected]);

  // Refresh subscriptions when real-time events occur
  useEffect(() => {
    if (activeSection === 'subscriptions') {
      fetchSubscriptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSubscriptions, activeSection]);

  // Refresh customer stats when real-time events occur or subscriptions change
  useEffect(() => {
    fetchCustomerStats(subscriptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSubscriptions, subscriptions]);

  const calculateStatsFromSubscriptions = (subs: Subscription[], usageData?: any) => {
    const activeSubs = subs.filter(sub => sub.status === 'active');

    // Calculate total monthly spending with NO TAX POLICY
    const totalMonthlySpending = activeSubs.reduce((total, sub) => {
      const planName = sub.plan?.name;

      if (planName === 'Basic Plan29') {
        return total + 32.18; // Final price with no tax
      } else if (planName === 'Premium Plan79') {
        return total + 98.68; // Final price with no tax
      }
      // For other plans, use base price without tax
      return total + (sub.pricing?.basePrice || sub.pricing?.finalPrice || 0);
    }, 0);

    // Calculate usage and speed from real data
    let totalDataUsage = 0;
    let averageSpeed = 0;

    if (usageData && usageData.totalUsage) {
      // Convert bytes to GB
      totalDataUsage = usageData.totalUsage / (1024 * 1024 * 1024);
    }

    if (usageData && usageData.maxDownloadSpeed) {
      averageSpeed = usageData.maxDownloadSpeed;
    } else if (activeSubs.length > 0 && activeSubs[0].plan?.features?.speed?.download) {
      // Fallback to plan speed
      averageSpeed = activeSubs[0].plan?.features?.speed?.download || 0;
    }

    // Calculate next bill date from active subscriptions
    let nextBillDate: string | undefined = undefined;
    if (activeSubs.length > 0) {
      // Find the earliest end date (next billing date)
      const dates = activeSubs
        .map(sub => sub.endDate)
        .filter(date => date)
        .map(date => new Date(date));

      if (dates.length > 0) {
        const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
        nextBillDate = earliestDate.toISOString();
      }
    }

    return {
      activeSubscriptions: activeSubs.length,
      monthlySpending: totalMonthlySpending || 0,
      totalDataUsage: Number(totalDataUsage.toFixed(2)),
      averageSpeed: Number(averageSpeed.toFixed(1)),
      upcomingBills: activeSubs.length,
      supportTickets: 0,
      nextBillDate: nextBillDate,
    };
  };

  const fetchCustomerStats = async (fetchedSubscriptions?: Subscription[]) => {
    try {
      console.log('Fetching customer stats...');

      // Fetch usage data first
      let usageData = null;
      try {
        const token = localStorage.getItem('access_token');
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/usage/current`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (response.data.success) {
          usageData = response.data.data;
          setCurrentUsageData(usageData);
          console.log('✅ Fetched usage data:', usageData);
        }
      } catch (usageError) {
        console.error('Error fetching usage data:', usageError);
      }

      // Use the passed subscriptions or the state subscriptions
      const subsForCalculation = fetchedSubscriptions || subscriptions;

      // Calculate stats with real usage data
      const calculatedStats = calculateStatsFromSubscriptions(subsForCalculation, usageData);

      console.log('📊 Final calculated stats:', calculatedStats);

      // Set the calculated stats
      setStats(calculatedStats);
    } catch (error) {
      console.error('Error fetching customer stats:', error);

      // Calculate stats based on current subscription data if available
      // Use the passed subscriptions or the state subscriptions
      const subsForCalculation = fetchedSubscriptions || subscriptions;
      console.log('Current subscriptions for stats calculation:', subsForCalculation);
      const calculatedStats = calculateStatsFromSubscriptions(subsForCalculation, currentUsageData);

      console.log('Calculated stats from subscriptions:', {
        totalSubs: subsForCalculation.length,
        activeSubs: calculatedStats.activeSubscriptions,
        subscriptions: subsForCalculation.map(s => ({ id: s._id, status: s.status }))
      });

      // Use calculated stats as fallback
      setStats(calculatedStats);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      setSectionsLoading(prev => ({ ...prev, subscriptions: true }));
      console.log('Fetching customer subscriptions...');

      // Use the new getCustomerSubscriptions method
      const response = await customerService.getCustomerSubscriptions();
      if (response?.subscriptions && Array.isArray(response.subscriptions)) {
        console.log('Subscriptions fetched:', response.subscriptions);
        setSubscriptions(response.subscriptions);
        return response.subscriptions; // Return subscriptions for immediate use
      } else {
        console.warn('Invalid subscriptions data format:', response);
        setSubscriptions([]);
        return []; // Return empty array for immediate use
      }
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      // Set empty array as fallback to prevent blank screen
      setSubscriptions([]);
      return []; // Return empty array for immediate use
    } finally {
      setSectionsLoading(prev => ({ ...prev, subscriptions: false }));
    }
  };

  const fetchAvailablePlans = async () => {
    try {
      setSectionsLoading(prev => ({ ...prev, plans: true }));
      const response = await customerService.getAvailablePlans();
      if (response?.plans && Array.isArray(response.plans)) {
        setAvailablePlans(response.plans);
      } else {
        console.error('Invalid plans data format:', response);
        setAvailablePlans([]);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
      setAvailablePlans([]);
    } finally {
      setSectionsLoading(prev => ({ ...prev, plans: false }));
    }
  };

  const fetchBillingHistory = async () => {
    try {
      setSectionsLoading(prev => ({ ...prev, billing: true }));
      const response = await customerService.getBillingHistory();
      // Handle response structure safely
      if (response && Array.isArray(response.bills)) {
        setBillingHistory(response.bills);
      } else if (response && Array.isArray((response as any).data)) {
        setBillingHistory((response as any).data);
      } else if (Array.isArray(response)) {
        setBillingHistory(response);
      } else {
        setBillingHistory([]);
      }
    } catch (error) {
      console.error('Error fetching billing history:', error);
      setBillingHistory([]);
    } finally {
      setSectionsLoading(prev => ({ ...prev, billing: false }));
    }
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleSubscribe = (plan: Plan) => {
    // Check if user already has an active subscription
    const hasActiveSubscription = subscriptions.some(sub => sub.status === 'active');

    if (hasActiveSubscription) {
      alert('⚠️ You already have an active subscription. You can only have one plan at a time. Please cancel your current subscription first from the "My Subscriptions" section.');
      return;
    }

    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    // Refresh subscriptions to show the newly purchased plan
    await fetchSubscriptions();
    // Show success message
    alert('Subscription activated successfully!');
  };

  const handleLogout = () => {
    logout();
  };

  // New handlers for subscription actions
  const handleViewUsage = (subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setShowUsageModal(true);
  };

  const handleCancelSubscription = (subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setShowCancelModal(true);
  };

  // Renewal flow — open confirmation dialog
  const handleRenewPlan = (subscription: Subscription) => {
    setRenewalSubscription(subscription);
    setShowRenewalDialog(true);
  };

  const handleConfirmRenewal = async () => {
    if (!renewalSubscription) return;
    setRenewalLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
      const renewalAmount = renewalSubscription.pricing?.totalAmount || renewalSubscription.pricing?.finalPrice || renewalSubscription.plan?.pricing?.monthly || 0;

      // 1. Load Razorpay script
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Razorpay'));
          document.body.appendChild(script);
        });
      }

      // 2. Create Razorpay order
      const orderRes = await axios.post(`${API_URL}/razorpay/create-order`, {
        planId: renewalSubscription.plan?._id,
        amount: renewalAmount * 100 // paise
      }, { headers: { Authorization: `Bearer ${token}` } });

      const { order } = orderRes.data.data;

      // 3. Open Razorpay checkout
      const rzp = new window.Razorpay({
        key: process.env.REACT_APP_RAZORPAY_KEY_ID || 'rzp_test_RvlGVIoKWbOQVK',
        amount: order.amount,
        currency: order.currency,
        name: 'BroadbandX',
        description: `Renew ${renewalSubscription.plan?.name || 'Plan'} - 30 Days`,
        order_id: order.id,
        handler: async (response: any) => {
          try {
            // 4. Verify payment
            await axios.post(`${API_URL}/razorpay/verify`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            }, { headers: { Authorization: `Bearer ${token}` } });

            // 5. Call renew API with payment details
            await axios.put(
              `${API_URL}/subscriptions/${renewalSubscription._id}/renew`,
              {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );

            setShowRenewalDialog(false);
            setRenewalSubscription(null);
            setSnackbar({ open: true, message: '✅ Plan renewed successfully! Payment recorded. Your new billing cycle will start after the current one expires.', severity: 'success' });
            await fetchSubscriptions();
          } catch (err: any) {
            console.error('Renewal after payment failed:', err);
            setSnackbar({ open: true, message: 'Payment successful but renewal failed. Please contact support with your payment ID: ' + response.razorpay_payment_id, severity: 'error' });
          }
          setRenewalLoading(false);
        },
        theme: { color: '#2196F3' },
        modal: {
          ondismiss: async () => {
            setRenewalLoading(false);
            setSnackbar({ open: true, message: 'Payment cancelled. Subscription not renewed.', severity: 'warning' });
            // Log cancellation as failure
            try {
              await axios.post(`${API_URL}/payment-failures/log`, {
                amount: renewalAmount,
                planName: renewalSubscription?.plan?.name || 'unknown',
                planId: renewalSubscription?.plan?._id || '',
                errorCode: 'USER_DISMISSED',
                errorDescription: 'User cancelled/dismissed renewal payment',
                razorpayOrderId: order.id,
                type: 'renewal'
              }, { headers: { Authorization: `Bearer ${token}` } });
            } catch (e) { console.error('Failed to log dismissal:', e); }
          }
        }
      });

      rzp.on('payment.failed', async (response: any) => {
        setRenewalLoading(false);
        setSnackbar({ open: true, message: `Payment failed: ${response.error.description}`, severity: 'error' });
        // Log failure to server
        try {
          await axios.post(`${API_URL}/payment-failures/log`, {
            amount: renewalAmount,
            planName: renewalSubscription?.plan?.name || 'unknown',
            planId: renewalSubscription?.plan?._id || '',
            errorCode: response.error.code || 'RAZORPAY_ERROR',
            errorDescription: response.error.description || 'Payment failed',
            razorpayOrderId: order.id,
            razorpayPaymentId: response.error.metadata?.payment_id || '',
            type: 'renewal'
          }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (e) { console.error('Failed to log payment failure:', e); }
      });

      rzp.open();
    } catch (error: any) {
      console.error('Renewal failed:', error);
      setSnackbar({ open: true, message: error.response?.data?.message || 'Failed to initiate renewal payment. Please try again.', severity: 'error' });
      setRenewalLoading(false);
    }
  };

  const confirmCancelSubscription = async () => {
    if (selectedSubscription) {
      try {
        console.log('Cancelling subscription:', selectedSubscription._id);

        // Try to use the real API first
        try {
          await customerService.cancelSubscription(selectedSubscription._id);
          console.log('Successfully cancelled subscription via API');
        } catch (apiError) {
          console.log('API cancellation failed, updating local state:', apiError);
          // If API fails (e.g., no auth, network issues), just update local state
          // This allows the demo to work even when backend is not available
        }

        // Update local state - remove cancelled subscription from UI
        const updatedSubscriptions = subscriptions.filter((sub: Subscription) =>
          sub._id !== selectedSubscription._id
        );

        console.log('Updated subscriptions after cancellation:', {
          total: updatedSubscriptions.length,
          active: updatedSubscriptions.filter((s: Subscription) => s.status === 'active').length
        });

        setSubscriptions(updatedSubscriptions);

        // Immediately update stats based on new subscription data
        const newStats = calculateStatsFromSubscriptions(updatedSubscriptions);
        setStats(newStats);

        console.log('Updated stats after cancellation:', newStats);

        // Refresh customer stats to update subscription count (try API first)
        await fetchCustomerStats(updatedSubscriptions);

        // Trigger real-time refresh for other components
        refreshSubscriptions();

        setShowCancelModal(false);
        setSelectedSubscription(null);

        // Show success message
        alert('Subscription cancelled successfully!');
      } catch (error) {
        console.error('Error cancelling subscription:', error);
        alert('Failed to cancel subscription. Please try again.');
      }
    }
  };

  // Payment handler functions
  const handleBillingError = (errorMessage: string) => {
    setSnackbar({
      open: true,
      message: errorMessage,
      severity: 'error'
    });
  };

  const handleBillingSuccess = (message: string) => {
    setSnackbar({
      open: true,
      message: message,
      severity: 'success'
    });
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handlePayBill = (bill: any) => {
    setSelectedBill(bill);
    setShowPaymentConfirmModal(true);
  };

  const confirmPayment = async () => {
    if (!selectedBill) return;

    try {
      setPaymentLoading(true);

      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update the bill status to paid
      setBillingHistory(prevHistory =>
        prevHistory.map(bill =>
          bill._id === selectedBill._id
            ? {
              ...bill,
              status: 'paid',
              paidDate: new Date().toISOString()
            }
            : bill
        )
      );

      // Update stats to reflect payment
      setStats(prevStats => ({
        ...prevStats,
        monthlySpending: Math.max(0, prevStats.monthlySpending - selectedBill.amount)
      }));

      setShowPaymentConfirmModal(false);
      setSelectedBill(null);

      alert(`Payment of ₹${selectedBill.amount.toLocaleString()} processed successfully!`);
    } catch (error) {
      console.error('Payment failed:', error);
      alert('Payment failed. Please try again.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleDownloadReceipt = (bill: any) => {
    // Simulate receipt download
    const receiptContent = `
      BroadbandX Receipt
      ------------------
      Bill ID: ${bill._id}
      Description: ${bill.description}
      Amount: ₹${bill.amount.toLocaleString()}
      Status: ${bill.status}
      Date: ${new Date().toLocaleDateString()}
    `;

    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${bill._id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, value: 'dashboard' },
    { text: 'Browse Plans', icon: <PlansIcon />, value: 'plans' },
    { text: 'My Subscriptions', icon: <SubscriptionsIcon />, value: 'subscriptions' },
    { text: 'Usage Analytics', icon: <AnalyticsIcon />, value: 'usage' },
    { text: 'Speed Test', icon: <SpeedIcon />, value: 'speedtest' },
    { text: 'Billing', icon: <BillingIcon />, value: 'billing' },
    { text: 'Support', icon: <Support />, value: 'support' },
    { text: 'Feedback', icon: <FeedbackIcon />, value: 'feedback' },
    { text: 'My Profile', icon: <PersonIcon />, value: 'profile' },
    { text: 'Settings', icon: <SettingsIcon />, value: 'settings' },
  ];

  const drawer = (
    <div>
      <Toolbar>
        <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
          {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'D'}
        </Avatar>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ wordWrap: 'break-word', lineHeight: 1.2 }}>
            {user?.firstName && user?.lastName
              ? `${user.firstName} ${user.lastName}`
              : user?.email
                ? user.email.split('@')[0]
                : 'Customer'
            }
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Customer Portal
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={activeSection === item.value}
              onClick={() => setActiveSection(item.value)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={handleLogout}>
            <ListItemIcon>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItemButton>
        </ListItem>
      </List>
    </div>
  );

  const StatCard = ({ title, value, icon, color = "primary", unit = "" }: {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color?: "primary" | "secondary" | "success" | "info";
    unit?: string;
  }) => (
    <Card sx={{ height: '100%', minWidth: 250 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography color="textSecondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4">
              {loading ? <CircularProgress size={24} /> : `${value}${unit}`}
            </Typography>
          </Box>
          <Box sx={{ color: `${color}.main` }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  const PlansSection = () => {
    useEffect(() => {
      if (activeSection === 'plans' && availablePlans.length === 0) {
        fetchAvailablePlans();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection]);

    // Check if user has active subscription
    const hasActiveSubscription = subscriptions.some(sub => sub.status === 'active');

    return (
      <Box>
        <Typography variant="h5" gutterBottom>
          Browse Available Plans
        </Typography>

        {/* Warning Alert for Active Subscriptions */}
        {hasActiveSubscription && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
              ⚠️ You already have an active subscription
            </Typography>
            <Typography variant="body2">
              You can only have one plan at a time. To switch plans, please cancel your current subscription first from the "My Subscriptions" section.
            </Typography>
          </Alert>
        )}

        {sectionsLoading.plans ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : availablePlans.length === 0 ? (
          <Box textAlign="center" py={4}>
            <Typography variant="h6" gutterBottom color="textSecondary">
              No Plans Available
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Please try again later or contact support.
            </Typography>
          </Box>
        ) : (
          <Box display="flex" flexWrap="wrap" gap={3}>
            {availablePlans.map((plan) => (
              <Card key={plan._id} sx={{ minWidth: 300, maxWidth: 400, flex: '1 1 300px' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {plan.name}
                  </Typography>
                  <Typography variant="body2" color="textSecondary" paragraph>
                    {plan.description}
                  </Typography>

                  <Box mb={2}>
                    <Typography variant="h4" color="primary">
                      ₹{plan.pricing.monthly.toLocaleString()}
                      <Typography component="span" variant="body2" color="textSecondary">
                        /month
                      </Typography>
                    </Typography>
                  </Box>

                  <Box mb={2}>
                    <Typography variant="body2" gutterBottom>
                      <SpeedIcon sx={{ fontSize: 16, mr: 1, verticalAlign: 'middle' }} />
                      Speed: {plan.features?.speed?.download || 'N/A'} {plan.features?.speed?.unit || ''} Download
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <DataUsage sx={{ fontSize: 16, mr: 1, verticalAlign: 'middle' }} />
                      Data: {plan.features?.dataLimit?.unlimited ? 'Unlimited' : `${plan.features?.dataLimit?.amount || 0} ${plan.features?.dataLimit?.unit || 'GB'}`}
                    </Typography>
                    <Typography variant="body2">
                      <Chip
                        label={plan.category}
                        size="small"
                        color={plan.category === 'business' ? 'secondary' : 'primary'}
                      />
                    </Typography>
                  </Box>

                  <Button
                    variant={hasActiveSubscription ? "outlined" : "contained"}
                    fullWidth
                    startIcon={<Add />}
                    onClick={() => handleSubscribe(plan)}
                    disabled={hasActiveSubscription}
                    color={hasActiveSubscription ? "warning" : "primary"}
                  >
                    {hasActiveSubscription ? 'Active Subscription Exists' : 'Subscribe Now'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    );
  };

  const SubscriptionsSection = () => {
    useEffect(() => {
      if (activeSection === 'subscriptions' && subscriptions.length === 0) {
        fetchSubscriptions();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection]);

    return (
      <Box>
        <Typography variant="h5" gutterBottom>
          My Subscriptions
        </Typography>

        {sectionsLoading.subscriptions ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : subscriptions.filter(sub => sub.status === 'active').length > 0 ? (
          <Box display="flex" flexWrap="wrap" gap={3}>
            {subscriptions.filter(sub => sub.status === 'active').map((subscription) => (
              <Card key={subscription._id} sx={{ minWidth: 350, maxWidth: 500, flex: '1 1 350px' }}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Typography variant="h6">
                      {subscription.plan?.name || 'Unknown Plan'}
                    </Typography>
                    <Chip
                      label={subscription.status}
                      color={subscription.status === 'active' ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>

                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    {subscription.plan?.description || 'No description available'}
                  </Typography>

                  <Box mt={2}>
                    <Typography variant="body2" gutterBottom>
                      <strong>Speed:</strong> {subscription.plan?.features?.speed?.download || 'N/A'} {subscription.plan?.features?.speed?.unit || ''}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Monthly Cost:</strong> ₹{(subscription.pricing?.finalPrice || subscription.plan?.pricing?.monthly || 0)?.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Billing Cycle:</strong> {subscription.billingCycle || 'Monthly'}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Start Date:</strong> {subscription.startDate ? new Date(subscription.startDate).toLocaleDateString() : 'N/A'}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Next Billing:</strong> {(() => {
                        // Try nextBillingDate first, then endDate, then calculate from startDate + 1 month
                        if (subscription.nextBillingDate) {
                          return new Date(subscription.nextBillingDate).toLocaleDateString();
                        } else if (subscription.endDate) {
                          return new Date(subscription.endDate).toLocaleDateString();
                        } else if (subscription.startDate) {
                          const nextDate = new Date(subscription.startDate);
                          nextDate.setMonth(nextDate.getMonth() + 1);
                          return nextDate.toLocaleDateString();
                        }
                        return 'N/A';
                      })()}
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={1} mt={2} flexWrap="wrap" useFlexGap>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleViewUsage(subscription)}
                    >
                      View Usage
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={() => handleRenewPlan(subscription)}
                      sx={{ fontWeight: 700 }}
                    >
                      🔄 Renew Plan
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => handleCancelSubscription(subscription)}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          <PlanPromotionCard onBrowsePlans={() => setActiveSection('plans')} variant="full" />
        )}
      </Box>
    );
  };

  const BillingSection = () => {
    return (
      <Box>
        <BillingDashboard onError={handleBillingError} onSuccess={handleBillingSuccess} />
      </Box>
    );
  };

  const renderDashboardContent = () => {
    switch (activeSection) {
      case 'plans':
        return <PlansSection />;
      case 'subscriptions':
        return <SubscriptionsSection />;
      case 'billing':
        return <BillingSection />;
      case 'usage':
        return <UsageTracking />;
      case 'speedtest':
        return <SpeedTest />;
      case 'support':
        return <SupportCenter />;
      case 'feedback':
        return <FeedbackForm />;
      case 'profile':
        return <ProfilePage />;
      case 'settings':
        return <AccountSettingsSimple />;
      default:
        return (
          <Box>
            <Typography variant="h4" gutterBottom>
              Customer Dashboard
            </Typography>

            <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
              <StatCard
                title="Active Subscriptions"
                value={stats.activeSubscriptions}
                icon={<SubscriptionsIcon sx={{ fontSize: 40 }} />}
                color="primary"
              />
              <StatCard
                title="Monthly Spending"
                value={stats.activeSubscriptions > 0 ? `₹${stats.monthlySpending.toLocaleString()}` : 'No active subscription'}
                icon={<AttachMoney sx={{ fontSize: 40 }} />}
                color="secondary"
              />
              <StatCard
                title="Data Usage"
                value={stats.totalDataUsage}
                unit=" GB"
                icon={<DataUsage sx={{ fontSize: 40 }} />}
                color="info"
              />
              <StatCard
                title="Average Speed"
                value={stats.averageSpeed}
                unit=" Mbps"
                icon={<SignalWifi4Bar sx={{ fontSize: 40 }} />}
                color="success"
              />
            </Box>

            <Box display="flex" flexWrap="wrap" gap={3}>
              <Card sx={{ flex: '2 1 400px', minWidth: 400 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Quick Actions
                  </Typography>
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                    <Button
                      variant="contained"
                      startIcon={<PlansIcon />}
                      onClick={() => setActiveSection('plans')}
                    >
                      Browse Plans
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<AnalyticsIcon />}
                      onClick={() => setActiveSection('usage')}
                    >
                      View Usage
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<Payment />}
                      onClick={() => setActiveSection('billing')}
                    >
                      Pay Bills
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              <Card sx={{ flex: '1 1 300px', minWidth: 300 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Account Summary
                  </Typography>

                  {/* Current Plan */}
                  <Box mb={2}>
                    <Typography variant="body2" color="textSecondary">
                      Current Plan
                    </Typography>
                    <Typography variant="h6" color="primary">
                      {subscriptions.find(s => s.status === 'active')?.plan?.name || 'No Active Plan'}
                    </Typography>
                  </Box>

                  {/* Next Bill Due */}
                  <Box mb={2}>
                    <Typography variant="body2" color="textSecondary">
                      Next Bill Due
                    </Typography>
                    <Typography variant="h6" color={stats.nextBillDate ? 'primary' : 'textSecondary'}>
                      {stats.nextBillDate ? new Date(stats.nextBillDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }) : stats.activeSubscriptions > 0 ? 'Processing...' : 'Subscribe to a plan'}
                    </Typography>
                  </Box>

                  {/* Subscription Expiry */}
                  <Box mb={2}>
                    <Typography variant="body2" color="textSecondary">
                      Subscription Expires
                    </Typography>
                    <Typography variant="h6" color={
                      (() => {
                        const activeSub = subscriptions.find(s => s.status === 'active');
                        if (!activeSub?.endDate) return 'textSecondary';
                        const daysLeft = Math.ceil((new Date(activeSub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        if (daysLeft <= 3) return 'error';
                        if (daysLeft <= 7) return 'warning';
                        return 'success';
                      })()
                    }>
                      {(() => {
                        const activeSub = subscriptions.find(s => s.status === 'active');
                        if (!activeSub?.endDate) return 'No active plan';
                        const daysLeft = Math.ceil((new Date(activeSub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        const dateStr = new Date(activeSub.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        if (daysLeft <= 0) return `⚠️ Expired`;
                        if (daysLeft <= 3) return `🔴 ${dateStr} (${daysLeft}d left)`;
                        if (daysLeft <= 7) return `🟡 ${dateStr} (${daysLeft}d left)`;
                        return `🟢 ${dateStr} (${daysLeft}d left)`;
                      })()}
                    </Typography>
                  </Box>

                  {/* Member Since */}
                  <Box mb={2}>
                    <Typography variant="body2" color="textSecondary">
                      Member Since
                    </Typography>
                    <Typography variant="h6">
                      {user?.createdAt
                        ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
                        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                    </Typography>
                  </Box>

                  {stats.activeSubscriptions > 0 ? (
                    <Button variant="contained" fullWidth startIcon={<Payment />} onClick={() => setActiveSection('billing')}>
                      Pay Now
                    </Button>
                  ) : (
                    <PlanPromotionCard onBrowsePlans={() => setActiveSection('plans')} variant="compact" />
                  )}
                </CardContent>
              </Card>
            </Box>

            {/* Promotional Card — shown when user has NO active subscription */}
            {stats.activeSubscriptions === 0 && (
              <Box mt={3}>
                <PlanPromotionCard onBrowsePlans={() => setActiveSection('plans')} variant="full" />
              </Box>
            )}

            {/* Renewal Promotion Card — shown when plan is expiring soon */}
            {(() => {
              const activeSub = subscriptions.find(s => s.status === 'active');
              if (!activeSub?.endDate) return null;
              const daysLeft = Math.ceil(
                (new Date(activeSub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );
              if (daysLeft > 10) return null;
              return (
                <Box mt={3}>
                  <RenewalPromotionCard
                    planName={activeSub.plan?.name || 'Your Plan'}
                    endDate={activeSub.endDate}
                    speed={activeSub.plan?.features?.speed?.download
                      ? `${activeSub.plan.features.speed.download} ${activeSub.plan.features.speed.unit || 'Mbps'}`
                      : undefined}
                    price={activeSub.pricing?.finalPrice || activeSub.plan?.pricing?.monthly}
                    onRenew={() => {
                      const renewSub = subscriptions.find(s => s.status === 'active');
                      if (renewSub) handleRenewPlan(renewSub);
                    }}
                    onBrowsePlans={() => setActiveSection('plans')}
                  />
                </Box>
              );
            })()}

            {/* Billing Reminders Section on Dashboard */}
            <Box mt={3}>
              <BillingReminders />
            </Box>
          </Box>
        );
    }
  };

  const drawerWidth = 240;

  return (
    <Box sx={{ display: 'flex' }}>
      {/* App Bar */}
      <AppBar position="fixed" sx={{ width: { sm: `calc(100% - ${drawerWidth}px)` }, ml: { sm: `${drawerWidth}px` } }}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            BroadbandX - Customer Portal
          </Typography>

          {/* Billing Reminders Notification Icon */}
          <BillingReminders compact onClose={() => setActiveSection('dashboard')} />

          {/* Real-time connection status */}
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
            <Chip
              size="small"
              label={isConnected ? 'Connected' : 'Connecting...'}
              color={isConnected ? 'success' : 'warning'}
              sx={{ mr: 1 }}
            />
            {notifications.length > 0 && (
              <Badge badgeContent={notifications.length} color="secondary" sx={{ mr: 1 }}>
                <NotificationsIcon />
              </Badge>
            )}
          </Box>

          <Typography variant="body2" sx={{ mr: 2, flexShrink: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.firstName && user?.lastName
              ? `${user.firstName} ${user.lastName}`
              : user?.email
                ? user.email.split('@')[0]
                : 'Customer'
            }
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="customer navigation"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${drawerWidth}px)` } }}
      >
        <Toolbar />
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
          {renderDashboardContent()}
        </Container>
      </Box>

      {/* Payment Modal */}
      {selectedPlan && (
        <Modal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          title="Subscribe to Plan"
          size="lg"
        >
          <ModalBody>
            <RazorpayPaymentForm
              plan={selectedPlan}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setShowPaymentModal(false)}
            />
          </ModalBody>
        </Modal>
      )}

      {/* View Usage Modal */}
      <Modal
        isOpen={showUsageModal}
        onClose={() => setShowUsageModal(false)}
        title="Usage Analytics"
        size="lg"
      >
        <ModalBody>
          {selectedSubscription && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {selectedSubscription.plan?.name || 'Unknown Plan'} - Usage Details
              </Typography>

              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h4" color="primary" gutterBottom>
                    {selectedSubscription.usage?.currentMonth?.dataUsed || 0} GB
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Data used this month
                  </Typography>
                </CardContent>
              </Card>

              <Box display="flex" gap={2} mb={3}>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6" color="success.main">
                      {selectedSubscription.plan?.features?.speed?.download || 'N/A'} {selectedSubscription.plan?.features?.speed?.unit || ''}
                    </Typography>
                    <Typography variant="body2">Download Speed</Typography>
                  </CardContent>
                </Card>

                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6" color="info.main">
                      {selectedSubscription.plan?.features?.speed?.upload || 'N/A'} {selectedSubscription.plan?.features?.speed?.unit || ''}
                    </Typography>
                    <Typography variant="body2">Upload Speed</Typography>
                  </CardContent>
                </Card>
              </Box>

              <Typography variant="h6" gutterBottom>
                Service History
              </Typography>
              <Box>
                {selectedSubscription.serviceHistory?.map((history, index) => (
                  <Card key={index} sx={{ mb: 1 }}>
                    <CardContent sx={{ py: 1 }}>
                      <Typography variant="body2">
                        <strong>{history.type}</strong> - {history.description}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {new Date(history.date).toLocaleDateString()} by {history.performedBy}
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          )}
        </ModalBody>
      </Modal>

      {/* Cancel Subscription Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Subscription"
        size="md"
      >
        <ModalBody>
          {selectedSubscription && (
            <Box>
              <Typography variant="h6" color="error" gutterBottom>
                Are you sure you want to cancel this subscription?
              </Typography>

              <Card sx={{ mb: 3, bgcolor: 'error.light', color: 'error.contrastText' }}>
                <CardContent>
                  <Typography variant="body1" gutterBottom>
                    <strong>{selectedSubscription.plan?.name || 'Unknown Plan'}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Monthly cost: ₹{(selectedSubscription.pricing?.finalPrice || selectedSubscription.plan?.pricing?.monthly || 0)?.toFixed(2)}
                  </Typography>
                  <Typography variant="body2">
                    Next billing: {selectedSubscription.nextBillingDate || selectedSubscription.endDate
                      ? new Date(selectedSubscription.nextBillingDate || selectedSubscription.endDate).toLocaleDateString()
                      : 'N/A'}
                  </Typography>
                </CardContent>
              </Card>

              <Typography variant="body2" color="textSecondary" paragraph>
                Cancelling this subscription will:
              </Typography>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px' }}>
                <li>Stop all future billing for this plan</li>
                <li>Continue service until the end of your current billing period</li>
                <li>Remove access to plan-specific features after the billing period ends</li>
              </ul>

              <Box display="flex" gap={2} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  onClick={() => setShowCancelModal(false)}
                >
                  Keep Subscription
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={confirmCancelSubscription}
                >
                  Cancel Subscription
                </Button>
              </Box>
            </Box>
          )}
        </ModalBody>
      </Modal>

      {/* Payment Confirmation Modal */}
      <Modal
        isOpen={showPaymentConfirmModal}
        onClose={() => setShowPaymentConfirmModal(false)}
        title="Confirm Payment"
        size="md"
      >
        <ModalBody>
          {selectedBill && (
            <Box>
              <Typography variant="h5" gutterBottom>
                Confirm Payment
              </Typography>

              <Box my={2}>
                <Typography variant="body1" gutterBottom>
                  <strong>Bill Details:</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {selectedBill.description}
                </Typography>

                <Typography variant="body1" gutterBottom>
                  <strong>Amount:</strong> ₹{selectedBill.amount.toLocaleString()}
                </Typography>

                <Typography variant="body1" gutterBottom>
                  <strong>Due Date:</strong> {new Date(selectedBill.dueDate).toLocaleDateString()}
                </Typography>
              </Box>

              <Typography variant="body2" color="text.secondary" paragraph>
                Are you sure you want to proceed with this payment? The amount will be processed immediately.
              </Typography>

              <Box display="flex" gap={2} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  onClick={() => setShowPaymentConfirmModal(false)}
                  disabled={paymentLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={confirmPayment}
                  disabled={paymentLoading}
                >
                  {paymentLoading ? 'Processing...' : `Pay ₹${selectedBill.amount.toLocaleString()}`}
                </Button>
              </Box>
            </Box>
          )}
        </ModalBody>
      </Modal>

      {/* Renewal Confirmation Dialog */}
      <Modal isOpen={showRenewalDialog} onClose={() => { setShowRenewalDialog(false); setRenewalSubscription(null); }}>
        <ModalBody>
          {renewalSubscription && (
            <Box sx={{ p: 2 }}>
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Box sx={{ display: 'inline-flex', p: 1.5, borderRadius: 2, bgcolor: '#e8f5e9', mb: 1.5 }}>
                  <Typography sx={{ fontSize: 36 }}>🔄</Typography>
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Renew Your Plan
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Continue enjoying uninterrupted broadband service
                </Typography>
              </Box>

              <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, bgcolor: '#f5f5f5', mb: 2.5 }}>
                <Stack spacing={1.5}>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">Plan</Typography>
                    <Typography variant="body2" fontWeight={700}>{renewalSubscription.plan?.name || 'Current Plan'}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">Current Cycle Ends</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {renewalSubscription.endDate ? new Date(renewalSubscription.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                    </Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="textSecondary">New Cycle</Typography>
                    <Typography variant="body2" fontWeight={600} color="success.main">
                      {renewalSubscription.endDate
                        ? `${new Date(renewalSubscription.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} → ${new Date(new Date(renewalSubscription.endDate).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : '30 days'}
                    </Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" sx={{ pt: 1, borderTop: '1px dashed #ddd' }}>
                    <Typography variant="body1" fontWeight={700}>Amount</Typography>
                    <Typography variant="body1" fontWeight={700} color="primary">
                      ₹{(renewalSubscription.pricing?.totalAmount || renewalSubscription.pricing?.finalPrice || renewalSubscription.plan?.pricing?.monthly || 0).toLocaleString('en-IN')}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>

              <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }}>
                The renewed plan will activate automatically after your current cycle ends. You won't lose any remaining days.
              </Alert>

              <Stack spacing={2}>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => { setShowRenewalDialog(false); setRenewalSubscription(null); }}
                    disabled={renewalLoading}
                    sx={{ py: 1.2 }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    fullWidth
                    color="success"
                    onClick={handleConfirmRenewal}
                    disabled={renewalLoading}
                    sx={{
                      py: 1.2,
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                    }}
                  >
                    {renewalLoading ? 'Processing...' : '💳 Pay & Renew'}
                  </Button>
                </Stack>
                <Button
                  variant="text"
                  fullWidth
                  onClick={() => { setShowRenewalDialog(false); setRenewalSubscription(null); setActiveSection('plans'); }}
                  sx={{ textTransform: 'none', color: 'primary.main' }}
                >
                  Or browse other plans →
                </Button>
              </Stack>
            </Box>
          )}
        </ModalBody>
      </Modal>

      {/* Error/Success Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* AI Chat Support Bot */}
      <AIChatBot />
    </Box>
  );
};

export default CustomerDashboard;