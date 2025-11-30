const Survey = require('../models/Survey');
const User = require('../models/User');
const CatiRespondentQueue = require('../models/CatiRespondentQueue');
const CatiCall = require('../models/CatiCall');
const InterviewSession = require('../models/InterviewSession');
const SurveyResponse = require('../models/SurveyResponse');
const mongoose = require('mongoose');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// DeepCall API Configuration
const DEEPCALL_API_BASE_URL = 'https://s-ct3.sarv.com/v2/clickToCall/para';
const DEEPCALL_USER_ID = process.env.DEEPCALL_USER_ID || '89130240';
const DEEPCALL_TOKEN = process.env.DEEPCALL_TOKEN || '6GQJuwW6lB8ZBHntzaRU';
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://opine.exypnossolutions.com';

// Helper function to make call via DeepCall API
const initiateDeepCall = async (fromNumber, toNumber, fromType = 'Number', toType = 'Number', fromRingTime = 30, toRingTime = 30) => {
  try {
    const cleanFrom = fromNumber.replace(/[^0-9]/g, '');
    const cleanTo = toNumber.replace(/[^0-9]/g, '');

    const params = {
      user_id: DEEPCALL_USER_ID,
      token: DEEPCALL_TOKEN,
      from: cleanFrom,
      to: cleanTo,
      fromType: fromType,
      toType: toType,
      fromRingTime: parseInt(fromRingTime),
      toRingTime: parseInt(toRingTime)
    };

    const queryString = new URLSearchParams(params).toString();
    const fullUrl = `${DEEPCALL_API_BASE_URL}?${queryString}`;

    console.log(`📞 Making CATI call: ${fromNumber} -> ${toNumber}`);

    const response = await axios.get(fullUrl, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const apiResponse = response.data;
    console.log('📞 DeepCall API raw response:', apiResponse);
    
    // Normalize common fields
    const status = typeof apiResponse?.status === 'string'
      ? apiResponse.status.toLowerCase()
      : apiResponse?.status;
    const code = apiResponse?.code ?? apiResponse?.statusCode ?? apiResponse?.status_code;

    // Treat as error only when status explicitly indicates error or when we have a clear non‑success code
    const isExplicitErrorStatus = status === 'error' || status === 'failed' || status === 'failure';
    const isErrorCode = code !== undefined && !['0', 0, '200', 200].includes(code);

    if (isExplicitErrorStatus || isErrorCode) {
      const errorMessage =
        apiResponse.message ||
        (typeof apiResponse.error === 'string' ? apiResponse.error : apiResponse.error?.message) ||
        `DeepCall API Error: ${code || 'Unknown error'}`;
      return {
        success: false,
        message: errorMessage,
        error: {
          message: errorMessage,
          code,
          status: apiResponse.status,
          details: apiResponse
        },
        statusCode: code
      };
    }
    
    const callId = apiResponse?.callId || apiResponse?.id || apiResponse?.call_id || apiResponse?.data?.callId;

    if (!callId) {
      return {
        success: false,
        message: 'API response does not contain call ID',
        error: {
          message: 'API response does not contain call ID',
          details: apiResponse
        },
        apiResponse: apiResponse
      };
    }

    return {
      success: true,
      callId: callId,
      data: {
        callId: callId,
        fromNumber: fromNumber,
        toNumber: toNumber,
        apiResponse: apiResponse
      }
    };

  } catch (error) {
    console.error('Error initiating DeepCall:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText
    });
    
    // Extract error message from various possible formats
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error?.message || 
                        (typeof error.response?.data?.error === 'string' ? error.response?.data?.error : null) ||
                        error.message || 
                        'Failed to initiate call';
    
    return {
      success: false,
      message: errorMessage,
      error: {
        message: errorMessage,
        code: error.response?.data?.code || error.response?.data?.error?.code || error.response?.status,
        status: error.response?.data?.status,
        details: error.response?.data || error.message
      },
      statusCode: error.response?.status
    };
  }
};

