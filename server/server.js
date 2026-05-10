const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Load environment variables from root directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const planRoutes = require('./routes/plans');
const subscriptionRoutes = require('./routes/subscriptions');
const adminRoutes = require('./routes/admin');
const planRequestRoutes = require('./routes/planRequests');
const usageRoutes = require('./routes/usage');
const razorpayRoutes = require('./routes/razorpay');
const notificationRoutes = require('./routes/notificationRoutes');
const feedbackRoutes = require('./routes/feedback');
// const analyticsRoutes = require('./routes/analytics');
const recommendationRoutes = require('./routes/recommendations');
const pricingRoutes = require('./routes/pricing');
const aiPricingRoutes = require('./routes/aiPricingRoutes');
const supportRoutes = require('./routes/supportRoutes');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');
const RealTimeEvents = require('./utils/realTimeEvents');

// Import services
const usageAnalyticsService = require('./services/UsageAnalyticsService');
const churnMonitoringService = require('./services/ChurnMonitoringService');
const reminderSchedulerService = require('./services/ReminderSchedulerService');
const usageSimulatorService = require('./services/UsageSimulatorService');
const scheduledReportService = require('./services/scheduledReportService');
const subscriptionExpiryService = require('./services/SubscriptionExpiryService');

const app = express();
const server = createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Security middleware with Content Security Policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com", "ws://localhost:*", "wss://localhost:*"],
      frameSrc: ["https://api.razorpay.com", "https://checkout.razorpay.com"]
    }
  }
}));
app.use(compression());

// Rate limiting - More lenient in development
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : (process.env.RATE_LIMIT_MAX_REQUESTS || 100), // Much higher limit for development
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
});

// Stricter rate limiting for authentication endpoints (anti-brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 5, // 5 login attempts per 15 min in production
  message: {
    error: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting
app.use('/api/', limiter);

// CORS configuration - More permissive for development
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  preflightContinue: false
};

// Apply CORS before any routes
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data Sanitization against NoSQL Injection
app.use(mongoSanitize());

// Data Sanitization against XSS
app.use(xss());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// MongoDB connection with improved error handling and retry logic
const connectDB = async () => {
  try {
    // Check if MONGO_URI exists
    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI not found in environment variables');
      process.exit(1);
    }

    console.log('🔄 Connecting to MongoDB...');

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Connection pool settings
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      // Increased timeout settings for better reliability
      serverSelectionTimeoutMS: 30000, // Increased from 5000
      socketTimeoutMS: 60000,          // Increased from 45000
      connectTimeoutMS: 30000,         // Increased from 10000
      // Retry settings
      retryWrites: true,
      retryReads: true,
      // Heartbeat settings
      heartbeatFrequencyMS: 10000,
    });

    console.log(`✅ Connected to MongoDB Atlas: ${conn.connection.host}`);

    // Start usage analytics service
    console.log('📊 Starting Usage Analytics Service...');
    usageAnalyticsService.start();
    console.log('✅ Usage Analytics Service started - will update every 4 hours');

    // Start churn monitoring service
    console.log('🔍 Starting Churn Monitoring Service...');
    churnMonitoringService.start();
    console.log('✅ Churn Monitoring Service started - will scan every 6 hours');

    // Start billing reminder scheduler service
    console.log('🔔 Starting Reminder Scheduler Service...');
    reminderSchedulerService.start();
    console.log('✅ Reminder Scheduler Service started - will send reminders for expiring plans');

    // Start usage simulator service
    console.log('📈 Starting Usage Simulator Service...');
    usageSimulatorService.start();
    console.log('✅ Usage Simulator Service started - will generate usage data every hour');

    // Start scheduled report service (weekly/monthly AI pricing reports)
    console.log('📅 Starting Scheduled Report Service...');
    scheduledReportService.start();
    console.log('✅ Scheduled Report Service started - will email reports on schedule');

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    return conn;

  } catch (error) {
    console.error('❌ MongoDB Atlas connection failed:', error.message);
    console.error('🔍 Please check your MONGO_URI in .env file');
    console.error('⚠️  Application requires MongoDB Atlas - no local fallback available');
    process.exit(1);
  }
};

// Initialize database connection
connectDB();

// Socket.io connection handling
const realTimeEvents = new RealTimeEvents(io);

