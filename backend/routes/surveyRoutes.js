const express = require('express');
const router = express.Router();
const {
  createSurvey,
  getSurveys,
  getSurvey,
  updateSurvey,
  deleteSurvey,
  publishSurvey,
  assignInterviewers,
  assignQualityAgents,
  getSurveyStats,
  getOverallStats,
  getCatiStats,
  getAvailableSurveys,
  rejectInterview,
  debugSurveyResponses,
  downloadRespondentTemplate,
  uploadRespondentContacts,
  uploadRespondentContactsMiddleware,
  getRespondentContacts,
  saveRespondentContacts
} = require('../controllers/surveyController');
const { protect, authorize } = require('../middleware/auth');

// Survey routes
router.route('/')
  .post(protect, authorize('company_admin', 'project_manager'), createSurvey)
  .get(protect, authorize('company_admin', 'project_manager', 'interviewer'), getSurveys);

router.route('/stats')
  .get(protect, authorize('company_admin', 'project_manager'), getSurveyStats);

// Overall stats route (must be before /:id route to avoid route conflict)
router.route('/overall-stats')
  .get(protect, authorize('company_admin', 'project_manager'), getOverallStats);

// Respondent contacts routes
router.route('/respondent-contacts/template')
  .get(protect, authorize('company_admin', 'project_manager'), downloadRespondentTemplate);

router.route('/respondent-contacts/upload')
  .post(protect, authorize('company_admin', 'project_manager'), uploadRespondentContactsMiddleware, uploadRespondentContacts);

// Interviewer and Quality Agent routes (must come before /:id routes)
router.route('/available')
  .get(protect, authorize('interviewer', 'quality_agent'), getAvailableSurveys);

// Specific routes must come before /:id routes
router.route('/:id/assign-interviewers')
  .post(protect, authorize('company_admin', 'project_manager'), assignInterviewers);

router.route('/:id/assign-quality-agents')
  .post(protect, authorize('company_admin', 'project_manager'), assignQualityAgents);

router.route('/:id/publish')
  .post(protect, authorize('company_admin', 'project_manager'), publishSurvey);

// Specific routes must come before /:id routes
router.route('/:id/reject-interview')
  .post(protect, authorize('interviewer'), rejectInterview);

// Debug route
router.route('/:surveyId/debug-responses')
  .get(protect, authorize('company_admin', 'project_manager'), debugSurveyResponses);

// CATI stats route (must come before /:id route)
router.route('/:id/cati-stats')
  .get(protect, authorize('company_admin', 'project_manager'), getCatiStats);

// Respondent contacts route (must come before /:id route)
router.route('/:id/respondent-contacts')
  .get(protect, authorize('company_admin', 'project_manager'), getRespondentContacts)
  .put(protect, authorize('company_admin', 'project_manager'), saveRespondentContacts);

// Generic /:id route must be LAST to avoid matching specific routes like /overall-stats
router.route('/:id')
  .get(protect, authorize('company_admin', 'project_manager', 'interviewer'), getSurvey)
  .put(protect, authorize('company_admin', 'project_manager'), updateSurvey)
  .delete(protect, authorize('company_admin', 'project_manager'), deleteSurvey);

module.exports = router;