// @desc    Start CATI interview session and get next respondent from queue
// @route   POST /api/cati-interview/start/:surveyId
// @access  Private (Interviewer)
const startCatiInterview = async (req, res) => {
  try {
    console.log('🔍 startCatiInterview called with params:', req.params);
    console.log('🔍 User:', req.user ? req.user._id : 'No user');
    const { surveyId } = req.params;
    if (!surveyId) {
      console.log('❌ No surveyId provided');
      return res.status(400).json({ success: false, message: 'Survey ID is required' });
    }
    const interviewerId = req.user._id;
    if (!interviewerId) {
      console.log('❌ No interviewerId');
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    console.log('🔍 Looking up survey:', surveyId);
    // Check if survey exists and is active
    const survey = await Survey.findById(surveyId);
    console.log('🔍 Survey found:', survey ? 'Yes' : 'No');
    if (!survey) {
      console.log('❌ Survey not found, returning 404');
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    console.log('🔍 Survey status:', survey.status);
    if (survey.status !== 'active') {
      console.log('❌ Survey not active, returning 400');
      return res.status(400).json({
        success: false,
        message: 'Survey is not active'
      });
    }

    // Check if interviewer is assigned to this survey for CATI
    console.log('🔍 Checking CATI interviewer assignment...');
    console.log('🔍 Survey catiInterviewers:', survey.catiInterviewers ? survey.catiInterviewers.length : 0);
    let assignment = null;
    if (survey.catiInterviewers && survey.catiInterviewers.length > 0) {
      assignment = survey.catiInterviewers.find(
        a => a.interviewer.toString() === interviewerId.toString() && 
             a.status === 'assigned'
      );
    }

    console.log('🔍 Assignment found:', assignment ? 'Yes' : 'No');
    if (!assignment) {
      console.log('❌ Not assigned, returning 403');
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this survey for CATI interviews'
      });
    }

    // Check if AC selection is required (same logic as CAPI)
    const requiresACSelection = survey.assignACs && 
                               assignment.assignedACs && 
                               assignment.assignedACs.length > 0;
    console.log('🔍 AC Selection required:', requiresACSelection);
    console.log('🔍 Assigned ACs:', assignment.assignedACs);

    // Check if survey has respondent contacts
    console.log('🔍 Checking respondent contacts...');
    console.log('🔍 Respondent contacts:', survey.respondentContacts ? survey.respondentContacts.length : 0);
    if (!survey.respondentContacts || survey.respondentContacts.length === 0) {
      console.log('❌ No respondent contacts, returning 400');
      return res.status(400).json({
        success: false,
        message: 'No respondents available. Please upload respondent contacts first.'
      });
    }

    // Initialize queue if not already done
    console.log('🔍 Initializing respondent queue...');
    await initializeRespondentQueue(surveyId, survey.respondentContacts);
    console.log('🔍 Queue initialized');

    // Get next available respondent from queue
    console.log('🔍 Finding next respondent in queue...');
    const nextRespondent = await CatiRespondentQueue.findOne({
      survey: surveyId,
      status: 'pending'
    }).sort({ priority: -1, createdAt: 1 });

    console.log('🔍 Next respondent found:', nextRespondent ? 'Yes' : 'No');
    if (!nextRespondent) {
      console.log('⚠️  No pending respondents available');
      return res.status(200).json({
        success: false,
        message: 'No Pending Respondents',
        data: {
          message: 'All respondents have been processed or are currently assigned. Please check back later or contact your administrator.',
          hasPendingRespondents: false
        }
      });
    }

    // Assign respondent to interviewer
    nextRespondent.status = 'assigned';
    nextRespondent.assignedTo = interviewerId;
    nextRespondent.assignedAt = new Date();
    await nextRespondent.save();

    // Get interviewer phone number
    const interviewer = await User.findById(interviewerId).select('phone firstName lastName');
    if (!interviewer || !interviewer.phone) {
      return res.status(400).json({
        success: false,
        message: 'Interviewer phone number not found. Please update your profile with a phone number.'
      });
    }

    // Create interview session
    const sessionId = uuidv4();
    const session = await InterviewSession.createSession({
      sessionId,
      survey: surveyId,
      interviewer: interviewerId,
      interviewMode: 'cati',
      deviceInfo: {
        userAgent: req.get('User-Agent'),
        platform: req.body.platform || 'web',
        browser: req.body.browser || 'unknown'
      },
      metadata: {
        surveyVersion: survey.version || '1.0',
        startMethod: 'cati',
        respondentQueueId: nextRespondent._id,
        respondentPhone: nextRespondent.respondentContact.phone
      }
    });
    await session.save();

    // Mark first question as reached
    session.markQuestionReached(0, 0, 'first');
    await session.save();

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        survey: {
          id: survey._id,
          surveyName: survey.surveyName,
          description: survey.description,
          sections: survey.sections,
          questions: survey.questions,
          mode: survey.mode
        },
        respondent: {
          id: nextRespondent._id,
          name: nextRespondent.respondentContact.name,
          phone: nextRespondent.respondentContact.phone,
          countryCode: nextRespondent.respondentContact.countryCode
        },
        interviewer: {
          phone: interviewer.phone,
          name: `${interviewer.firstName} ${interviewer.lastName}`
        },
        currentPosition: {
          sectionIndex: 0,
          questionIndex: 0
        },
        reachedQuestions: session.reachedQuestions,
        startTime: session.startTime,
        // AC Selection information (same as CAPI)
        requiresACSelection: requiresACSelection,
        assignedACs: requiresACSelection ? assignment.assignedACs : []
      }
    });
    console.log('✅ Successfully returning response');

  } catch (error) {
    console.error('❌ Error starting CATI interview:', error);
    console.error('❌ Error stack:', error.stack);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to start CATI interview',
        error: error.message
      });
    }
  }
};

