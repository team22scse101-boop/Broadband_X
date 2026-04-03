const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authenticate JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      if (process.env.NODE_ENV === 'development') console.log('❌ No token provided');
      return res.status(401).json({
        status: 'error',
        message: 'Access token is required'
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Verifying token...');
      console.log('📝 Token length:', token.length);
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Token decoded, User ID:', decoded.id);
    }

    // Get user from database with error handling
    let user;
    try {
      user = await User.findById(decoded.id).select('-password');
      if (process.env.NODE_ENV === 'development') {
        console.log('👤 User found:', user ? `${user.email} (${user.role})` : 'NOT FOUND');
      }
    } catch (dbError) {
      console.error('Database error in authentication:', dbError);
      return res.status(500).json({
        status: 'error',
        message: 'Database connection error. Please try again.'
      });
    }

    if (!user) {
      if (process.env.NODE_ENV === 'development') console.log('❌ User not found in database');
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token - user not found'
      });
    }

    if (user.status !== 'active') {
      if (process.env.NODE_ENV === 'development') console.log('❌ User account not active:', user.status);
      return res.status(401).json({
        status: 'error',
        message: 'Account is not active'
      });
    }

    // Check tokenVersion for session invalidation
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined) {
      if (decoded.tokenVersion !== user.tokenVersion) {
        if (process.env.NODE_ENV === 'development') console.log('❌ Token version mismatch - session invalidated');
        return res.status(401).json({
          status: 'error',
          message: 'Session expired. Please log in again.'
        });
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Authentication successful, User:', user.email, 'Role:', user.role);
    }
    req.user = user;
    next();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.log('❌ Authentication error:', error.name, error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired'
      });
    }

    console.error('Authentication error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during authentication'
    });
  }
};

// Authorize specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};

// Admin only middleware
const adminOnly = (req, res, next) => {
  return authorize('admin')(req, res, next);
};

// Customer or admin middleware
const customerOrAdmin = (req, res, next) => {
  return authorize('customer', 'admin')(req, res, next);
};

// Check if user owns resource or is admin
const ownerOrAdmin = (resourceUserIdField = 'user') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required'
        });
      }

      // Admin can access any resource
      if (req.user.role === 'admin') {
        return next();
      }

      // Try to get the userId from params or body
      let resourceUserId = req.params.userId || req.body[resourceUserIdField] || req.query.userId;

      // If no userId found but we have a resource :id param, look up the subscription
      if (!resourceUserId && req.params.id) {
        try {
          const Subscription = require('../models/Subscription');
          const subscription = await Subscription.findById(req.params.id);
          if (subscription) {
            resourceUserId = subscription.user.toString();
            console.log('🔐 Ownership lookup: subscription.user =', resourceUserId, ', req.user._id =', req.user._id.toString());
          } else {
            console.log('🔐 Subscription not found for id:', req.params.id);
          }
        } catch (lookupErr) {
          console.error('🔐 Subscription lookup error:', lookupErr.message);
        }
      }

      const userId = req.user._id.toString();
      const ownerId = resourceUserId ? resourceUserId.toString() : null;

      if (!ownerId || userId !== ownerId) {
        console.log('🔐 DENIED: userId=', userId, 'ownerId=', ownerId, 'params=', req.params);
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. You can only access your own resources'
        });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error during authorization'
      });
    }
  };
};

// Rate limiting by user ID
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (requests.has(userId)) {
      const userRequests = requests.get(userId).filter(time => time > windowStart);
      requests.set(userId, userRequests);
    } else {
      requests.set(userId, []);
    }

    const userRequests = requests.get(userId);

    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    userRequests.push(now);
    next();
  };
};

// Generate JWT token
const generateToken = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion || 0
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Generate refresh token
const generateRefreshToken = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    type: 'refresh'
  };

  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  });
};

// Verify refresh token
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw error;
  }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (user && user.status === 'active') {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Check subscription status
const hasActiveSubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    // Admin bypass
    if (req.user.role === 'admin') {
      return next();
    }

    const Subscription = require('../models/Subscription');
    const activeSubscription = await Subscription.findActiveByUser(req.user._id);

    if (!activeSubscription) {
      return res.status(403).json({
        status: 'error',
        message: 'Active subscription required to access this resource'
      });
    }

    req.subscription = activeSubscription;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error checking subscription status'
    });
  }
};

module.exports = {
  authenticateToken,
  authorize,
  adminOnly,
  customerOrAdmin,
  ownerOrAdmin,
  userRateLimit,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  optionalAuth,
  hasActiveSubscription
};