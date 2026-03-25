const mongoose = require('mongoose');

const speedTestResultSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  download: {
    type: Number,
    required: true
  },
  upload: {
    type: Number,
    required: true
  },
  ping: {
    type: Number,
    required: true
  },
  jitter: {
    type: Number,
    default: 0
  },
  server: {
    type: String,
    default: 'BroadbandX Test Server'
  },
  isp: {
    type: String,
    default: 'BroadbandX'
  }
}, {
  timestamps: true
});

// Index for querying last 7 days of results per user
speedTestResultSchema.index({ user: 1, createdAt: -1 });

// Auto-delete results older than 30 days
speedTestResultSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('SpeedTestResult', speedTestResultSchema);