// @desc    Make call to respondent
// @route   POST /api/cati-interview/make-call/:queueId
// @access  Private (Interviewer)
const makeCallToRespondent = async (req, res) => {
  let queueEntry = null;
  try {
    const { queueId } = req.params;
    const interviewerId = req.user._id;

    // Get queue entry
    queueEntry = await CatiRespondentQueue.findById(queueId)
      .populate('survey', 'surveyName')
      .populate('assignedTo', 'phone firstName lastName');

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        message: 'Respondent queue entry not found'
      });
    }

    if (queueEntry.assignedTo._id.toString() !== interviewerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this respondent'
      });
    }

    // Get interviewer phone
    const interviewer = await User.findById(interviewerId).select('phone');
    if (!interviewer || !interviewer.phone) {
      return res.status(400).json({
        success: false,
        message: 'Interviewer phone number not found'
      });
    }

    // Prepare phone numbers
    const fromNumber = interviewer.phone.replace(/[^0-9]/g, '');
    const toNumber = queueEntry.respondentContact.phone.replace(/[^0-9]/g, '');

    // Make the call using DeepCall API
    const callResult = await initiateDeepCall(fromNumber, toNumber, 'Number', 'Number', 30, 30);

    if (!callResult.success) {
      // Update queue entry status and move to end of queue
      queueEntry.status = 'pending'; // Reset to pending so it can be retried
      queueEntry.priority = -1; // Set to lowest priority to move to end
      queueEntry.assignedTo = null; // Unassign so it can be picked up later
      queueEntry.assignedAt = null;
      queueEntry.currentAttemptNumber += 1;
      
      // Extract detailed error message
      const errorMessage = callResult.message || 
                          callResult.error?.message || 
                          (typeof callResult.error === 'string' ? callResult.error : null) ||
                          'Call initiation failed';
      
      queueEntry.callAttempts.push({
        attemptNumber: queueEntry.currentAttemptNumber,
        attemptedAt: new Date(),
        attemptedBy: interviewerId,
        status: 'failed',
        reason: errorMessage
      });
      // Update createdAt to move to end of queue (for sorting by createdAt)
      queueEntry.createdAt = new Date();
      await queueEntry.save();

      return res.status(500).json({
        success: false,
        message: errorMessage,
        error: {
          message: errorMessage,
          code: callResult.error?.code || callResult.statusCode,
          details: callResult.error
        }
      });
    }

    // Create a temporary call record to link with queue entry
    // The webhook will update this record with full details
    let tempCallRecord = null;
    if (callResult.success && callResult.callId) {
      try {
        tempCallRecord = new CatiCall({
          callId: callResult.callId,
          survey: queueEntry.survey._id,
          queueEntry: queueEntry._id,
          company: null, // Will be set from webhook if available
          createdBy: interviewerId,
          fromNumber: fromNumber,
          toNumber: toNumber,
          fromType: 'Number',
          toType: 'Number',
          callStatus: 'ringing',
          webhookReceived: false // Will be set to true when webhook arrives
        });
        await tempCallRecord.save();
        
        // Link queue entry to call record
        queueEntry.callRecord = tempCallRecord._id;
      } catch (error) {
        console.error('Error creating temporary call record:', error);
        // Continue without call record - webhook will create it
      }
    }

    // Update queue entry
    queueEntry.status = 'calling';
    queueEntry.currentAttemptNumber += 1;
    queueEntry.lastAttemptedAt = new Date();
    queueEntry.callAttempts.push({
      attemptNumber: queueEntry.currentAttemptNumber,
      attemptedAt: new Date(),
      attemptedBy: interviewerId,
      callId: callResult.data?.callId,
      status: 'initiated'
    });
    await queueEntry.save();

    res.status(200).json({
      success: true,
      data: {
        callId: callResult.data?.callId,
        fromNumber,
        toNumber,
        queueId: queueEntry._id,
        message: 'Call initiated successfully. Waiting for connection...'
      }
    });

  } catch (error) {
    console.error('Error making call to respondent:', error);
    
    // Extract detailed error message
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error?.message || 
                        (typeof error.response?.data?.error === 'string' ? error.response?.data?.error : null) ||
                        error.message || 
                        'Failed to make call';
    
    // If we have a queueEntry, move it to end of queue
    try {
      if (queueEntry) {
        queueEntry.status = 'pending';
        queueEntry.priority = -1;
        queueEntry.assignedTo = null;
        queueEntry.assignedAt = null;
        queueEntry.currentAttemptNumber += 1;
        queueEntry.callAttempts.push({
          attemptNumber: queueEntry.currentAttemptNumber,
          attemptedAt: new Date(),
          attemptedBy: interviewerId,
          status: 'failed',
          reason: errorMessage
        });
        queueEntry.createdAt = new Date();
        await queueEntry.save();
      }
    } catch (queueError) {
      console.error('Error updating queue entry on failure:', queueError);
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: {
        message: errorMessage,
        code: error.response?.data?.error?.code || error.response?.status,
        details: error.response?.data?.error || error.message
      }
    });
  }
};

