import React from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  Chip,
} from '@mui/material';
import {
  Bolt as BoltIcon,
  Speed as SpeedIcon,
  DataUsage as DataIcon,
  SupportAgent as SupportIcon,
  Star as StarIcon,
  ArrowForward as ArrowIcon,
  Wifi as WifiIcon,
  Shield as ShieldIcon,
  Rocket as RocketIcon,
} from '@mui/icons-material';

interface PlanPromotionCardProps {
  onBrowsePlans: () => void;
  variant?: 'full' | 'compact';
}

const PlanPromotionCard: React.FC<PlanPromotionCardProps> = ({
  onBrowsePlans,
  variant = 'full',
}) => {
  const plans = [
    { name: 'Basic', speed: '50 Mbps', price: 29, color: '#3b82f6' },
    { name: 'Standard', speed: '100 Mbps', price: 799, color: '#8b5cf6', popular: true },
    { name: 'Premium', speed: '300 Mbps', price: 79, color: '#f59e0b' },
  ];

  if (variant === 'compact') {
    return (
      <Paper
        elevation={3}
        sx={{
          p: 3,
          borderRadius: 3,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          textAlign: 'center',
        }}
      >
        <WifiIcon sx={{ fontSize: 48, color: '#818cf8', mb: 1 }} />
        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, mb: 0.5 }}>
          No Active Plan
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 2 }}>
          Get connected with blazing-fast broadband
        </Typography>
        <Button
          variant="contained"
          fullWidth
          onClick={onBrowsePlans}
          endIcon={<ArrowIcon />}
          sx={{
            py: 1.2,
            borderRadius: 2,
            fontWeight: 700,
            textTransform: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            '&:hover': {
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              transform: 'translateY(-1px)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          Explore Plans
        </Button>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={6}
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b)',
        },
        '@keyframes float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        '@keyframes shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        '@keyframes fadeInUp': {
          from: { opacity: 0, transform: 'translateY(20px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {/* Hero Section */}
      <Box sx={{ p: { xs: 3, md: 4 }, textAlign: 'center' }}>
        <Box
          sx={{
            display: 'inline-flex',
            p: 2,
            borderRadius: 3,
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            mb: 2,
            animation: 'float 3s ease-in-out infinite',
          }}
        >
          <RocketIcon sx={{ fontSize: 48, color: '#818cf8' }} />
        </Box>

        <Typography
          variant="h4"
          sx={{
            color: '#fff',
            fontWeight: 800,
            mb: 1,
            letterSpacing: '-0.5px',
            animation: 'fadeInUp 0.6s ease-out',
          }}
        >
          Get Connected Today! 🚀
        </Typography>

        <Typography
          variant="body1"
          sx={{
            color: 'rgba(255,255,255,0.6)',
            mb: 3,
            maxWidth: 500,
            mx: 'auto',
            lineHeight: 1.6,
          }}
        >
          Choose from our high-speed broadband plans and enjoy seamless streaming, gaming, and work-from-home experience.
        </Typography>

        {/* Feature Highlights */}
        <Stack
          direction="row"
          spacing={3}
          justifyContent="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 4 }}
        >
          {[
            { icon: <SpeedIcon />, text: 'Ultra-Fast Speeds', color: '#3b82f6' },
            { icon: <DataIcon />, text: 'Unlimited Data', color: '#10b981' },
            { icon: <ShieldIcon />, text: 'Secure Network', color: '#f59e0b' },
            { icon: <SupportIcon />, text: '24/7 Support', color: '#ec4899' },
          ].map((feature, i) => (
            <Stack
              key={i}
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                px: 2,
                py: 1,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Box sx={{ color: feature.color, display: 'flex' }}>{feature.icon}</Box>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 500 }}>
                {feature.text}
              </Typography>
            </Stack>
          ))}
        </Stack>

        {/* Mini Plan Cards */}
        <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mb: 4 }}>
          {plans.map((plan, i) => (
            <Box
              key={i}
              sx={{
                p: 2.5,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.04)',
                border: plan.popular
                  ? '2px solid rgba(139, 92, 246, 0.5)'
                  : '1px solid rgba(255,255,255,0.08)',
                minWidth: 160,
                position: 'relative',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  background: 'rgba(255,255,255,0.06)',
                  boxShadow: `0 8px 24px rgba(${plan.popular ? '139,92,246' : '255,255,255'},0.1)`,
                },
              }}
            >
              {plan.popular && (
                <Chip
                  label="⭐ POPULAR"
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    bgcolor: '#7c3aed',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.6rem',
                    letterSpacing: '0.5px',
                    height: 22,
                  }}
                />
              )}
              <Typography variant="body2" sx={{ color: plan.color, fontWeight: 700, mb: 0.5 }}>
                {plan.name}
              </Typography>
              <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ mb: 0.5 }}>
                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 800 }}>
                  ₹{plan.price}
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                  /mo
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <BoltIcon sx={{ fontSize: 14, color: plan.color }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  {plan.speed}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Stack>

        {/* CTA */}
        <Button
          variant="contained"
          size="large"
          endIcon={<ArrowIcon />}
          onClick={onBrowsePlans}
          sx={{
            px: 5,
            py: 1.5,
            borderRadius: 3,
            fontWeight: 700,
            fontSize: '1rem',
            textTransform: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
            backgroundSize: '200% auto',
            boxShadow: '0 6px 24px rgba(99, 102, 241, 0.35)',
            animation: 'shimmer 3s linear infinite',
            '&:hover': {
              boxShadow: '0 8px 32px rgba(99, 102, 241, 0.5)',
              transform: 'translateY(-2px)',
            },
            transition: 'all 0.3s ease',
          }}
        >
          Browse Plans & Get Started
        </Button>

        <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'rgba(255,255,255,0.3)' }}>
          No long-term contracts • Cancel anytime • 30-day billing
        </Typography>
      </Box>
    </Paper>
  );
};

export default PlanPromotionCard;