io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);

  // Handle user authentication and join personal room
  socket.on('authenticate', (userId) => {
    socket.userId = userId;
    socket.join(`user_${userId}`);
    console.log(`👤 User ${userId} authenticated and joined personal room`);

    // Send confirmation
    socket.emit('authenticated', { userId, socketId: socket.id });
  });

  // Handle joining user room
  socket.on('join_user_room', (userId) => {
    socket.userId = userId;
    socket.join(`user_${userId}`);
    console.log(`👤 User ${userId} joined personal room`);
  });

  // Handle admin room joining
  socket.on('join_admin_room', () => {
    socket.join('admin_room');
    socket.join('admins'); // Also join 'admins' room for ticket notifications
    console.log(`👑 Admin user joined admin room: ${socket.id}`);
  });

  // Handle admin room leaving
  socket.on('leave_admin_room', () => {
    socket.leave('admin_room');
    socket.leave('admins');
    console.log(`👋 User left admin room: ${socket.id}`);
  });

  // Handle subscription events
  socket.on('subscribe_to_updates', (data) => {
    console.log('📡 User subscribed to updates:', data);
  });

  // Real-time usage simulation for live counter
  socket.on('start_usage_tracking', () => {
    if (socket._usageInterval) clearInterval(socket._usageInterval);

    // Simulated session usage state
    let sessionDownload = 0;
    let sessionUpload = 0;

    socket._usageInterval = setInterval(() => {
      // Simulate realistic usage increments (bytes)
      const downloadIncrement = Math.floor(Math.random() * 500000) + 100000; // 100KB - 600KB per tick
      const uploadIncrement = Math.floor(Math.random() * 150000) + 30000;    // 30KB - 180KB per tick
      const currentSpeed = (Math.random() * 80 + 20).toFixed(1); // 20-100 Mbps
      const uploadSpeed = (Math.random() * 30 + 5).toFixed(1);   // 5-35 Mbps

      sessionDownload += downloadIncrement;
      sessionUpload += uploadIncrement;

      socket.emit('usage_tick', {
        downloadIncrement,
        uploadIncrement,
        currentDownloadSpeed: parseFloat(currentSpeed),
        currentUploadSpeed: parseFloat(uploadSpeed),
        sessionDownload,
        sessionUpload,
        sessionTotal: sessionDownload + sessionUpload,
        timestamp: Date.now(),
        status: parseFloat(currentSpeed) > 50 ? 'excellent' : parseFloat(currentSpeed) > 25 ? 'good' : 'fair'
      });
    }, 3000); // Every 3 seconds

    console.log(`📊 Started usage tracking for socket: ${socket.id}`);
  });

  socket.on('stop_usage_tracking', () => {
    if (socket._usageInterval) {
      clearInterval(socket._usageInterval);
      socket._usageInterval = null;
      console.log(`📊 Stopped usage tracking for socket: ${socket.id}`);
    }
  });

  // Clean up usage tracking on disconnect
  socket.on('disconnect', () => {
    if (socket._usageInterval) clearInterval(socket._usageInterval);
    console.log('👤 User disconnected:', socket.id);
  });
});

// Make realTimeEvents available globally
global.realTimeEvents = realTimeEvents;
global.io = io; // Make io available for ticket notifications

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Lumen Quest API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API routes
app.use('/api/auth/login', authLimiter); // Strict rate limit on login (5 attempts/15min in production)
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscriptions', authenticateToken, subscriptionRoutes);
app.use('/api/plan-requests', authenticateToken, planRequestRoutes);
app.use('/api/usage', authenticateToken, usageRoutes);
app.use('/api/razorpay', razorpayRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/customer', require('./routes/customer'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/pdf', require('./routes/pdf')); // Add PDF routes
// app.use('/api/payments', require('./routes/payments')); // Disabled - using UPI payments via customer routes
// app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/recommendations', authenticateToken, recommendationRoutes);
app.use('/api/admin/pricing', authenticateToken, pricingRoutes);
app.use('/api/admin/ai-pricing', authenticateToken, aiPricingRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/chatbot', authenticateToken, require('./routes/chatbot'));
app.use('/api/speedtest', authenticateToken, require('./routes/speedtest'));

// Log a payment failure from the frontend (client-side Razorpay failures)
app.post('/api/payment-failures/log', authenticateToken, async (req, res) => {
  try {
    const PaymentFailureLogger = require('./utils/PaymentFailureLogger');
    const Subscription = require('./models/Subscription');
    const { amount, planName, planId, errorCode, errorDescription, razorpayOrderId, razorpayPaymentId, type } = req.body;
    await PaymentFailureLogger.logFailure({
      userId: req.user._id?.toString(),
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      amount: amount || 0,
      planName: planName || 'unknown',
      planId: planId || '',
      errorCode: errorCode || 'CLIENT_FAILURE',
      errorDescription: errorDescription || 'Payment failed on client',
      razorpayOrderId: razorpayOrderId || '',
      razorpayPaymentId: razorpayPaymentId || '',
      source: 'client',
      type: type || 'subscription'
    });

    // Also increment paymentFailures on the user's active subscription (for At-Risk tracking)
    try {
      await Subscription.findOneAndUpdate(
        { user: req.user._id, status: { $in: ['active', 'grace_period', 'expired'] } },
        { $inc: { paymentFailures: 1 } },
        { sort: { createdAt: -1 } }
      );
      console.log(`⚠️ Client: Incremented paymentFailures for user ${req.user.email}`);
    } catch (subErr) {
      console.error('Failed to increment subscription paymentFailures:', subErr.message);
    }

    res.json({ success: true, message: 'Payment failure logged' });
  } catch (error) {
    console.error('Failed to log payment failure:', error);
    res.status(500).json({ success: false });
  }
});

// Payment failures API for admin panel
app.get('/api/admin/payment-failures', authenticateToken, async (req, res) => {
  try {
    const PaymentFailureLogger = require('./utils/PaymentFailureLogger');
    const stats = await PaymentFailureLogger.getStats();
    const failures = await PaymentFailureLogger.getFailures({ limit: parseInt(req.query.limit) || 50 });
    res.json({ success: true, data: { stats, failures } });
  } catch (error) {
    console.error('Failed to fetch payment failures:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payment failures' });
  }
});