// @desc    Handle interview abandonment
// @route   POST /api/cati-interview/abandon/:queueId
// @access  Private (Interviewer)
const abandonInterview = async (req, res) => {
  try {
    const { queueId } = req.params;
    const { reason, notes, callLaterDate } = req.body;
    const interviewerId = req.user._id;

    const queueEntry = await CatiRespondentQueue.findById(queueId)
      .populate('assignedTo', '_id');
    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        message: 'Respondent queue entry not found'
      });
    }

    // Check if assigned to this interviewer, or if not assigned (call failed scenario)
    // Allow abandonment if not assigned (call failed) or if assigned to this interviewer
    if (queueEntry.assignedTo && queueEntry.assignedTo._id.toString() !== interviewerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this respondent'
      });
    }

    // Map abandonment reason to status
    // If no reason provided (call failed scenario), default to 'call_failed'
    const statusMap = {
      'call_later': 'call_later',
      'not_interested': 'not_interested',
      'busy': 'busy',
      'no_answer': 'no_answer',
      'switched_off': 'switched_off',
      'not_reachable': 'not_reachable',
      'does_not_exist': 'does_not_exist',
      'rejected': 'rejected',
      'technical_issue': 'call_failed',
      'other': 'call_failed'
    };

    const newStatus = reason ? (statusMap[reason] || 'call_failed') : 'call_failed';

    // Update queue entry
    queueEntry.status = newStatus;
    queueEntry.abandonmentReason = reason;
    queueEntry.abandonmentNotes = notes;
    if (reason === 'call_later' && callLaterDate) {
      queueEntry.callLaterDate = new Date(callLaterDate);
      // If call later, add back to queue with higher priority
      queueEntry.status = 'pending';
      queueEntry.priority = 10; // Higher priority for scheduled calls
      queueEntry.assignedTo = null;
      queueEntry.assignedAt = null;
    } else if (newStatus === 'call_failed') {
      // If call failed, add back to queue for retry
      queueEntry.status = 'pending';
      queueEntry.assignedTo = null;
      queueEntry.assignedAt = null;
    }

    // Update last attempt
    if (queueEntry.callAttempts.length > 0) {
      const lastAttempt = queueEntry.callAttempts[queueEntry.callAttempts.length - 1];
      lastAttempt.status = newStatus;
      lastAttempt.reason = reason;
      lastAttempt.notes = notes;
      if (callLaterDate) {
        lastAttempt.scheduledFor = new Date(callLaterDate);
      }
    }

    await queueEntry.save();

    res.status(200).json({
      success: true,
      message: 'Interview abandonment recorded',
      data: {
        queueId: queueEntry._id,
        status: queueEntry.status
      }
    });

  } catch (error) {
    console.error('Error abandoning interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record abandonment',
      error: error.message
    });
  }
};

