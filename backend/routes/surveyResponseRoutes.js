const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const {
  startInterview,
  getInterviewSession,
  updateResponse,
  navigateToQuestion,
  markQuestionReached,
  pauseInterview,
  resumeInterview,
  completeInterview,
  abandonInterview,
  getGenderResponseCounts,
  uploadAudioFile,
  getMyInterviews,
  getPendingApprovals,
  submitVerification,
  debugSurveyResponses,
  getSurveyResponseById,
  getSurveyResponses,
  approveSurveyResponse,
  rejectSurveyResponse
} = require('../controllers/surveyResponseController');
const { protect } = require('../middleware/auth');

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(__dirname, '../../uploads/temp/');
    // Ensure temp directory exists
    const fs = require('fs');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  }
});

// All routes require authentication
router.use(protect);

// Start a new interview session
router.post('/start/:surveyId', startInterview);

// Get interview session data
router.get('/session/:sessionId', getInterviewSession);

// Update response (temporary storage)
router.post('/session/:sessionId/response', updateResponse);

// Navigate to a specific question
router.post('/session/:sessionId/navigate', navigateToQuestion);

// Mark question as reached
router.post('/session/:sessionId/reach', markQuestionReached);

// Pause interview
router.post('/session/:sessionId/pause', pauseInterview);

// Resume interview
router.post('/session/:sessionId/resume', resumeInterview);

// Complete interview
router.post('/session/:sessionId/complete', completeInterview);

// Abandon interview
router.post('/session/:sessionId/abandon', abandonInterview);

// Get gender response counts for quota management
router.get('/survey/:surveyId/gender-counts', getGenderResponseCounts);

// Upload audio file for interview
router.post('/upload-audio', upload.single('audio'), uploadAudioFile);

// Get all interviews conducted by the logged-in interviewer
router.get('/my-interviews', getMyInterviews);

// Get pending approval responses for company admin
router.get('/pending-approvals', getPendingApprovals);

// Submit survey response verification
router.post('/verify', submitVerification);

// Debug endpoint to check all survey responses
router.get('/debug-responses', debugSurveyResponses);

// Get survey responses for View Responses modal
router.get('/survey/:surveyId/responses', getSurveyResponses);

// Approve survey response
router.patch('/:responseId/approve', approveSurveyResponse);

// Reject survey response
router.patch('/:responseId/reject', rejectSurveyResponse);

// Get survey response details by ID (must be last to avoid conflicts)
router.get('/:responseId', getSurveyResponseById);

module.exports = router;