// Download payment failures as CSV (Excel-readable)
app.get('/api/admin/payment-failures/download', authenticateToken, async (req, res) => {
  try {
    const PaymentFailureLogger = require('./utils/PaymentFailureLogger');
    // Regenerate CSV from MongoDB before serving
    await PaymentFailureLogger.regenerateCSV();
    const csvPath = path.join(__dirname, 'payment_failures.csv');
    if (!require('fs').existsSync(csvPath)) {
      return res.status(404).json({ success: false, message: 'No payment failures recorded yet.' });
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=payment_failures.csv');
    res.sendFile(csvPath);
  } catch (error) {
    console.error('Failed to download payment failures:', error);
    res.status(500).json({ success: false, message: 'Failed to generate CSV' });
  }
});

// Churn Monitoring API endpoint
app.get('/api/admin/churn-alerts', authenticateToken, async (req, res) => {
  try {
    const result = churnMonitoringService.getLastScanResult();
    if (!result) {
      // Trigger a scan if no results available
      const scanResult = await churnMonitoringService.triggerScan();
      return res.json({
        success: true,
        data: scanResult,
        message: 'Fresh scan completed'
      });
    }
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get churn alerts',
      error: error.message
    });
  }
});

// Trigger manual churn scan
app.post('/api/admin/churn-scan', authenticateToken, async (req, res) => {
  try {
    const result = await churnMonitoringService.triggerScan();
    res.json({
      success: true,
      data: result,
      message: 'Churn scan completed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to run churn scan',
      error: error.message
    });
  }
});

// Payment completion endpoint
app.post('/api/billing/complete-payment', (req, res) => {
  try {
    const { invoiceId, transactionId } = req.body;
    console.log(`💳 Processing payment completion for invoice ${invoiceId}`);

    // Here you would normally update the database
    // For now, we'll return success to update the frontend

    const updatedInvoice = {
      id: invoiceId,
      status: 'Paid',
      paymentDate: new Date().toISOString(),
      transactionId: transactionId || `TXN${Date.now()}`
    };

    console.log('✅ Payment completed successfully:', updatedInvoice);

    res.json({
      success: true,
      message: 'Payment completed successfully',
      invoice: updatedInvoice
    });

  } catch (error) {
    console.error('❌ Payment completion error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment completion failed'
    });
  }
});

// Enhanced customer billing endpoint with payment processing
// REMOVED: Mock endpoint - now using real controller at /api/customer/subscriptions

// REMOVED: Mock payment endpoint - using real Razorpay integration

// REMOVED: Mock PDF endpoint - now using real routes/pdf.js

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React app build
  app.use(express.static(path.join(__dirname, '../client/build')));

  // Catch-all handler: serve React index.html for any non-API route
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
} else {
  // 404 handler for development
  app.use('*', (req, res) => {
    res.status(404).json({
      status: 'error',
      message: `Route ${req.originalUrl} not found`,
    });
  });
}

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  usageAnalyticsService.stop();
  console.log('Usage Analytics Service stopped.');
  churnMonitoringService.stop();
  console.log('Churn Monitoring Service stopped.');
  reminderSchedulerService.stop();
  console.log('Reminder Scheduler Service stopped.');
  usageSimulatorService.stop();
  console.log('Usage Simulator Service stopped.');
  subscriptionExpiryService.stop();
  console.log('Subscription Expiry Service stopped.');
  mongoose.connection.close();
  console.log('MongoDB connection closed.');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  usageAnalyticsService.stop();
  console.log('Usage Analytics Service stopped.');
  churnMonitoringService.stop();
  console.log('Churn Monitoring Service stopped.');
  reminderSchedulerService.stop();
  console.log('Reminder Scheduler Service stopped.');
  usageSimulatorService.stop();
  console.log('Usage Simulator Service stopped.');
  subscriptionExpiryService.stop();
  console.log('Subscription Expiry Service stopped.');
  mongoose.connection.close();
  console.log('MongoDB connection closed.');
  process.exit(0);
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

module.exports = { app, server, io };