// @desc    Complete CATI interview and submit response
// @route   POST /api/cati-interview/complete/:queueId
// @access  Private (Interviewer)
const completeCatiInterview = async (req, res) => {
  try {
    const { queueId } = req.params;
    const { sessionId, responses, selectedAC, selectedPollingStation, totalTimeSpent, startTime, endTime, totalQuestions: frontendTotalQuestions, answeredQuestions: frontendAnsweredQuestions, completionPercentage: frontendCompletionPercentage } = req.body;
    const interviewerId = req.user._id;

    const queueEntry = await CatiRespondentQueue.findById(queueId)
      .populate('survey')
      .populate('callRecord');

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        message: 'Respondent queue entry not found'
      });
    }

    if (queueEntry.assignedTo.toString() !== interviewerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this respondent'
      });
    }

    // Get session
    const session = await InterviewSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    // Get session timing information (use provided values or fallback to session)
    const finalStartTime = startTime ? new Date(startTime) : (session.startTime || new Date());
    const finalEndTime = endTime ? new Date(endTime) : new Date();
    const finalTotalTimeSpent = totalTimeSpent || session.totalTimeSpent || Math.floor((finalEndTime - finalStartTime) / 1000);

    // Calculate statistics from responses
    const allResponses = responses || [];
    
    // Use frontend-provided values if available, otherwise calculate
    let totalQuestions = frontendTotalQuestions;
    let answeredQuestions = frontendAnsweredQuestions;
    let completionPercentage = frontendCompletionPercentage;
    
    // If frontend didn't provide values, calculate them
    if (!totalQuestions || totalQuestions === 0) {
      // Get total questions from survey - need to count all questions in all sections
      totalQuestions = 0;
      if (queueEntry.survey && queueEntry.survey.sections) {
        queueEntry.survey.sections.forEach(section => {
          if (section.questions && Array.isArray(section.questions)) {
            totalQuestions += section.questions.length;
          }
        });
      }
      // Fallback to questions array if sections don't have questions
      if (totalQuestions === 0 && queueEntry.survey?.questions) {
        totalQuestions = Array.isArray(queueEntry.survey.questions) ? queueEntry.survey.questions.length : 0;
      }
    }
    
    // Count answered questions if not provided
    if (!answeredQuestions && answeredQuestions !== 0) {
      answeredQuestions = allResponses.filter(r => {
        if (!r || !r.response) return false;
        if (Array.isArray(r.response)) return r.response.length > 0;
        if (typeof r.response === 'object') return Object.keys(r.response).length > 0;
        return r.response !== '' && r.response !== null && r.response !== undefined;
      }).length;
    }
    
    // Calculate completion percentage if not provided
    if (!completionPercentage && completionPercentage !== 0) {
      completionPercentage = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;
    }
    
    console.log('🔍 Completion stats - Total:', totalQuestions, 'Answered:', answeredQuestions, 'Percentage:', completionPercentage);

    // Get callId from queueEntry's callRecord
    let callId = null;
    if (queueEntry.callRecord) {
      // Populate callRecord to get callId
      await queueEntry.populate('callRecord');
      if (queueEntry.callRecord && queueEntry.callRecord.callId) {
        callId = queueEntry.callRecord.callId;
        console.log(`🔍 Found callId from callRecord: ${callId}`);
      }
    }
    
    // If callId not found in callRecord, try to find it from CatiCall by queueEntry
    if (!callId) {
      const CatiCall = require('../models/CatiCall');
      const callRecord = await CatiCall.findOne({ queueEntry: queueEntry._id })
        .sort({ createdAt: -1 }); // Get the most recent call
      if (callRecord && callRecord.callId) {
        callId = callRecord.callId;
        console.log(`🔍 Found callId from CatiCall lookup: ${callId}`);
      }
    }

    // Check if response already exists to avoid duplicate
    // Check by both sessionId and queueEntry to be thorough
    let surveyResponse = await SurveyResponse.findOne({ 
      $or: [
        { sessionId: session.sessionId },
        { 'metadata.respondentQueueId': queueEntry._id }
      ]
    });
    
    if (surveyResponse) {
      console.log('⚠️  SurveyResponse already exists for this session, updating instead of creating new');
      // Update existing response
      surveyResponse.responses = allResponses;
      surveyResponse.selectedAC = selectedAC || null;
      surveyResponse.selectedPollingStation = selectedPollingStation || null;
      surveyResponse.endTime = finalEndTime;
      surveyResponse.totalTimeSpent = finalTotalTimeSpent;
      surveyResponse.totalQuestions = totalQuestions;
      surveyResponse.answeredQuestions = answeredQuestions;
      surveyResponse.skippedQuestions = totalQuestions - answeredQuestions;
      surveyResponse.completionPercentage = completionPercentage;
      if (callId) {
        surveyResponse.call_id = callId;
      }
      surveyResponse.metadata = {
        ...surveyResponse.metadata,
        respondentQueueId: queueEntry._id,
        respondentName: queueEntry.respondentContact?.name || queueEntry.respondentContact?.name,
        respondentPhone: queueEntry.respondentContact?.phone || queueEntry.respondentContact?.phone,
        callRecordId: queueEntry.callRecord?._id
      };
      await surveyResponse.save();
      
      // Check for auto-rejection conditions
      const { checkAutoRejection, applyAutoRejection } = require('../utils/autoRejectionHelper');
      try {
        const rejectionInfo = await checkAutoRejection(surveyResponse, allResponses, queueEntry.survey._id);
        if (rejectionInfo) {
          await applyAutoRejection(surveyResponse, rejectionInfo);
          // Refresh the response to get updated status
          await surveyResponse.populate('survey');
        }
      } catch (autoRejectError) {
        console.error('Error checking auto-rejection:', autoRejectError);
        // Continue even if auto-rejection check fails
      }
      
      // Add response to QC batch if not already in one
      if (!surveyResponse.qcBatch) {
        try {
          const { addResponseToBatch } = require('../utils/qcBatchHelper');
          await addResponseToBatch(surveyResponse._id, queueEntry.survey._id);
        } catch (batchError) {
          console.error('Error adding existing CATI response to batch:', batchError);
        }
      }
    } else {
      // Create new survey response (similar to CAPI flow)
      const responseId = uuidv4();
      
      console.log('🔍 Creating new SurveyResponse with:', {
        responseId,
        survey: queueEntry.survey._id,
        interviewer: interviewerId,
        sessionId: session.sessionId,
        interviewMode: 'cati',
        call_id: callId,
        totalQuestions,
        answeredQuestions,
        completionPercentage,
        startTime: finalStartTime,
        endTime: finalEndTime,
        totalTimeSpent: finalTotalTimeSpent
      });
      
      surveyResponse = new SurveyResponse({
        responseId,
        survey: queueEntry.survey._id,
        interviewer: interviewerId,
        sessionId: session.sessionId,
        interviewMode: 'cati',
        call_id: callId || null, // Store DeepCall callId
        responses: allResponses,
        selectedAC: selectedAC || null,
        selectedPollingStation: selectedPollingStation || null,
        location: null, // No GPS location for CATI
        startTime: finalStartTime, // Required field
        endTime: finalEndTime, // Required field
        totalTimeSpent: finalTotalTimeSpent, // Required field
        status: 'Pending_Approval', // Valid enum value
        totalQuestions: totalQuestions || 0, // Required field - ensure it's not undefined
        answeredQuestions: answeredQuestions || 0, // Required field - ensure it's not undefined
        skippedQuestions: (totalQuestions || 0) - (answeredQuestions || 0), // Optional but good to have
        completionPercentage: completionPercentage || 0, // Required field - ensure it's not undefined
        metadata: {
          respondentQueueId: queueEntry._id,
          respondentName: queueEntry.respondentContact?.name || queueEntry.respondentContact?.name,
          respondentPhone: queueEntry.respondentContact?.phone || queueEntry.respondentContact?.phone,
          callRecordId: queueEntry.callRecord?._id
        }
      });

      try {
        await surveyResponse.save();
        console.log('✅ SurveyResponse saved successfully:', surveyResponse.responseId);
      } catch (saveError) {
        console.error('❌ Error saving SurveyResponse:', saveError);
        console.error('❌ Save error details:', {
          message: saveError.message,
          name: saveError.name,
          errors: saveError.errors,
          stack: saveError.stack
        });
        throw saveError; // Re-throw to be caught by outer catch
      }
    }
    
    // Check for auto-rejection conditions
    const { checkAutoRejection, applyAutoRejection } = require('../utils/autoRejectionHelper');
    try {
      const rejectionInfo = await checkAutoRejection(surveyResponse, allResponses, queueEntry.survey._id);
      if (rejectionInfo) {
        await applyAutoRejection(surveyResponse, rejectionInfo);
        // Refresh the response to get updated status
        await surveyResponse.populate('survey');
      }
    } catch (autoRejectError) {
      console.error('Error checking auto-rejection:', autoRejectError);
      // Continue even if auto-rejection check fails
    }
    
    // Add response to QC batch instead of queuing immediately
    try {
      const { addResponseToBatch } = require('../utils/qcBatchHelper');
      await addResponseToBatch(surveyResponse._id, queueEntry.survey._id);
    } catch (batchError) {
      console.error('Error adding CATI response to batch:', batchError);
      // Continue even if batch addition fails - response is still saved
    }

    // Update queue entry
    queueEntry.status = 'interview_success';
    queueEntry.response = surveyResponse._id;
    queueEntry.completedAt = new Date();
    await queueEntry.save();

    // Update session status - InterviewSession only allows 'active', 'paused', 'abandoned'
    // Since interview is completed successfully, we'll mark it as abandoned (completed interviews are no longer active)
    // Alternatively, we can just update lastActivityTime without changing status
    session.lastActivityTime = new Date();
    try {
      // Try to set status to 'abandoned' to indicate it's no longer active
      // This is semantically correct as the session is done
      if (session.status !== 'abandoned') {
        session.status = 'abandoned';
      }
      await session.save();
    } catch (sessionError) {
      console.log('⚠️  Could not update session status, continuing anyway:', sessionError.message);
      // Continue even if session update fails
    }

    res.status(200).json({
      success: true,
      message: 'CATI interview completed and submitted for approval',
      data: {
        responseId: surveyResponse.responseId,
        queueId: queueEntry._id,
        // Always show Pending_Approval to interviewer, even if auto-rejected
        status: 'Pending_Approval'
      }
    });

  } catch (error) {
    console.error('❌ Error completing CATI interview:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      name: error.name,
      errors: error.errors,
      code: error.code
    });
    res.status(500).json({
      success: false,
      message: 'Failed to complete interview',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        errors: error.errors
      } : undefined
    });
  }
};

