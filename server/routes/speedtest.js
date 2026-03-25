const express = require('express');
const router = express.Router();
const SpeedTestResult = require('../models/SpeedTestResult');

// Auth is already applied via authenticateToken in server.js

// @desc    Save a speed test result
// @route   POST /api/speedtest
// @access  Private
router.post('/', async (req, res) => {
  try {
    const { download, upload, ping, jitter } = req.body;

    if (!download || !upload || ping === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields: download, upload, ping' });
    }

    const result = new SpeedTestResult({
      user: req.user._id,
      download,
      upload,
      ping,
      jitter: jitter || 0
    });

    await result.save();

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error saving speed test:', error);
    res.status(500).json({ success: false, message: 'Failed to save speed test result' });
  }
});

// @desc    Get speed test history (last 7 days)
// @route   GET /api/speedtest/history
// @access  Private
router.get('/history', async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const results = await SpeedTestResult.find({
      user: req.user._id,
      createdAt: { $gte: sevenDaysAgo }
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error) {
    console.error('Error fetching speed test history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch speed test history' });
  }
});

module.exports = router;
