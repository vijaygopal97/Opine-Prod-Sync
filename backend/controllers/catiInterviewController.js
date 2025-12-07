const Survey = require('../models/Survey');
const User = require('../models/User');
const CatiRespondentQueue = require('../models/CatiRespondentQueue');
const CatiCall = require('../models/CatiCall');
const InterviewSession = require('../models/InterviewSession');
const SurveyResponse = require('../models/SurveyResponse');
const mongoose = require('mongoose');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

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
    console.log('🔍 Respondent contacts in DB:', survey.respondentContacts ? survey.respondentContacts.length : 0);
    
    let respondentContacts = survey.respondentContacts || [];
    
    // If no contacts in DB, try loading from JSON file
    if (!respondentContacts || respondentContacts.length === 0) {
      console.log('🔍 No contacts in DB, checking JSON file...');
      
      const possiblePaths = [];
      
      // Check if survey has respondentContactsFile field
      if (survey.respondentContactsFile) {
        if (path.isAbsolute(survey.respondentContactsFile)) {
          possiblePaths.push(survey.respondentContactsFile);
        } else {
          // Try relative to backend directory
          possiblePaths.push(path.join(__dirname, '..', survey.respondentContactsFile));
          // Try relative to project root
          possiblePaths.push(path.join('/var/www/opine', survey.respondentContactsFile));
        }
      }
      
      // Also try default paths
      possiblePaths.push(path.join('/var/www/opine', 'data', 'respondent-contacts', `${surveyId}.json`));
      possiblePaths.push(path.join(__dirname, '..', 'data', 'respondent-contacts', `${surveyId}.json`));
      
      // Also check Optimised-backup directory
      possiblePaths.push(path.join('/var/www/Optimised-backup', 'opine', 'data', 'respondent-contacts', `${surveyId}.json`));
      
      console.log(`🔍 Looking for respondent contacts file for survey: ${surveyId}`);
      console.log(`🔍 Possible paths:`, possiblePaths);
      
      let fileRead = false;
      for (const filePath of possiblePaths) {
        try {
          await fs.access(filePath);
          console.log(`✅ File found at: ${filePath}`);
          
          const fileContent = await fs.readFile(filePath, 'utf8');
          respondentContacts = JSON.parse(fileContent);
          
          if (!Array.isArray(respondentContacts)) {
            console.warn(`⚠️ File content is not an array, got:`, typeof respondentContacts);
            respondentContacts = [];
          }
          
          fileRead = true;
          console.log(`✅ Successfully read ${respondentContacts.length} contacts from file: ${filePath}`);
          break;
        } catch (fileError) {
          console.log(`❌ Could not read file at ${filePath}:`, fileError.message);
          continue;
        }
      }
      
      if (!fileRead) {
        console.log('❌ No JSON file found and no contacts in DB');
        return res.status(400).json({
          success: false,
          message: 'No respondents available. Please upload respondent contacts first.'
        });
      }
    }
    
    if (!respondentContacts || respondentContacts.length === 0) {
      console.log('❌ No respondent contacts found (neither in DB nor JSON file)');
      return res.status(400).json({
        success: false,
        message: 'No respondents available. Please upload respondent contacts first.'
      });
    }

    console.log(`✅ Found ${respondentContacts.length} respondent contacts`);

    // Initialize queue if not already done
    console.log('🔍 Initializing respondent queue...');
    await initializeRespondentQueue(surveyId, respondentContacts);
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
          countryCode: nextRespondent.respondentContact.countryCode,
          ac: nextRespondent.respondentContact.ac || null, // AC from respondent contact
          pc: nextRespondent.respondentContact.pc || null, // PC from respondent contact
          ps: nextRespondent.respondentContact.ps || null  // Polling Station from respondent contact
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
        // AC Selection information - For CATI, we don't require AC selection as it's auto-populated
        requiresACSelection: false, // Always false for CATI - AC is auto-populated from respondent
        assignedACs: []
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
    const { reason, notes, callLaterDate, callStatus } = req.body;
    const interviewerId = req.user._id;

    const queueEntry = await CatiRespondentQueue.findById(queueId)
      .populate('assignedTo', '_id')
      .populate('callRecord', 'callId fromNumber toNumber'); // Populate callRecord to get call details
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
    // Map consent_refused to rejected status for queue entry
    const queueAbandonmentReason = reason === 'consent_refused' ? 'rejected' : reason;
    queueEntry.abandonmentReason = queueAbandonmentReason;
    queueEntry.abandonmentNotes = notes;
    if (reason === 'call_later' && callLaterDate) {
      queueEntry.callLaterDate = new Date(callLaterDate);
      // If call later, add back to queue with higher priority
      queueEntry.status = 'pending';
      queueEntry.priority = 10; // Higher priority for scheduled calls
      queueEntry.assignedTo = null;
      queueEntry.assignedAt = null;
    } else if (reason === 'consent_refused') {
      // If consent refused, mark as rejected (don't retry)
      queueEntry.status = 'rejected';
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

    // ALWAYS create a SurveyResponse for abandoned interviews to track call status stats
    // This is critical for accurate reporting of call attempts
    console.log(`📊 Starting SurveyResponse creation for abandoned interview`);
    console.log(`📊 Queue Entry ID: ${queueEntry._id}, Survey ID: ${queueEntry.survey?._id || queueEntry.survey}`);
    console.log(`📊 Interviewer ID: ${interviewerId}, Call Status from request: ${callStatus}, Reason: ${reason}`);
    
    try {
      const SurveyResponse = require('../models/SurveyResponse');
      const { v4: uuidv4 } = require('uuid');
      
      // Ensure survey reference exists
      const surveyId = queueEntry.survey?._id || queueEntry.survey;
      if (!surveyId) {
        throw new Error('Survey reference is missing from queue entry');
      }
      
      // Get call status from request body (from Call Status question)
      // If not provided, try to infer from reason
      let finalCallStatus = callStatus;
      if (!finalCallStatus && reason) {
        // Map abandonment reason back to call status if callStatus wasn't provided
        const reasonToCallStatusMap = {
          'busy': 'busy',
          'switched_off': 'switched_off',
          'not_reachable': 'not_reachable',
          'no_answer': 'did_not_pick_up',
          'does_not_exist': 'number_does_not_exist',
          'technical_issue': 'didnt_get_call',
          'call_failed': 'didnt_get_call',
          'consent_refused': 'call_connected' // If consent was refused, call was connected
        };
        finalCallStatus = reasonToCallStatusMap[reason] || 'unknown';
      }
      
      // If still no call status, use 'unknown' to ensure we still create the record
      if (!finalCallStatus) {
        finalCallStatus = 'unknown';
      }
      
      console.log(`📊 Final Call Status determined: ${finalCallStatus}`);
      
      // Normalize call status for knownCallStatus field
      const normalizedCallStatus = finalCallStatus.toLowerCase().trim();
      const knownCallStatusMap = {
        'call_connected': 'call_connected',
        'success': 'call_connected',
        'busy': 'busy',
        'switched_off': 'switched_off',
        'not_reachable': 'not_reachable',
        'did_not_pick_up': 'did_not_pick_up',
        'number_does_not_exist': 'number_does_not_exist',
        'didnt_get_call': 'didnt_get_call',
        'didn\'t_get_call': 'didnt_get_call'
      };
      const knownCallStatus = knownCallStatusMap[normalizedCallStatus] || 'unknown';
      
      console.log(`📊 Known Call Status mapped: ${knownCallStatus}`);
      
      // Generate unique responseId using UUID
      const responseId = uuidv4();
      
      // Create unique sessionId to avoid conflicts
      const uniqueSessionId = `abandoned-${queueEntry._id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`📊 Creating SurveyResponse with Response ID: ${responseId}, Session ID: ${uniqueSessionId}`);
      
      // Build responses array - include call status and consent form if consent was refused
      const responsesArray = [{
        sectionIndex: -4,
        questionIndex: -4,
        questionId: 'call-status',
        questionType: 'single_choice',
        questionText: 'Call Status {কলের অবস্থা}',
        questionDescription: 'Please select the status of the call attempt.',
        questionOptions: [],
        response: finalCallStatus, // Store the call status as the response
        responseTime: 0,
        isRequired: true,
        isSkipped: false
      }];
      
      // If consent was refused, also include consent form response
      if (reason === 'consent_refused') {
        responsesArray.push({
          sectionIndex: -2,
          questionIndex: -2,
          questionId: 'consent-form',
          questionType: 'single_choice',
          questionText: 'Consent Form {সম্মতিপত্র}',
          questionDescription: '',
          questionOptions: [],
          response: '2', // '2' = No
          responseTime: 0,
          isRequired: true,
          isSkipped: false
        });
      }
      
      // Map abandonment reason to standardized AbandonedReason
      // Special cases: consent_refused -> Consent_Form_Disagree, call not connected -> Call_Not_Connected
      let abandonedReason = null;
      if (reason === 'consent_refused') {
        abandonedReason = 'Consent_Form_Disagree';
      } else if (finalCallStatus && finalCallStatus !== 'call_connected' && finalCallStatus !== 'success' && finalCallStatus !== 'unknown') {
        // Call not connected - map to Call_Not_Connected
        // This covers cases where call status question was answered with non-connected status
        abandonedReason = 'Call_Not_Connected';
      } else if (reason) {
        // Use the reason provided (from top bar abandonment modal)
        abandonedReason = reason;
      }
      
      const surveyResponse = new SurveyResponse({
        responseId: responseId, // Use UUID directly
        survey: surveyId, // Use the survey ID we verified
        interviewer: interviewerId,
        sessionId: uniqueSessionId, // Ensure unique sessionId
        interviewMode: 'cati',
        status: 'abandoned', // Use 'abandoned' status to distinguish from completed interviews
        knownCallStatus: reason === 'consent_refused' ? 'call_connected' : knownCallStatus, // If consent refused, call was connected
        consentResponse: reason === 'consent_refused' ? 'no' : null, // Store consent response if consent was refused
        abandonedReason: abandonedReason, // Store standardized abandonment reason
        responses: responsesArray,
        metadata: {
          respondentQueueId: queueEntry._id,
          respondentName: queueEntry.respondentContact?.name || null,
          respondentPhone: queueEntry.respondentContact?.phone || null,
          callRecordId: queueEntry.callRecord?._id || null,
          callId: queueEntry.callRecord?.callId || null, // Also store callId if available
          callStatus: finalCallStatus, // PRIMARY field for stats calculation (legacy)
          abandoned: true,
          abandonmentReason: reason,
          abandonmentNotes: notes,
          fromNumber: queueEntry.callRecord?.fromNumber || null, // Store from number
          toNumber: queueEntry.callRecord?.toNumber || queueEntry.respondentContact?.phone || null // Store to number
        },
        totalTimeSpent: 0,
        startTime: new Date(),
        endTime: new Date(),
        totalQuestions: 1,
        answeredQuestions: 1,
        skippedQuestions: 0,
        completionPercentage: 0
      });
      
      console.log(`📊 SurveyResponse object created, attempting to save...`);
      
      // Save the response - wrap in try-catch to handle any save errors
      await surveyResponse.save();
      console.log(`✅ Successfully created abandoned SurveyResponse for stats tracking: ${surveyResponse._id}`);
      console.log(`📊 Response ID: ${responseId}, Call Status: ${finalCallStatus}, Known Call Status: ${knownCallStatus}`);
      console.log(`📊 Reason: ${reason}, Interviewer: ${interviewerId}`);
      console.log(`📊 From Number: ${surveyResponse.metadata.fromNumber}, To Number: ${surveyResponse.metadata.toNumber}`);
      console.log(`📊 Session ID: ${uniqueSessionId}`);
    } catch (statsError) {
      console.error('❌ CRITICAL ERROR creating abandoned SurveyResponse for stats:', statsError);
      console.error('❌ Error name:', statsError.name);
      console.error('❌ Error message:', statsError.message);
      console.error('❌ Error code:', statsError.code);
      if (statsError.errors) {
        console.error('❌ Validation errors:', JSON.stringify(statsError.errors, null, 2));
      }
      console.error('❌ Stack:', statsError.stack);
      // IMPORTANT: Still return success for abandonment, but log the error
      // The abandonment itself succeeded, only stats tracking failed
    }

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
    const { sessionId, responses, selectedAC, selectedPollingStation, totalTimeSpent, startTime, endTime, totalQuestions: frontendTotalQuestions, answeredQuestions: frontendAnsweredQuestions, completionPercentage: frontendCompletionPercentage, setNumber, OldinterviewerID, callStatus, supervisorID } = req.body;
    
    // CRITICAL: Convert setNumber to number immediately at the top level so it's available everywhere
    // Try to get setNumber from multiple possible locations (top level, nested, etc.)
    let finalSetNumber = null;
    
    // Log what we received - check all possible locations
    console.log(`🔵🔵🔵 setNumber extraction - req.body.setNumber: ${req.body.setNumber} (type: ${typeof req.body.setNumber})`);
    console.log(`🔵🔵🔵 setNumber extraction - Full req.body keys: ${Object.keys(req.body).join(', ')}`);
    console.log(`🔵🔵🔵 setNumber extraction - req.body (full):`, JSON.stringify(Object.keys(req.body).reduce((acc, key) => {
      if (key !== 'responses') acc[key] = req.body[key];
      return acc;
    }, {})));
    
    // Try to get setNumber from multiple possible locations
    // Priority: 1. Direct from req.body.setNumber, 2. From nested interviewData, 3. From any nested object
    const setNumberValue = setNumber !== undefined ? setNumber 
      : (req.body.setNumber !== undefined ? req.body.setNumber 
        : (req.body.interviewData?.setNumber !== undefined ? req.body.interviewData.setNumber 
          : null));
    
    console.log(`🔵🔵🔵 setNumber extraction - setNumberValue found: ${setNumberValue} (type: ${typeof setNumberValue})`);
    
    if (setNumberValue !== null && setNumberValue !== undefined && setNumberValue !== '' && !isNaN(Number(setNumberValue))) {
      finalSetNumber = Number(setNumberValue);
      console.log(`🔵🔵🔵 finalSetNumber converted to: ${finalSetNumber} (type: ${typeof finalSetNumber})`);
    } else {
      console.log(`⚠️  setNumber conversion failed or was null/undefined/empty. setNumberValue: ${setNumberValue}, typeof: ${typeof setNumberValue}`);
    }
    const interviewerId = req.user._id;
    
    // Log setNumber for debugging - CRITICAL for CATI interviews
    console.log(`💾 completeCatiInterview - Received setNumber: ${setNumber} (type: ${typeof setNumber}, queueId: ${queueId})`);
    console.log(`💾 completeCatiInterview - Full req.body keys:`, Object.keys(req.body));
    console.log(`💾 completeCatiInterview - setNumber in req.body:`, req.body.setNumber);
    console.log(`💾 completeCatiInterview - Raw req.body.setNumber:`, JSON.stringify(req.body.setNumber));

    const queueEntry = await CatiRespondentQueue.findById(queueId)
      .populate('survey')
      .populate('callRecord');

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        message: 'Respondent queue entry not found'
      });
    }
    
    // CRITICAL: Auto-populate selectedAC and selectedPollingStation from respondent contact if not provided
    // This ensures CATI interviews always have AC/PC populated from respondent data
    let finalSelectedAC = selectedAC;
    let finalSelectedPollingStation = selectedPollingStation;
    
    // Check if selectedAC is null, undefined, or empty string, and auto-populate from respondent contact
    if ((!finalSelectedAC || finalSelectedAC === '' || finalSelectedAC === null) && queueEntry.respondentContact?.ac) {
      finalSelectedAC = queueEntry.respondentContact.ac;
      console.log(`✅ Auto-populated selectedAC from respondent contact: ${finalSelectedAC}`);
    }
    
    // If polling station is not provided but respondent has AC, we can at least set the AC in polling station
    if ((!finalSelectedPollingStation || Object.keys(finalSelectedPollingStation).length === 0) && finalSelectedAC) {
      finalSelectedPollingStation = {
        acName: finalSelectedAC,
        pcName: queueEntry.respondentContact?.pc || null,
        state: queueEntry.survey?.acAssignmentState || null
      };
      console.log(`✅ Auto-populated selectedPollingStation from respondent contact:`, finalSelectedPollingStation);
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
    
    // Extract OldinterviewerID from responses (for survey 68fd1915d41841da463f0d46)
    let oldInterviewerID = null;
    if (OldinterviewerID) {
      oldInterviewerID = String(OldinterviewerID);
    } else {
      // Also check in responses array as fallback
      const interviewerIdResponse = allResponses.find(r => r.questionId === 'interviewer-id');
      if (interviewerIdResponse && interviewerIdResponse.response !== null && interviewerIdResponse.response !== undefined && interviewerIdResponse.response !== '') {
        oldInterviewerID = String(interviewerIdResponse.response);
      }
    }
    
    // Extract supervisorID from responses (for survey 68fd1915d41841da463f0d46)
    let finalSupervisorID = null;
    if (supervisorID) {
      finalSupervisorID = String(supervisorID);
    } else {
      // Also check in responses array as fallback
      const supervisorIdResponse = allResponses.find(r => r.questionId === 'supervisor-id');
      if (supervisorIdResponse && supervisorIdResponse.response !== null && supervisorIdResponse.response !== undefined && supervisorIdResponse.response !== '') {
        finalSupervisorID = String(supervisorIdResponse.response);
      }
    }
    
    // Extract consent form response (consent-form question)
    // Value '1' or 'yes' = Yes, Value '2' or 'no' = No
    let consentResponse = null;
    const consentFormResponse = allResponses.find(r => r.questionId === 'consent-form');
    if (consentFormResponse && consentFormResponse.response !== null && consentFormResponse.response !== undefined) {
      // Handle different response formats: string, number, object with value property
      let consentValue = consentFormResponse.response;
      
      // If it's an object, try to extract the value
      if (typeof consentValue === 'object' && consentValue !== null) {
        consentValue = consentValue.value || consentValue.text || consentValue;
      }
      
      // Convert to string and normalize
      const consentValueStr = String(consentValue).trim();
      const consentValueLower = consentValueStr.toLowerCase();
      
      // Check for "yes" values: '1', 'yes', 'true', 'y'
      if (consentValueStr === '1' || consentValueLower === 'yes' || consentValueLower === 'true' || consentValueLower === 'y') {
        consentResponse = 'yes';
      } 
      // Check for "no" values: '2', 'no', 'false', 'n'
      else if (consentValueStr === '2' || consentValueLower === 'no' || consentValueLower === 'false' || consentValueLower === 'n') {
        consentResponse = 'no';
      }
    }
    console.log(`📋 Consent Form Response: ${consentResponse} (raw: ${JSON.stringify(consentFormResponse?.response)}, type: ${typeof consentFormResponse?.response})`);
    
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
    
    // Handle call status from frontend
    // Normalize call status
    const finalCallStatus = callStatus || 'unknown';
    const normalizedCallStatus = finalCallStatus.toLowerCase().trim();
    
    // Map to knownCallStatus enum values
    const knownCallStatusMap = {
      'call_connected': 'call_connected',
      'success': 'call_connected',
      'busy': 'busy',
      'switched_off': 'switched_off',
      'not_reachable': 'not_reachable',
      'did_not_pick_up': 'did_not_pick_up',
      'number_does_not_exist': 'number_does_not_exist',
      'didnt_get_call': 'didnt_get_call',
      'didn\'t_get_call': 'didnt_get_call'
    };
    const knownCallStatus = knownCallStatusMap[normalizedCallStatus] || 'unknown';
    
    // IMPORTANT: For CATI interviews, if call status is NOT 'call_connected' or 'success',
    // the interview should be marked as "abandoned", NOT auto-rejected
    // Auto-rejection should only apply to completed interviews (call_connected) that fail quality checks
    const isCallConnected = normalizedCallStatus === 'call_connected' || normalizedCallStatus === 'success';
    const shouldAutoReject = false; // Don't auto-reject based on call status - use quality checks instead
    
    console.log(`📞 Call Status received: ${finalCallStatus}, KnownCallStatus: ${knownCallStatus}, Is Connected: ${isCallConnected}`);

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
      surveyResponse.selectedAC = finalSelectedAC || null;
      surveyResponse.selectedPollingStation = finalSelectedPollingStation || null;
      surveyResponse.endTime = finalEndTime;
      surveyResponse.totalTimeSpent = finalTotalTimeSpent;
      surveyResponse.totalQuestions = totalQuestions;
      surveyResponse.answeredQuestions = answeredQuestions;
      surveyResponse.skippedQuestions = totalQuestions - answeredQuestions;
      surveyResponse.completionPercentage = completionPercentage;
      surveyResponse.OldinterviewerID = oldInterviewerID || null; // Update old interviewer ID
      surveyResponse.supervisorID = finalSupervisorID || null; // Save supervisor ID
      // Always update setNumber if provided (even if it's 1)
      const finalSetNumber = (setNumber !== null && setNumber !== undefined && setNumber !== '') 
        ? Number(setNumber) 
        : null;
      
      if (finalSetNumber !== null) {
        surveyResponse.setNumber = finalSetNumber; // Update set number (ensure it's a number)
        console.log(`💾 Updating existing response with setNumber: ${surveyResponse.setNumber} (original: ${setNumber})`);
      } else {
        console.log(`⚠️  setNumber not provided or invalid in request body for existing response (received: ${setNumber}, type: ${typeof setNumber})`);
      }
      if (callId) {
        surveyResponse.call_id = callId;
      }
      
      // Update knownCallStatus field - ALWAYS save it correctly
      // IMPORTANT: If call was connected, knownCallStatus should be 'call_connected' 
      // even if consent is "No" - this ensures accurate stats
      if (isCallConnected) {
        surveyResponse.knownCallStatus = 'call_connected'; // Force to 'call_connected' if call was connected
        console.log(`✅ Setting knownCallStatus to 'call_connected' (call was connected, consent: ${consentResponse})`);
      } else {
        surveyResponse.knownCallStatus = knownCallStatus; // Save other statuses (busy, switched_off, etc.)
      }
      
      // Update consentResponse field
      surveyResponse.consentResponse = consentResponse;
      
      // IMPORTANT: Mark as "abandoned" if:
      // 1. Call is NOT connected, OR
      // 2. Consent form is "No" (even if call was connected)
      const shouldMarkAsAbandoned = !isCallConnected || consentResponse === 'no';
      
      if (shouldMarkAsAbandoned) {
        surveyResponse.status = 'abandoned';
        surveyResponse.metadata = {
          ...surveyResponse.metadata,
          abandoned: true,
          abandonmentReason: consentResponse === 'no' ? 'consent_refused' : reason,
          callStatus: finalCallStatus,
          respondentQueueId: queueEntry._id,
          respondentName: queueEntry.respondentContact?.name || queueEntry.respondentContact?.name,
          respondentPhone: queueEntry.respondentContact?.phone || queueEntry.respondentContact?.phone,
          callRecordId: queueEntry.callRecord?._id
        };
        console.log(`🚫 Marking existing interview as abandoned - Call Connected: ${isCallConnected}, Consent: ${consentResponse}`);
      } else {
        // Call was connected AND consent is "Yes" - proceed normally
        surveyResponse.metadata = {
          ...surveyResponse.metadata,
          respondentQueueId: queueEntry._id,
          respondentName: queueEntry.respondentContact?.name || queueEntry.respondentContact?.name,
          respondentPhone: queueEntry.respondentContact?.phone || queueEntry.respondentContact?.phone,
          callRecordId: queueEntry.callRecord?._id,
          callStatus: finalCallStatus // Store call status in metadata
        };
      }
      // Log before saving
      console.log(`💾 About to update EXISTING SurveyResponse - setNumber in object: ${surveyResponse.setNumber}, type: ${typeof surveyResponse.setNumber}`);
      
      // Use the finalSetNumber already calculated at the top level
      
      console.log(`💾 CATI Interview (EXISTING) - setNumber received: ${setNumber} (type: ${typeof setNumber}), converted to: ${finalSetNumber} (type: ${typeof finalSetNumber})`);
      
      // Update the existing response
      surveyResponse.setNumber = finalSetNumber;
      surveyResponse.markModified('setNumber');
      
      await surveyResponse.save();
      
      // CRITICAL: Use MongoDB's native collection.updateOne to FORCE save setNumber
      const mongoose = require('mongoose');
      // Get the actual collection name from the model
      const collectionName = SurveyResponse.collection.name;
      const collection = mongoose.connection.collection(collectionName);
      console.log(`💾 Using collection name: ${collectionName}`);
      const updateResult = await collection.updateOne(
        { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
        { $set: { setNumber: finalSetNumber } }
      );
      
      console.log(`💾 CATI Interview (EXISTING) - Direct MongoDB update - setNumber: ${finalSetNumber}, matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`);
      
      // Verify by querying the database directly using native MongoDB
      const savedDoc = await collection.findOne(
        { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
        { projection: { setNumber: 1, responseId: 1, interviewMode: 1 } }
      );
      
      console.log(`✅ CATI SurveyResponse (EXISTING) updated - responseId: ${savedDoc?.responseId}, setNumber in DB: ${savedDoc?.setNumber}`);
      
      if (savedDoc?.setNumber !== finalSetNumber) {
        console.error(`❌ CRITICAL: setNumber STILL NOT SAVED! Expected: ${finalSetNumber}, Got in DB: ${savedDoc?.setNumber}`);
        // Last resort: try one more time with explicit type
        await collection.updateOne(
          { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
          { $set: { setNumber: finalSetNumber === null ? null : Number(finalSetNumber) } }
        );
        const finalCheck = await collection.findOne(
          { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
          { projection: { setNumber: 1 } }
        );
        console.log(`🔧 After final retry - setNumber in DB: ${finalCheck?.setNumber}`);
      } else {
        console.log(`✅ setNumber correctly saved: ${savedDoc.setNumber}`);
      }
      
      // Check for auto-rejection conditions ONLY if call was connected AND consent is "Yes"
      // Abandoned calls (status = 'abandoned') should NOT go through auto-rejection
      const { checkAutoRejection, applyAutoRejection } = require('../utils/autoRejectionHelper');
      try {
        // IMPORTANT: Skip auto-rejection if:
        // 1. Status is 'abandoned' (call not connected OR consent refused), OR
        // 2. Consent is "No" (even if call was connected)
        const shouldSkipAutoRejection = surveyResponse.status === 'abandoned' || consentResponse === 'no';
        if (!shouldSkipAutoRejection && isCallConnected) {
          // IMPORTANT: Save setNumber before auto-rejection check to ensure it's preserved
          const setNumberToPreserve = surveyResponse.setNumber;
          console.log(`💾 Preserving setNumber before auto-rejection check: ${setNumberToPreserve}`);
          
          const rejectionInfo = await checkAutoRejection(surveyResponse, allResponses, queueEntry.survey._id);
          if (rejectionInfo) {
            await applyAutoRejection(surveyResponse, rejectionInfo);
            // CRITICAL: Re-apply setNumber after auto-rejection (it might have been lost)
            if (setNumberToPreserve !== null && setNumberToPreserve !== undefined) {
              surveyResponse.setNumber = setNumberToPreserve;
              surveyResponse.markModified('setNumber');
              await surveyResponse.save();
              console.log(`💾 Restored setNumber after auto-rejection: ${surveyResponse.setNumber}`);
            }
            // Refresh the response to get updated status
            await surveyResponse.populate('survey');
          }
        } else {
          console.log(`⏭️  Skipping auto-rejection for abandoned CATI response (existing): ${surveyResponse._id} (status: ${surveyResponse.status})`);
        }
      } catch (autoRejectError) {
        console.error('Error checking auto-rejection:', autoRejectError);
        // Continue even if auto-rejection check fails
      }
      
      // Add response to QC batch only if NOT auto-rejected, NOT abandoned, and not already in one
      // Auto-rejected and abandoned responses are already decided and don't need QC processing
      const isAutoRejected = surveyResponse.verificationData?.autoRejected || false;
      const isAbandoned = surveyResponse.status === 'abandoned' || surveyResponse.metadata?.abandoned === true;
      if (!surveyResponse.qcBatch && !isAutoRejected && !isAbandoned) {
        try {
          const { addResponseToBatch } = require('../utils/qcBatchHelper');
          await addResponseToBatch(surveyResponse._id, queueEntry.survey._id, interviewerId.toString());
        } catch (batchError) {
          console.error('Error adding existing CATI response to batch:', batchError);
        }
      } else {
        console.log(`⏭️  Skipping batch addition for ${isAbandoned ? 'abandoned' : 'auto-rejected'} existing response ${surveyResponse._id}`);
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
      
      // Use the finalSetNumber already calculated at the top level
      
      // Determine status based on call connection AND consent form
      // Mark as "abandoned" if:
      // 1. Call is NOT connected, OR
      // 2. Consent form is "No" (even if call was connected)
      const shouldMarkAsAbandoned = !isCallConnected || consentResponse === 'no';
      const responseStatus = shouldMarkAsAbandoned ? 'abandoned' : 'Pending_Approval';
      
      // IMPORTANT: If call was connected, knownCallStatus should be 'call_connected' 
      // even if consent is "No" - this ensures accurate stats
      const finalKnownCallStatus = isCallConnected ? 'call_connected' : knownCallStatus;
      
      console.log(`📋 Creating new SurveyResponse - Call Connected: ${isCallConnected}, Consent: ${consentResponse}, Status: ${responseStatus}`);
      console.log(`📋 KnownCallStatus: ${finalKnownCallStatus} (original: ${knownCallStatus}, isCallConnected: ${isCallConnected})`);
      
      surveyResponse = new SurveyResponse({
        responseId,
        survey: queueEntry.survey._id,
        interviewer: interviewerId,
        sessionId: session.sessionId,
        interviewMode: 'cati',
        call_id: callId || null, // Store DeepCall callId
        setNumber: (finalSetNumber !== null && finalSetNumber !== undefined && !isNaN(Number(finalSetNumber))) ? Number(finalSetNumber) : null, // Save which Set was shown in this CATI interview (ensure it's a proper Number type or null)
        knownCallStatus: finalKnownCallStatus, // Store call status - 'call_connected' if call was connected, even if consent is "No"
        consentResponse: consentResponse, // Store consent form response (yes/no)
        responses: allResponses,
        selectedAC: finalSelectedAC || null,
        selectedPollingStation: finalSelectedPollingStation || null,
        location: null, // No GPS location for CATI
        OldinterviewerID: oldInterviewerID || null, // Save old interviewer ID
        supervisorID: finalSupervisorID || null, // Save supervisor ID
        startTime: finalStartTime, // Required field
        endTime: finalEndTime, // Required field
        totalTimeSpent: finalTotalTimeSpent, // Required field - Form Duration uses this
        status: responseStatus, // Set to "abandoned" if call not connected OR consent is "No"
        abandonedReason: consentResponse === 'no' ? 'Consent_Form_Disagree' : (!isCallConnected && finalCallStatus && finalCallStatus !== 'call_connected' && finalCallStatus !== 'success' ? 'Call_Not_Connected' : null), // Set standardized abandonment reason
        totalQuestions: totalQuestions || 0, // Required field - ensure it's not undefined
        answeredQuestions: answeredQuestions || 0, // Required field - ensure it's not undefined
        skippedQuestions: (totalQuestions || 0) - (answeredQuestions || 0), // Optional but good to have
        completionPercentage: completionPercentage || 0, // Required field - ensure it's not undefined
        metadata: {
          respondentQueueId: queueEntry._id,
          respondentName: queueEntry.respondentContact?.name || queueEntry.respondentContact?.name,
          respondentPhone: queueEntry.respondentContact?.phone || queueEntry.respondentContact?.phone,
          callRecordId: queueEntry.callRecord?._id,
          callStatus: finalCallStatus, // Store call status in metadata (legacy)
          abandoned: shouldMarkAsAbandoned, // Mark as abandoned if call not connected OR consent is "No"
          abandonmentReason: consentResponse === 'no' ? 'consent_refused' : (!isCallConnected ? reason : null)
        }
      });
      
      // Verify setNumber is set before saving
      console.log(`🔴🔴🔴 SurveyResponse object created - setNumber before save: ${surveyResponse.setNumber}, type: ${typeof surveyResponse.setNumber}`);

      try {
        // Log before saving
        console.log(`🔴🔴🔴 About to save NEW SurveyResponse - setNumber in object: ${surveyResponse.setNumber}, type: ${typeof surveyResponse.setNumber}`);
        console.log(`🔴🔴🔴 SurveyResponse document before save:`, JSON.stringify({ 
          _id: surveyResponse._id, 
          responseId: surveyResponse.responseId, 
          setNumber: surveyResponse.setNumber,
          interviewMode: surveyResponse.interviewMode,
          sessionId: surveyResponse.sessionId
        }, null, 2));
        
        // CRITICAL: For CATI interviews, save setNumber using direct MongoDB update
        // Save the response first
        console.log(`🔴🔴🔴 Saving SurveyResponse to database...`);
        await surveyResponse.save();
        console.log(`🔴🔴🔴 SurveyResponse saved. Now checking setNumber in saved object: ${surveyResponse.setNumber}`);
        
        // CRITICAL: Immediately update setNumber using native MongoDB after initial save
        // This ensures it's persisted even if Mongoose stripped it out
        if (finalSetNumber !== null && finalSetNumber !== undefined && !isNaN(Number(finalSetNumber))) {
          try {
            const mongoose = require('mongoose');
            const collection = mongoose.connection.collection('surveyresponses');
            const immediateUpdateResult = await collection.updateOne(
              { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
              { $set: { setNumber: Number(finalSetNumber) } }
            );
            console.log(`🔴🔴🔴 Immediate setNumber update after save - matched: ${immediateUpdateResult.matchedCount}, modified: ${immediateUpdateResult.modifiedCount}, setNumber: ${Number(finalSetNumber)}`);
            
            // Verify immediately
            const immediateVerify = await collection.findOne(
              { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
              { projection: { setNumber: 1 } }
            );
            console.log(`🔴🔴🔴 Immediate verification - setNumber in DB: ${immediateVerify?.setNumber}`);
          } catch (immediateUpdateError) {
            console.error('❌ Error in immediate setNumber update:', immediateUpdateError);
          }
        }
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
    
    // Check for auto-rejection conditions ONLY if call was connected AND consent is "Yes"
    // Abandoned calls (status = 'abandoned') should NOT go through auto-rejection
    const { checkAutoRejection, applyAutoRejection } = require('../utils/autoRejectionHelper');
    try {
      // IMPORTANT: Skip auto-rejection if:
      // 1. Status is 'abandoned' (call not connected OR consent refused), OR
      // 2. Consent is "No" (even if call was connected)
      const shouldSkipAutoRejection = surveyResponse.status === 'abandoned' || consentResponse === 'no';
      if (!shouldSkipAutoRejection && isCallConnected) {
        // CRITICAL: Preserve setNumber before auto-rejection check
        // Ensure it's a proper Number type
        const setNumberToPreserve = (finalSetNumber !== null && finalSetNumber !== undefined && !isNaN(Number(finalSetNumber)))
          ? Number(finalSetNumber)
          : ((surveyResponse.setNumber !== null && surveyResponse.setNumber !== undefined && !isNaN(Number(surveyResponse.setNumber)))
            ? Number(surveyResponse.setNumber)
            : null);
        console.log(`💾 Preserving setNumber before auto-rejection check (new response): ${setNumberToPreserve} (type: ${typeof setNumberToPreserve}), finalSetNumber: ${finalSetNumber} (type: ${typeof finalSetNumber})`);
        
        const rejectionInfo = await checkAutoRejection(surveyResponse, allResponses, queueEntry.survey._id);
        if (rejectionInfo) {
          await applyAutoRejection(surveyResponse, rejectionInfo);
          
          // CRITICAL: Re-apply setNumber after auto-rejection (it might have been lost)
          // ALWAYS re-apply, even if null, to ensure the field exists
          // CRITICAL: Ensure it's a proper Number type
          const setNumberToRestore = (setNumberToPreserve !== null && setNumberToPreserve !== undefined && !isNaN(Number(setNumberToPreserve))) 
            ? Number(setNumberToPreserve) 
            : null;
          surveyResponse.setNumber = setNumberToRestore;
          surveyResponse.markModified('setNumber');
          await surveyResponse.save();
          console.log(`💾 Restored setNumber after auto-rejection (new response): ${surveyResponse.setNumber} (type: ${typeof surveyResponse.setNumber}), original finalSetNumber: ${finalSetNumber} (type: ${typeof finalSetNumber})`);
          
          // Also update using native MongoDB to ensure it's persisted
          try {
            const mongoose = require('mongoose');
            const collection = mongoose.connection.collection('surveyresponses');
            await collection.updateOne(
              { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
              { $set: { setNumber: setNumberToRestore } }
            );
            console.log(`💾 Native MongoDB update after auto-rejection: ${setNumberToRestore} (type: ${typeof setNumberToRestore})`);
          } catch (nativeUpdateError) {
            console.error('Error in native MongoDB update after auto-rejection:', nativeUpdateError);
          }
          
          // Refresh the response to get updated status
          await surveyResponse.populate('survey');
        }
      } else {
        console.log(`⏭️  Skipping auto-rejection for abandoned CATI response: ${surveyResponse._id} (status: ${surveyResponse.status})`);
      }
    } catch (autoRejectError) {
      console.error('Error checking auto-rejection:', autoRejectError);
      // Continue even if auto-rejection check fails
    }
    
    // Add response to QC batch instead of queuing immediately
    try {
      // Check if response was auto-rejected before adding to batch
      const isAutoRejected = surveyResponse.verificationData?.autoRejected || false;
      
      // Only add to batch if NOT auto-rejected
      // Auto-rejected responses are already decided and don't need QC processing
      if (!isAutoRejected) {
        const { addResponseToBatch } = require('../utils/qcBatchHelper');
        await addResponseToBatch(surveyResponse._id, queueEntry.survey._id, interviewerId.toString());
      } else {
        console.log(`⏭️  Skipping batch addition for auto-rejected response ${surveyResponse._id}`);
      }
    } catch (batchError) {
      console.error('Error adding CATI response to batch:', batchError);
      // Continue even if batch addition fails - response is still saved
    }

    // Update queue entry based on call status
    if (finalCallStatus === 'success') {
      // Call was successful - mark as interview success
      queueEntry.status = 'interview_success';
      queueEntry.response = surveyResponse._id;
      queueEntry.completedAt = new Date();
    } else if (finalCallStatus === 'number_does_not_exist') {
      // Number does not exist - remove from queue (don't retry)
      queueEntry.status = 'does_not_exist';
      // Optionally delete the queue entry or mark it as inactive
      // For now, just mark as does_not_exist so it won't be picked up again
    } else if (finalCallStatus === 'busy' || finalCallStatus === 'did_not_pick_up') {
      // Busy or didn't pick up - send to end of queue for retry
      queueEntry.status = 'pending';
      queueEntry.priority = -1; // Lowest priority to move to end
      queueEntry.assignedTo = null;
      queueEntry.assignedAt = null;
      queueEntry.createdAt = new Date(); // Update createdAt to move to end
    } else {
      // Other statuses (switched_off, not_reachable, didnt_get_call, etc.) - mark appropriately
      queueEntry.status = finalCallStatus === 'switched_off' ? 'switched_off' :
                         finalCallStatus === 'not_reachable' ? 'not_reachable' :
                         'pending'; // Default to pending for other statuses
      if (finalCallStatus !== 'didnt_get_call') {
        // For all except "didnt_get_call", send to end of queue
        queueEntry.priority = -1;
        queueEntry.assignedTo = null;
        queueEntry.assignedAt = null;
        queueEntry.createdAt = new Date();
      }
      // "didnt_get_call" is API failure, don't retry immediately but keep in queue
    }
    
    queueEntry.response = surveyResponse._id;
    queueEntry.completedAt = new Date();
    await queueEntry.save();
    
    // CRITICAL: Save setNumber in SetData model for reliable set rotation
    // This is a dedicated model to track which set was used for each response
    // Re-extract setNumber from req.body one more time as a fallback
    let setNumberForSetData = null;
    
    // Try multiple sources in priority order
    if (finalSetNumber !== null && finalSetNumber !== undefined && !isNaN(Number(finalSetNumber))) {
      setNumberForSetData = Number(finalSetNumber);
    } else if (req.body.setNumber !== null && req.body.setNumber !== undefined && !isNaN(Number(req.body.setNumber))) {
      setNumberForSetData = Number(req.body.setNumber);
    } else if (setNumber !== null && setNumber !== undefined && !isNaN(Number(setNumber))) {
      setNumberForSetData = Number(setNumber);
    }
    
    console.log(`🔵🔵🔵 SetData creation check - finalSetNumber: ${finalSetNumber}, req.body.setNumber: ${req.body.setNumber}, destructured setNumber: ${setNumber}, setNumberForSetData: ${setNumberForSetData}`);
    console.log(`🔵🔵🔵 SetData creation check - queueEntry.survey: ${queueEntry.survey?._id || queueEntry.survey}, surveyResponse._id: ${surveyResponse._id}`);
    
    // Ensure survey reference is available - handle both populated and non-populated cases
    let surveyIdForSetData = null;
    if (queueEntry.survey) {
      surveyIdForSetData = queueEntry.survey._id || queueEntry.survey;
    }
    
    // If survey is not populated, get it from the surveyResponse
    if (!surveyIdForSetData && surveyResponse.survey) {
      surveyIdForSetData = surveyResponse.survey._id || surveyResponse.survey;
    }
    
    console.log(`🔵🔵🔵 SetData pre-check - setNumberForSetData: ${setNumberForSetData}, surveyIdForSetData: ${surveyIdForSetData}, surveyResponse._id: ${surveyResponse._id}`);
    console.log(`🔵🔵🔵 SetData pre-check - queueEntry.survey type: ${typeof queueEntry.survey}, surveyResponse.survey type: ${typeof surveyResponse.survey}`);
    
    if (setNumberForSetData !== null && setNumberForSetData !== undefined && surveyIdForSetData && surveyResponse._id) {
      try {
        const SetData = require('../models/SetData');
        console.log(`🔵🔵🔵 Creating SetData with - survey: ${surveyIdForSetData}, response: ${surveyResponse._id}, setNumber: ${setNumberForSetData}`);
        
        // Check if SetData already exists for this response (to avoid duplicates)
        const existingSetData = await SetData.findOne({ surveyResponse: surveyResponse._id });
        if (existingSetData) {
          // Update existing SetData
          existingSetData.setNumber = setNumberForSetData;
          existingSetData.survey = surveyIdForSetData;
          await existingSetData.save();
          console.log(`✅ SetData updated (existing) - _id: ${existingSetData._id}, survey: ${surveyIdForSetData}, response: ${surveyResponse._id}, setNumber: ${setNumberForSetData}`);
        } else {
          // Create new SetData
          const setData = new SetData({
            survey: surveyIdForSetData,
            surveyResponse: surveyResponse._id,
            setNumber: setNumberForSetData,
            interviewMode: 'cati'
          });
          
          console.log(`🔵🔵🔵 SetData object created, about to save...`);
          const savedSetData = await setData.save();
          console.log(`✅ SetData saved successfully (new) - _id: ${savedSetData._id}, survey: ${surveyIdForSetData}, response: ${surveyResponse._id}, setNumber: ${setNumberForSetData}`);
        }
      } catch (setDataError) {
        console.error('❌ CRITICAL Error saving SetData:', setDataError);
        console.error('❌ SetData error message:', setDataError.message);
        console.error('❌ SetData error name:', setDataError.name);
        if (setDataError.errors) {
          console.error('❌ SetData validation errors:', JSON.stringify(setDataError.errors, null, 2));
        }
        if (setDataError.code) {
          console.error('❌ SetData error code:', setDataError.code);
        }
        console.error('❌ SetData error stack:', setDataError.stack);
        // Don't fail the request if SetData save fails - response is already saved
      }
    } else {
      console.error(`❌ CRITICAL: Cannot save SetData - Missing required data. setNumberForSetData: ${setNumberForSetData}, surveyIdForSetData: ${surveyIdForSetData}, surveyResponse._id: ${surveyResponse._id}`);
    }

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

    // CRITICAL: FINAL STEP - ALWAYS update setNumber using MongoDB native update AFTER all other operations
    // This ensures setNumber is saved even if other operations overwrite it
    // IMPORTANT: Re-extract setNumber from req.body one more time as a fallback (in case finalSetNumber was lost)
    // The response object's setNumber might have been lost during auto-rejection or other operations
    // CRITICAL: Ensure it's a proper Number type (not string, not undefined)
    let setNumberToSave = null;
    
    // Try to get setNumber one more time from req.body (fallback)
    const setNumberFromBody = req.body.setNumber !== undefined ? req.body.setNumber 
      : (req.body.interviewData?.setNumber !== undefined ? req.body.interviewData.setNumber : null);
    
    // Priority: 1. finalSetNumber (from initial extraction), 2. setNumberFromBody (re-extracted), 3. surveyResponse.setNumber, 4. null
    if (finalSetNumber !== null && finalSetNumber !== undefined && !isNaN(Number(finalSetNumber))) {
      setNumberToSave = Number(finalSetNumber);
      console.log(`🔵🔵🔵 FINAL UPDATE - Using finalSetNumber: ${setNumberToSave}`);
    } else if (setNumberFromBody !== null && setNumberFromBody !== undefined && !isNaN(Number(setNumberFromBody))) {
      setNumberToSave = Number(setNumberFromBody);
      console.log(`🔵🔵🔵 FINAL UPDATE - Using setNumberFromBody (re-extracted): ${setNumberToSave}`);
    } else if (surveyResponse.setNumber !== null && surveyResponse.setNumber !== undefined && !isNaN(Number(surveyResponse.setNumber))) {
      setNumberToSave = Number(surveyResponse.setNumber);
      console.log(`🔵🔵🔵 FINAL UPDATE - Using surveyResponse.setNumber: ${setNumberToSave}`);
    } else {
      console.log(`⚠️  FINAL UPDATE - No valid setNumber found. finalSetNumber: ${finalSetNumber}, setNumberFromBody: ${setNumberFromBody}, surveyResponse.setNumber: ${surveyResponse.setNumber}`);
    }
    
    console.log(`🔵🔵🔵 FINAL UPDATE - setNumberToSave: ${setNumberToSave} (type: ${typeof setNumberToSave}), surveyResponse.setNumber: ${surveyResponse.setNumber} (type: ${typeof surveyResponse.setNumber}), finalSetNumber: ${finalSetNumber} (type: ${typeof finalSetNumber}), setNumberFromBody: ${setNumberFromBody} (type: ${typeof setNumberFromBody}), responseId: ${surveyResponse.responseId}`);
    
    // CRITICAL: Update setNumber SYNCHRONOUSLY before sending response
    // This ensures it happens and completes before the response is sent
    try {
      const mongoose = require('mongoose');
      const collectionName = SurveyResponse.collection.name;
      const collection = mongoose.connection.collection(collectionName);
      
      console.log(`🔵🔵🔵 Starting final setNumber update for responseId: ${surveyResponse.responseId}, setNumberToSave: ${setNumberToSave} (type: ${typeof setNumberToSave}), _id: ${surveyResponse._id}`);
      
      // CRITICAL: Update setNumber using native MongoDB - this MUST be the last operation
      // CRITICAL: Explicitly convert to Number to ensure type match with schema
      // IMPORTANT: Only update if setNumberToSave is not null - MongoDB might remove the field if we set it to null
      if (setNumberToSave !== null && setNumberToSave !== undefined) {
        const updateValue = Number(setNumberToSave);
        console.log(`🔵🔵🔵 Update value: ${updateValue} (type: ${typeof updateValue})`);
        
        // CRITICAL: Use $set with explicit Number value
        const updateResult = await collection.updateOne(
          { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
          { 
            $set: { 
              setNumber: updateValue 
            } 
          },
          { 
            upsert: false
          }
        );
        
        console.log(`🔵🔵🔵 Update result - matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}, acknowledged: ${updateResult.acknowledged}, updateValue: ${updateValue} (type: ${typeof updateValue})`);
        
        // If update didn't modify, log a warning but continue
        if (updateResult.modifiedCount === 0) {
          console.warn(`⚠️  Update did not modify document - this might mean the value was already ${updateValue}`);
        }
      
      // Verify the update worked
      if (updateResult.matchedCount === 0) {
        console.error(`❌ CRITICAL: Document not found for setNumber update - _id: ${surveyResponse._id}, responseId: ${surveyResponse.responseId}`);
      } else if (updateResult.modifiedCount === 0 && setNumberToSave !== null) {
        console.error(`❌ CRITICAL: setNumber update did not modify document - _id: ${surveyResponse._id}, setNumber: ${setNumberToSave}`);
      }
      
        // Immediately verify by reading back from database
        const verifyDoc = await collection.findOne(
          { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
          { projection: { setNumber: 1, responseId: 1 } }
        );
        
        console.log(`🔵🔵🔵 Verification - Expected: ${updateValue} (type: ${typeof updateValue}), Got: ${verifyDoc?.setNumber} (type: ${typeof verifyDoc?.setNumber}), responseId: ${verifyDoc?.responseId}`);
        
        // Use loose equality for comparison (== instead of ===) to handle type coercion
        if (verifyDoc?.setNumber != updateValue) {
          console.error(`❌ CRITICAL: setNumber verification failed - Expected: ${updateValue} (type: ${typeof updateValue}), Got: ${verifyDoc?.setNumber} (type: ${typeof verifyDoc?.setNumber}), responseId: ${surveyResponse.responseId}`);
          // Try one more time with explicit type conversion and force write
          const retryValue = Number(setNumberToSave);
          const retryResult = await collection.updateOne(
            { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
            { 
              $set: { setNumber: retryValue }
            },
            {
              upsert: false
            }
          );
          console.log(`🔵🔵🔵 Retry result - matched: ${retryResult.matchedCount}, modified: ${retryResult.modifiedCount}, retryValue: ${retryValue} (type: ${typeof retryValue})`);
          
          // Final verification after retry
          const finalVerify = await collection.findOne(
            { _id: new mongoose.Types.ObjectId(surveyResponse._id) },
            { projection: { setNumber: 1, responseId: 1 } }
          );
          if (finalVerify?.setNumber != retryValue) {
            console.error(`❌ CRITICAL: setNumber STILL NOT SAVED after retry - Expected: ${retryValue} (type: ${typeof retryValue}), Got: ${finalVerify?.setNumber} (type: ${typeof finalVerify?.setNumber}), responseId: ${surveyResponse.responseId}`);
            console.error(`❌ CRITICAL: Full document after retry:`, JSON.stringify(finalVerify, null, 2));
          } else {
            console.log(`✅ setNumber successfully saved after retry: ${finalVerify?.setNumber} (type: ${typeof finalVerify?.setNumber}), responseId: ${surveyResponse.responseId}`);
          }
        } else {
          console.log(`✅ setNumber successfully saved: ${verifyDoc?.setNumber} (type: ${typeof verifyDoc?.setNumber}), responseId: ${surveyResponse.responseId}`);
        }
      } else {
        console.warn(`⚠️  FINAL UPDATE - Skipping setNumber update because setNumberToSave is null/undefined. setNumberToSave: ${setNumberToSave}`);
      }
    } catch (finalUpdateError) {
      console.error('❌ CRITICAL: Error in final setNumber update:', finalUpdateError);
      console.error('❌ Error stack:', finalUpdateError.stack);
      // Don't fail the request if this fails - response is already saved
    }
    
    // Send response to client AFTER setNumber update completes
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