// Helper function to initialize respondent queue
const initializeRespondentQueue = async (surveyId, respondentContacts) => {
  try {
    // Check if queue already has pending entries for this survey
    const pendingCount = await CatiRespondentQueue.countDocuments({ 
      survey: surveyId, 
      status: 'pending' 
    });
    
    // Check total entries
    const totalCount = await CatiRespondentQueue.countDocuments({ survey: surveyId });
    
    console.log(`🔍 Queue check - Total: ${totalCount}, Pending: ${pendingCount}`);
    
    // If we have pending entries, we're good
    if (pendingCount > 0) {
      console.log(`✅ Queue already has ${pendingCount} pending respondents`);
      return;
    }
    
    // If no pending entries but we have contacts, create entries for contacts that don't exist yet
    // Get existing phone numbers to avoid duplicates
    const existingEntries = await CatiRespondentQueue.find({ survey: surveyId })
      .select('respondentContact.phone');
    const existingPhones = new Set(
      existingEntries.map(e => e.respondentContact?.phone).filter(Boolean)
    );
    
    // Create queue entries only for contacts that aren't already in the queue
    const newContacts = respondentContacts.filter(
      contact => !existingPhones.has(contact.phone)
    );
    
    if (newContacts.length === 0) {
      console.log(`⚠️  All respondents are already in queue, but none are pending`);
      // Reset all non-success entries back to pending for retry
      const resetCount = await CatiRespondentQueue.updateMany(
        { 
          survey: surveyId, 
          status: { $ne: 'interview_success' } 
        },
        { 
          $set: { 
            status: 'pending',
            assignedTo: null,
            assignedAt: null
          } 
        }
      );
      console.log(`🔄 Reset ${resetCount.modifiedCount} entries back to pending status`);
      return;
    }

    // Create queue entries for new respondents
    const queueEntries = newContacts.map(contact => ({
      survey: surveyId,
      respondentContact: {
        name: contact.name,
        countryCode: contact.countryCode,
        phone: contact.phone,
        email: contact.email,
        address: contact.address,
        city: contact.city,
        ac: contact.ac,
        pc: contact.pc,
        ps: contact.ps
      },
      status: 'pending',
      currentAttemptNumber: 0
    }));

    await CatiRespondentQueue.insertMany(queueEntries);
    console.log(`✅ Initialized queue with ${queueEntries.length} new respondents for survey ${surveyId}`);

  } catch (error) {
    console.error('Error initializing respondent queue:', error);
    throw error;
  }
};

module.exports = {
  startCatiInterview,
  makeCallToRespondent,
  abandonInterview,
  completeCatiInterview
};

