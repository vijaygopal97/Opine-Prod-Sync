const express = require('express');
const router = express.Router();
const {
  getInterviewerPerformance,
  getPerformanceTrends,
  getInterviewHistory,
  getQualityAgentPerformance,
  getQualityAgentTrends,
  getQualityAgentReviews
} = require('../controllers/performanceController');
const { protect, authorize } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Interviewer routes require interviewer or company_admin role
router.use((req, res, next) => {
  // Skip authorization for quality agent routes
  if (req.path.startsWith('/quality-agent')) {
    return next();
  }
  // For other routes, require interviewer or company_admin
  if (req.user.userType === 'interviewer' || req.user.userType === 'company_admin') {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Access denied'
  });
});

// @route   GET /api/performance/analytics
// @desc    Get comprehensive performance analytics for interviewer
// @access  Private (Interviewer)
router.get('/analytics', getInterviewerPerformance);

// @route   GET /api/performance/trends
// @desc    Get performance trends over time
// @access  Private (Interviewer)
router.get('/trends', getPerformanceTrends);

// @route   GET /api/performance/interviews
// @desc    Get detailed interview history with pagination and filters
// @access  Private (Interviewer)
router.get('/interviews', getInterviewHistory);

// Quality Agent Performance Routes
// @route   GET /api/performance/quality-agent/analytics
// @desc    Get comprehensive performance analytics for quality agent
// @access  Private (Quality Agent)
router.get('/quality-agent/analytics', authorize('quality_agent'), getQualityAgentPerformance);

// @route   GET /api/performance/quality-agent/trends
// @desc    Get quality agent performance trends over time
// @access  Private (Quality Agent)
router.get('/quality-agent/trends', authorize('quality_agent'), getQualityAgentTrends);

// @route   GET /api/performance/quality-agent/reviews
// @desc    Get quality agent reviewed responses history
// @access  Private (Quality Agent)
router.get('/quality-agent/reviews', authorize('quality_agent'), getQualityAgentReviews);

module.exports = router;
