import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Button,
  Stack
} from '@mui/material';
import { Search, Refresh, Error as ErrorIcon, Cancel as CancelIcon } from '@mui/icons-material';
import { adminService } from '../services/adminService';
import { customerService } from '../services/customerService';
import { useAuth } from '../contexts/AuthContext';
import { Subscription } from '../types/index';

const SubscriptionsPage: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { user } = useAuth();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (!window.confirm('Are you sure you want to cancel this subscription? This action cannot be undone.')) {
      return;
    }

    try {
      setCancellingId(subscriptionId);
      await adminService.cancelSubscription(subscriptionId, 'Cancelled by admin');
      alert('Subscription cancelled successfully');
      fetchSubscriptions(); // Refresh the list
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      alert('Failed to cancel subscription. Please try again.');
    } finally {
      setCancellingId(null);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      setError(null); // Clear previous errors
      console.log('🔍 Fetching subscriptions for user:', user?.email, 'role:', user?.role);

      let response;

      // Use different service based on user role
      if (user?.role === 'admin') {
        console.log('📡 Fetching as admin user...');
        response = await adminService.getAllSubscriptions({
          page,
          limit: 10,
          search,
          status: statusFilter === 'all' ? undefined : statusFilter
        });

        console.log('📡 Admin subscription response:', JSON.stringify(response, null, 2));

        if (response && response.success) {
          const subscriptionData = response.data || [];
          setSubscriptions(subscriptionData);
          setTotalPages(response.pagination?.pages || 1);
          console.log('✅ Admin subscriptions set successfully:', subscriptionData.length, 'items');
        } else {
          setError('Failed to fetch subscriptions - Invalid response format');
        }
      } else {
        // Customer user - use customer service
        console.log('📡 Fetching as customer user...');
        const customerResponse = await customerService.getCustomerSubscriptions();

        console.log('📡 Customer subscription response:', JSON.stringify(customerResponse, null, 2));

        if (customerResponse && customerResponse.subscriptions) {
          setSubscriptions(customerResponse.subscriptions);
          setTotalPages(1); // Customer only has their own subscriptions, no pagination needed
          console.log('✅ Customer subscriptions set successfully:', customerResponse.subscriptions.length, 'items');

          // Log individual subscription details
          customerResponse.subscriptions.forEach((sub, index) => {
            console.log(`📋 Customer Subscription ${index + 1}: ${sub.plan?.name} (${sub.status})`);
          });
        } else {
          console.log('ℹ️ No subscriptions found for customer');
          setSubscriptions([]);
        }
      }

    } catch (err) {
      console.error('💥 Critical error fetching subscriptions:', err);

      // Enhanced error handling
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch') || err.message.includes('Network')) {
          setError('Network error: Unable to connect to server. Please check if the backend server is running on port 5001.');
        } else if (err.message.includes('401') || err.message.includes('unauthorized')) {
          setError('Authentication error: Please log in again.');
        } else if (err.message.includes('403') || err.message.includes('forbidden')) {
          setError('Permission error: You don\'t have access to view subscriptions.');
        } else {
          setError(`Error: ${err.message}`);
        }
      } else {
        setError('Unknown error occurred while fetching subscriptions');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [page, search, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'cancelled': return 'error';
      case 'grace_period': return 'warning';
      case 'suspended': return 'warning';
      case 'expired': return 'default';
      default: return 'default';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatPrice = (price: number) => {
    return `₹${price.toFixed(2)}`;
  };


  if (loading && subscriptions.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        {user?.role === 'admin' ? 'All Subscriptions' : 'My Subscriptions'}
      </Typography>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                onClick={fetchSubscriptions}
                startIcon={<Refresh />}
                disabled={loading}
              >
                Retry
              </Button>
            </Stack>
          }
          icon={<ErrorIcon />}
        >
          <Typography variant="body2" component="div">
            <strong>Failed to load subscriptions</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {error}
          </Typography>
          {error.includes('Network error') && (
            <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
              💡 Make sure the backend server is running with: <code>cd server && npm run dev</code>
            </Typography>
          )}
        </Alert>
      )}

      {/* Filters */}
      {user?.role === 'admin' && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                placeholder="Search by email or plan name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 300 }}
              />

              <FormControl sx={{ minWidth: 150 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="all">All Status</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="cancelled">Cancelled</MenuItem>
                  <MenuItem value="grace_period">Grace Period</MenuItem>
                  <MenuItem value="expired">Expired</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Subscriptions Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {user?.role === 'admin' && <TableCell>Customer</TableCell>}
              <TableCell>Plan</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Billing Cycle</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Start Date</TableCell>
              <TableCell>End Date</TableCell>
              <TableCell>Cancellation Details</TableCell>
              {user?.role === 'admin' && <TableCell>Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {subscriptions.map((subscription) => (
              <TableRow key={subscription._id}>
                {user?.role === 'admin' && (
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        {typeof subscription.user === 'object' && subscription.user ?
                          `${subscription.user.firstName || ''} ${subscription.user.lastName || ''}`.trim() || subscription.user.email :
                          subscription.user || 'N/A'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {typeof subscription.user === 'object' && subscription.user ?
                          subscription.user.email :
                          'User details not populated'}
                      </Typography>
                    </Box>
                  </TableCell>
                )}
                <TableCell>
                  <Box>
                    <Typography variant="body2" fontWeight="bold">
                      {subscription.plan?.name || 'Unknown Plan'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {subscription.plan?.category || 'N/A'}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip
                    label={subscription.status.toUpperCase()}
                    color={getStatusColor(subscription.status) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={(subscription.billingCycle || 'monthly').toUpperCase()}
                    variant="outlined"
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold">
                    {formatPrice(subscription.plan?.pricing?.monthly || subscription.pricing?.totalAmount || 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    /{subscription.billingCycle || 'monthly'}
                  </Typography>
                </TableCell>
                <TableCell>{formatDate(subscription.startDate)}</TableCell>
                <TableCell>
                  {subscription.status === 'cancelled' && (subscription as any).cancellation?.effectiveDate
                    ? formatDate((subscription as any).cancellation.effectiveDate)
                    : subscription.endDate ? formatDate(subscription.endDate) : 'N/A'}
                  {subscription.status === 'grace_period' && (subscription as any).gracePeriodEnd && (
                    <Typography variant="caption" display="block" color="warning.main">
                      Grace ends: {formatDate((subscription as any).gracePeriodEnd)}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {subscription.status === 'cancelled' ? (
                    <Box>
                      <Typography variant="caption" sx={{ bgcolor: 'error.light', color: 'error.dark', px: 1, py: 0.3, borderRadius: 1, display: 'inline-block' }}>
                        {(subscription as any).cancellation?.reason
                          ? ((subscription as any).cancellation.reason.length > 50
                            ? (subscription as any).cancellation.reason.substring(0, 50) + '...'
                            : (subscription as any).cancellation.reason)
                          : 'No reason recorded'}
                      </Typography>
                      {(subscription as any).cancellation?.requestDate && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                          On: {formatDate((subscription as any).cancellation.requestDate)}
                        </Typography>
                      )}
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary">—</Typography>
                  )}
                </TableCell>
                {user?.role === 'admin' && (
                  <TableCell>
                    {subscription.status !== 'cancelled' && (
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={<CancelIcon />}
                        disabled={cancellingId === subscription._id}
                        onClick={() => handleCancelSubscription(subscription._id)}
                      >
                        {cancellingId === subscription._id ? 'Cancelling...' : 'Cancel'}
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {subscriptions.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" color="text.secondary">
            {user?.role === 'admin' ? 'No subscriptions found' : 'You don\'t have any subscriptions yet'}
          </Typography>
          {user?.role === 'customer' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Browse our plans and subscribe to get started!
            </Typography>
          )}
        </Box>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, newPage) => setPage(newPage)}
            color="primary"
          />
        </Box>
      )}
    </Box>
  );
};

export default SubscriptionsPage;