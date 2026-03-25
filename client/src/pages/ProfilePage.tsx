import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Avatar,
  Chip,
  Divider,
  LinearProgress,
  Button,
  Stack,
  Paper,
} from '@mui/material';
import {
  Person,
  Email,
  Phone,
  LocationOn,
  CalendarToday,
  Speed,
  DataUsage,
  Subscriptions,
  Shield,
  Edit,
  ArrowForward,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface SubscriptionInfo {
  plan?: { name?: string; features?: any; pricing?: any };
  status?: string;
  startDate?: string;
  endDate?: string;
}

interface UsageInfo {
  totalUsage?: number;
  dataLimit?: number;
  dataLimitGB?: number;
  maxDownloadSpeed?: number;
}

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [usageData, setUsageData] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = { Authorization: `Bearer ${token}` };
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';

      const [subsRes, usageRes] = await Promise.allSettled([
        axios.get(`${apiUrl}/api/customer/subscriptions`, { headers }),
        axios.get(`${apiUrl}/api/usage/current`, { headers }),
      ]);

      if (subsRes.status === 'fulfilled') {
        const responseData = subsRes.value.data;
        const subs = responseData?.data?.subscriptions || responseData?.subscriptions || responseData?.data || [];
        const activeSub = Array.isArray(subs) ? subs.find((s: any) => s.status === 'active') : null;
        setSubscription(activeSub);
      }

      if (usageRes.status === 'fulfilled' && usageRes.value.data?.success) {
        setUsageData(usageRes.value.data.data);
      }
    } catch (err) {
      console.error('Error fetching profile data:', err);
    } finally {
      setLoading(false);
    }
  };

  const memberSince = user?.customerSince || user?.createdAt || new Date().toISOString();
  const daysAsMember = Math.floor((Date.now() - new Date(memberSince).getTime()) / (1000 * 60 * 60 * 24));

  const usageGB = usageData?.totalUsage ? (usageData.totalUsage / (1024 * 1024 * 1024)).toFixed(2) : '0';
  const dataLimitGB = usageData?.dataLimitGB || usageData?.dataLimit || 100;
  const usagePercent = Math.min((parseFloat(usageGB) / dataLimitGB) * 100, 100);

  const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <Box display="flex" alignItems="center" gap={2} py={1.2}>
      <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
      <Box flex={1}>
        <Typography variant="caption" color="textSecondary" display="block" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Typography>
        <Typography variant="body1" fontWeight={600}>
          {value}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 3 } }}>
      {/* Profile Header Card */}
      <Card
        elevation={0}
        sx={{
          mb: 3,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#fff',
          borderRadius: 4,
          overflow: 'visible',
          position: 'relative',
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Box display="flex" alignItems="center" gap={3} flexWrap="wrap">
            <Avatar
              sx={{
                width: 90,
                height: 90,
                fontSize: 36,
                bgcolor: 'rgba(255,255,255,0.2)',
                border: '3px solid rgba(255,255,255,0.4)',
                fontWeight: 700,
              }}
            >
              {user?.firstName?.charAt(0)?.toUpperCase()}{user?.lastName?.charAt(0)?.toUpperCase()}
            </Avatar>
            <Box flex={1}>
              <Typography variant="h4" fontWeight={700}>
                {user?.firstName} {user?.lastName}
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.85, mt: 0.5 }}>
                {user?.email}
              </Typography>
              <Stack direction="row" spacing={1} mt={1.5}>
                <Chip
                  label={user?.status === 'active' ? '● Active' : '● Inactive'}
                  size="small"
                  sx={{
                    bgcolor: user?.status === 'active' ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                  }}
                />
                <Chip
                  label={user?.role === 'admin' ? '👑 Admin' : '👤 Customer'}
                  size="small"
                  sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.75rem' }}
                />
                <Chip
                  label={`📅 ${daysAsMember} days`}
                  size="small"
                  sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.75rem' }}
                />
              </Stack>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={3}>
        {/* Personal Information */}
        <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6" fontWeight={700}>Personal Information</Typography>
            </Box>
            <Divider sx={{ mb: 1 }} />

            <InfoRow icon={<Person fontSize="small" />} label="Full Name" value={`${user?.firstName || ''} ${user?.lastName || ''}`} />
            <InfoRow icon={<Email fontSize="small" />} label="Email Address" value={user?.email || 'Not set'} />
            <InfoRow icon={<Phone fontSize="small" />} label="Phone Number" value={user?.phone || 'Not set'} />
            <InfoRow
              icon={<LocationOn fontSize="small" />}
              label="Address"
              value={user?.address ? `${user.address.street || ''}, ${user.address.city || ''}, ${user.address.state || ''} ${user.address.zipCode || ''}` : 'Not set'}
            />
            <InfoRow
              icon={<CalendarToday fontSize="small" />}
              label="Member Since"
              value={new Date(memberSince).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
          </CardContent>
        </Card>

        {/* Subscription Details */}
        <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Subscription</Typography>
            <Divider sx={{ mb: 2 }} />

            {subscription ? (
              <>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'primary.main',
                    color: '#fff',
                    mb: 2,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Current Plan</Typography>
                  <Typography variant="h5" fontWeight={700}>{subscription.plan?.name || 'Unknown'}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8, mt: 0.5 }}>
                    ₹{subscription.plan?.pricing?.monthly?.toLocaleString() || '0'}/month
                  </Typography>
                </Paper>

                <InfoRow
                  icon={<Speed fontSize="small" />}
                  label="Download Speed"
                  value={`${subscription.plan?.features?.speed?.download || 'N/A'} ${subscription.plan?.features?.speed?.unit || 'Mbps'}`}
                />
                <InfoRow
                  icon={<DataUsage fontSize="small" />}
                  label="Data Limit"
                  value={subscription.plan?.features?.dataLimit?.unlimited ? 'Unlimited' : `${subscription.plan?.features?.dataLimit?.amount || 'N/A'} GB`}
                />
                <InfoRow
                  icon={<CalendarToday fontSize="small" />}
                  label="Active Since"
                  value={subscription.startDate ? new Date(subscription.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                />
                <InfoRow
                  icon={<Subscriptions fontSize="small" />}
                  label="Renewal Date"
                  value={subscription.endDate ? new Date(subscription.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                />
              </>
            ) : (
              <Box textAlign="center" py={3}>
                <Subscriptions sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="textSecondary" gutterBottom>No Active Subscription</Typography>
                <Typography variant="body2" color="textSecondary" mb={2}>
                  Subscribe to a broadband plan to get started
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Security & Preferences */}
        <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Security & Preferences</Typography>
            <Divider sx={{ mb: 2 }} />

            <InfoRow icon={<Shield fontSize="small" />} label="Email Verified" value={user?.emailVerified ? '✅ Verified' : '❌ Not Verified'} />
            <InfoRow icon={<Shield fontSize="small" />} label="Account Status" value={user?.status === 'active' ? '✅ Active' : '⚠️ ' + (user?.status || 'Unknown')} />
            <InfoRow
              icon={<Email fontSize="small" />}
              label="Email Notifications"
              value={user?.preferences?.notifications?.email !== false ? '✅ Enabled' : '❌ Disabled'}
            />
            <InfoRow
              icon={<DataUsage fontSize="small" />}
              label="Data Usage Alerts"
              value={user?.preferences?.dataUsageAlerts?.enabled !== false ? `✅ At ${user?.preferences?.dataUsageAlerts?.threshold || 80}%` : '❌ Disabled'}
            />
            <InfoRow
              icon={<CalendarToday fontSize="small" />}
              label="Last Login"
              value={user?.lastLogin ? new Date(user.lastLogin).toLocaleString('en-US') : 'Current session'}
            />
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default ProfilePage;