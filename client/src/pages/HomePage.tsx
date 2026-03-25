import React from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  AppBar,
  Toolbar,
  useTheme,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import WifiIcon from '@mui/icons-material/Wifi';
import SpeedIcon from '@mui/icons-material/Speed';
import SecurityIcon from '@mui/icons-material/Security';
import SupportIcon from '@mui/icons-material/Support';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, user } = useAuth();
  const theme = useTheme();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate(isAdmin ? '/admin' : '/dashboard');
    } else {
      navigate('/register');
    }
  };

  const features = [
    {
      icon: <WifiIcon fontSize="large" color="primary" />,
      title: 'High-Speed Broadband',
      description: 'Ultra-fast fiber and cable internet with speeds up to 1000 Mbps',
    },
    {
      icon: <SpeedIcon fontSize="large" color="primary" />,
      title: 'Reliable Performance',
      description: '99.9% uptime guarantee with consistent speeds throughout the day',
    },
    {
      icon: <SecurityIcon fontSize="large" color="primary" />,
      title: 'Advanced Security',
      description: 'Built-in malware protection and enterprise-grade security features',
    },
    {
      icon: <SupportIcon fontSize="large" color="primary" />,
      title: '24/7 Support',
      description: 'Round-the-clock customer support with technical assistance',
    },
  ];

  return (
    <>
      {/* Navigation Bar */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            🌐 BroadbandX
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button color="inherit" onClick={() => navigate('/plans')}>
              Plans
            </Button>
            {isAuthenticated ? (
              <Button
                color="inherit"
                onClick={() => navigate(isAdmin ? '/admin' : '/dashboard')}
              >
                {user?.firstName || 'Dashboard'}
              </Button>
            ) : (
              <>
                <Button color="inherit" onClick={() => navigate('/login')}>
                  Login
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleGetStarted}
                >
                  Get Started
                </Button>
              </>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      {/* Hero Section */}
      <Box
        sx={{
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: 'white',
          py: 12,
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h1" component="h1" gutterBottom>
            Ultra-Fast Broadband
            <br />
            <Typography variant="h1" component="span" color="secondary.main">
              For Everyone
            </Typography>
          </Typography>
          <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
            Experience lightning-fast internet with our cutting-edge broadband technology.
            Perfect for homes, businesses, and everything in between.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              color="secondary"
              size="large"
              onClick={handleGetStarted}
              sx={{ px: 4, py: 1.5 }}
            >
              Get Started Today
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              size="large"
              onClick={() => navigate('/plans')}
              sx={{ px: 4, py: 1.5, borderColor: 'white', color: 'white' }}
            >
              View Plans
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h2" component="h2" textAlign="center" gutterBottom>
          Why Choose BroadbandX?
        </Typography>
        <Typography
          variant="h6"
          textAlign="center"
          color="text.secondary"
          sx={{ mb: 6 }}
        >
          We provide the fastest, most reliable broadband services with exceptional customer support
        </Typography>

        {/* Features Cards */}
        <Box sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          justifyContent: 'center'
        }}>
          {features.map((feature, index) => (
            <Card key={index} sx={{
              width: { xs: '100%', sm: '45%', md: '22%' },
              textAlign: 'center',
              p: 2
            }}>
              <CardContent>
                <Box sx={{ mb: 2 }}>
                  {feature.icon}
                </Box>
                <Typography variant="h6" component="h3" gutterBottom>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {feature.description}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Container>

      {/* Plans Preview Section */}
      <Box sx={{ bgcolor: 'background.default', py: 8 }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" textAlign="center" gutterBottom>
            Choose Your Perfect Plan
          </Typography>
          <Typography
            variant="h6"
            textAlign="center"
            color="text.secondary"
            sx={{ mb: 6 }}
          >
            From basic browsing to enterprise solutions, we have a plan for everyone
          </Typography>

          {/* Plans Cards */}
          <Box sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            justifyContent: 'center'
          }}>
            {[
              { name: 'Basic', price: 499, speed: '60 Mbps', popular: false },
              { name: 'Standard', price: 799, speed: '100 Mbps', popular: true },
              { name: 'Premium', price: 1199, speed: '200 Mbps', popular: false },
            ].map((plan, index) => (
              <Card
                key={index}
                sx={{
                  position: 'relative',
                  width: { xs: '100%', sm: '45%', md: '30%' },
                  border: plan.popular ? 2 : 1,
                  borderColor: plan.popular ? 'primary.main' : 'divider',
                }}
              >
                {plan.popular && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -1,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      bgcolor: 'primary.main',
                      color: 'white',
                      px: 2,
                      py: 0.5,
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      borderRadius: '0 0 8px 8px',
                    }}
                  >
                    Most Popular
                  </Box>
                )}
                <CardContent sx={{ textAlign: 'center', p: 3 }}>
                  <Typography variant="h5" component="h3" gutterBottom>
                    {plan.name}
                  </Typography>
                  <Typography variant="h3" component="div" color="primary.main" gutterBottom>
                    ₹{plan.price}
                    <Typography variant="body2" component="span" color="text.secondary">
                      /month
                    </Typography>
                  </Typography>
                  <Typography variant="h6" gutterBottom>
                    {plan.speed} Download
                  </Typography>
                  <Button
                    variant={plan.popular ? 'contained' : 'outlined'}
                    color="primary"
                    fullWidth
                    size="large"
                    onClick={() => navigate('/plans')}
                    sx={{ mt: 2 }}
                  >
                    Choose Plan
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Button
              variant="outlined"
              color="primary"
              size="large"
              onClick={() => navigate('/plans')}
            >
              View All Plans
            </Button>
          </Box>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box sx={{ bgcolor: 'primary.main', color: 'white', py: 8 }}>
        <Container maxWidth="md" sx={{ textAlign: 'center' }}>
          <Typography variant="h3" component="h2" gutterBottom>
            Ready to Get Connected?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join thousands of satisfied customers enjoying ultra-fast broadband
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            size="large"
            onClick={handleGetStarted}
            sx={{ px: 4, py: 1.5 }}
          >
            Get Started Now
          </Button>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ bgcolor: 'grey.900', color: 'white', py: 4 }}>
        <Container maxWidth="lg">
          <Box sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 4
          }}>
            <Box>
              <Typography variant="h6" gutterBottom>
                🌐 BroadbandX
              </Typography>
              <Typography variant="body2" color="grey.400">
                Connecting you to the world with ultra-fast, reliable broadband services.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" gutterBottom>
                Quick Links
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button color="inherit" size="small" onClick={() => navigate('/plans')}>
                  Plans & Pricing
                </Button>
                <Button color="inherit" size="small" onClick={() => navigate('/login')}>
                  Customer Login
                </Button>
                <Button color="inherit" size="small">
                  Support
                </Button>
              </Box>
            </Box>
          </Box>
          <Box sx={{ mt: 4, pt: 4, borderTop: 1, borderColor: 'grey.700', textAlign: 'center' }}>
            <Typography variant="body2" color="grey.400">
              © 2026 BroadbandX. All rights reserved.
            </Typography>
          </Box>
        </Container>
      </Box>
    </>
  );
};

export default HomePage;