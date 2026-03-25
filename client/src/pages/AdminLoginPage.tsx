import React, { useState } from 'react';
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Link as MuiLink,
} from '@mui/material';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

const AdminLoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', password: '' });
  const { login, logout, isAuthenticated, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already logged in as admin
  React.useEffect(() => {
    if (isAuthenticated && isAdmin) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, isAdmin, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!form.email || !form.password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    try {
      if (isAuthenticated) {
        await logout();
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      await login(form.email, form.password, 'admin');
      setForm({ email: '', password: '' });
      alert('Welcome, Admin! 👑 You are now logged in to the BroadbandX admin panel.');
      navigate('/admin', { replace: true });
    } catch (err: any) {
      const msg = err.message || 'Login failed.';
      if (msg.includes('Invalid credentials for')) {
        setError('Invalid admin credentials. This portal is for administrators only.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Card elevation={12} sx={{ borderRadius: 4, overflow: 'hidden' }}>
          {/* Header */}
          <Box sx={{
            background: 'linear-gradient(135deg, #e94560 0%, #c62828 100%)',
            color: '#fff',
            py: 4,
            px: 4,
            textAlign: 'center',
          }}>
            <AdminPanelSettingsIcon sx={{ fontSize: 48, mb: 1, opacity: 0.9 }} />
            <Typography variant="h4" component="h1" fontWeight={700}>
              Admin Portal
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
              BroadbandX Administration Panel
            </Typography>
          </Box>

          <CardContent sx={{ p: 4 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Admin Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleInputChange}
                margin="normal"
                required
                disabled={loading}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                fullWidth
                label="Admin Password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleInputChange}
                margin="normal"
                required
                disabled={loading}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  mt: 3,
                  mb: 2,
                  py: 1.5,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #e94560, #c62828)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #d63851, #b71c1c)',
                  },
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : '🔐 Sign In as Admin'}
              </Button>
            </form>

            <Box sx={{ textAlign: 'center', mt: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Not an admin?{' '}
                <MuiLink component={RouterLink} to="/login" underline="hover" fontWeight={600}>
                  Customer Login
                </MuiLink>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                <MuiLink component={RouterLink} to="/" underline="hover">
                  ← Back to Home
                </MuiLink>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
};

export default AdminLoginPage;
