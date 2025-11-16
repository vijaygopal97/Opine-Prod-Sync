const SurveyResponse = require('../models/SurveyResponse');
const InterviewSession = require('../models/InterviewSession');
const Survey = require('../models/Survey');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Start a new interview session
const startInterview = async (req, res) => {
  try {
    const { surveyId } = req.params;
    const interviewerId = req.user.id;

    // Check if survey exists and is active
    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    if (survey.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Survey is not active'
      });
    }

    // Check if interviewer is assigned to this survey and get assignment details
    // Handle both single-mode (assignedInterviewers) and multi-mode (capiInterviewers, catiInterviewers) surveys
    let assignment = null;
    let assignedMode = null;

    // Check for single-mode assignment
    if (survey.assignedInterviewers && survey.assignedInterviewers.length > 0) {
      assignment = survey.assignedInterviewers.find(
        assignment => assignment.interviewer.toString() === interviewerId && 
                     assignment.status === 'assigned'
      );
      if (assignment) {
        assignedMode = assignment.assignedMode || 'single';
      }
    }

    // Check for multi-mode CAPI assignment
    if (!assignment && survey.capiInterviewers && survey.capiInterviewers.length > 0) {
      assignment = survey.capiInterviewers.find(
        assignment => assignment.interviewer.toString() === interviewerId && 
                     assignment.status === 'assigned'
      );
      if (assignment) {
        assignedMode = 'capi';
      }
    }

    // Check for multi-mode CATI assignment
    if (!assignment && survey.catiInterviewers && survey.catiInterviewers.length > 0) {
      assignment = survey.catiInterviewers.find(
        assignment => assignment.interviewer.toString() === interviewerId && 
                     assignment.status === 'assigned'
      );
      if (assignment) {
        assignedMode = 'cati';
      }
    }

    if (!assignment) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this survey'
      });
    }

    // Check if AC selection is required
    const requiresACSelection = survey.assignACs && 
                               assignment.assignedACs && 
                               assignment.assignedACs.length > 0;

    // Debug logging (can be removed in production)
    // console.log('=== AC SELECTION DEBUG ===');
    // console.log('Survey ID:', survey._id);
    // console.log('Survey assignACs:', survey.assignACs);
    // console.log('Assignment:', assignment);
    // console.log('Assignment assignedACs:', assignment.assignedACs);
    // console.log('requiresACSelection:', requiresACSelection);
    // console.log('=== END AC SELECTION DEBUG ===');

    // Abandon any existing sessions for this survey and interviewer
    await InterviewSession.updateMany({
      survey: surveyId,
      interviewer: interviewerId,
      status: { $in: ['active', 'paused'] }
    }, {
      status: 'abandoned'
    });

    // Create new session
    const sessionId = uuidv4();
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      platform: req.body.platform || 'unknown',
      browser: req.body.browser || 'unknown',
      screenResolution: req.body.screenResolution || 'unknown',
      timezone: req.body.timezone || 'unknown'
    };

    // Determine the correct interview mode for the session
    let interviewMode = 'capi'; // default fallback
    
    console.log('🔍 Survey mode:', survey.mode);
    console.log('🔍 Assigned mode:', assignedMode);
    
    if (survey.mode === 'multi_mode') {
      // For multi-mode surveys, use the assigned mode
      interviewMode = assignedMode || 'capi';
      console.log('🔍 Multi-mode survey, using assigned mode:', interviewMode);
    } else {
      // For single-mode surveys, use the survey mode
      interviewMode = survey.mode || 'capi';
      console.log('🔍 Single-mode survey, using survey mode:', interviewMode);
    }
    
    console.log('🔍 Final interview mode:', interviewMode);
    
    // Debug survey questions
    console.log('🔍 Survey questions count:', survey.questions ? survey.questions.length : 0);
    console.log('🔍 Survey sections count:', survey.sections ? survey.sections.length : 0);
    console.log('🔍 Survey ID:', survey._id);
    console.log('🔍 Survey Name:', survey.surveyName);
    console.log('🔍 Full survey sections:', JSON.stringify(survey.sections, null, 2));
    console.log('🔍 Full survey questions:', JSON.stringify(survey.questions, null, 2));
    if (survey.questions && survey.questions.length > 0) {
      console.log('🔍 First question:', survey.questions[0].text);
    }
    if (survey.sections && survey.sections.length > 0) {
      console.log('🔍 First section:', survey.sections[0].title, 'Questions:', survey.sections[0].questions ? survey.sections[0].questions.length : 0);
    }

    const session = await InterviewSession.createSession({
      sessionId,
      survey: surveyId,
      interviewer: interviewerId,
      interviewMode: interviewMode,
      deviceInfo,
      metadata: {
        surveyVersion: survey.version || '1.0',
        startMethod: 'manual',
        surveyMode: survey.mode, // Store the original survey mode for reference
        assignedMode: assignedMode // Store the assigned mode for multi-mode surveys
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
        currentPosition: {
          sectionIndex: 0,
          questionIndex: 0
        },
        reachedQuestions: session.reachedQuestions,
        startTime: session.startTime,
        // AC Selection information
        requiresACSelection: requiresACSelection,
        assignedACs: requiresACSelection ? assignment.assignedACs : []
      }
    });

  } catch (error) {
    console.error('Error starting interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start interview',
      error: error.message
    });
  }
};

// Get interview session
const getInterviewSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const interviewerId = req.user.id;

    const session = await InterviewSession.findOne({
      sessionId,
      interviewer: interviewerId
    }).populate('survey', 'name description sections questions interviewMode');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        survey: session.survey,
        currentPosition: {
          sectionIndex: session.currentSectionIndex,
          questionIndex: session.currentQuestionIndex
        },
        reachedQuestions: session.reachedQuestions,
        currentResponses: session.currentResponses,
        startTime: session.startTime,
        totalTimeSpent: session.totalTimeSpent,
        status: session.status
      }
    });

  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session',
      error: error.message
    });
  }
};

// Update current response (temporary storage)
const updateResponse = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { questionId, response } = req.body;
    const interviewerId = req.user.id;

    const session = await InterviewSession.findOne({
      sessionId,
      interviewer: interviewerId
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Update response in temporary storage
    session.updateResponse(questionId, response);
    await session.save();

    res.status(200).json({
      success: true,
      message: 'Response updated'
    });

  } catch (error) {
    console.error('Error updating response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update response',
      error: error.message
    });
  }
};

// Navigate to question
const navigateToQuestion = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sectionIndex, questionIndex } = req.body;
    const interviewerId = req.user.id;

    const session = await InterviewSession.findOne({
      sessionId,
      interviewer: interviewerId
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Check if navigation is allowed
    if (!session.canNavigateToQuestion(sectionIndex, questionIndex)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot navigate to this question'
      });
    }

    // Update current position
    session.updateCurrentPosition(sectionIndex, questionIndex);
    await session.save();

    res.status(200).json({
      success: true,
      message: 'Navigation successful',
      data: {
        currentPosition: {
          sectionIndex: session.currentSectionIndex,
          questionIndex: session.currentQuestionIndex
        }
      }
    });

  } catch (error) {
    console.error('Error navigating to question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to navigate to question',
      error: error.message
    });
  }
};

// Mark question as reached
const markQuestionReached = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sectionIndex, questionIndex, questionId } = req.body;
    const interviewerId = req.user.id;

    const session = await InterviewSession.findOne({
      sessionId,
      interviewer: interviewerId
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    session.markQuestionReached(sectionIndex, questionIndex, questionId);
    await session.save();

    res.status(200).json({
      success: true,
      message: 'Question marked as reached'
    });

  } catch (error) {
    console.error('Error marking question as reached:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark question as reached',
      error: error.message
    });
  }
};

// Pause interview
const pauseInterview = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const interviewerId = req.user.id;

    const session = await InterviewSession.findOne({
      sessionId,
      interviewer: interviewerId
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    session.pauseSession();
    await session.save();

    res.status(200).json({
      success: true,
      message: 'Interview paused'
    });

  } catch (error) {
    console.error('Error pausing interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to pause interview',
      error: error.message
    });
  }
};

// Resume interview
const resumeInterview = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const interviewerId = req.user.id;

    const session = await InterviewSession.findOne({
      sessionId,
      interviewer: interviewerId
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    session.resumeSession();
    await session.save();

    res.status(200).json({
      success: true,
      message: 'Interview resumed'
    });

  } catch (error) {
    console.error('Error resuming interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resume interview',
      error: error.message
    });
  }
};

// Complete interview and save final response
const completeInterview = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { responses, qualityMetrics, metadata } = req.body;
    const interviewerId = req.user.id;
    
    // Extract audioRecording from metadata
    const audioRecording = metadata?.audioRecording || {};

    const session = await InterviewSession.findOne({
      sessionId,
      interviewer: interviewerId
    }).populate('survey');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Calculate final statistics
    const endTime = new Date();
    const totalTimeSpent = Math.round((endTime - session.startTime) / 1000);

    // Create complete survey response
    const surveyResponse = await SurveyResponse.createCompleteResponse({
      survey: session.survey._id,
      interviewer: session.interviewer,
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime,
      responses,
      interviewMode: session.interviewMode,
      deviceInfo: session.deviceInfo,
      audioRecording: audioRecording,
      selectedAC: metadata?.selectedAC || null,
      location: metadata?.location || null,
      qualityMetrics,
      metadata: {
        ...session.metadata,
        ...metadata
      }
    });

    await surveyResponse.save();

    // Mark session as abandoned (cleanup)
    session.abandonSession();
    await session.save();

    res.status(200).json({
      success: true,
      message: 'Interview completed successfully and submitted for approval',
      data: {
        responseId: surveyResponse.responseId, // Use the new numerical responseId
        mongoId: surveyResponse._id, // Keep MongoDB ID for internal reference
        completionPercentage: surveyResponse.completionPercentage,
        totalTimeSpent: surveyResponse.totalTimeSpent,
        status: surveyResponse.status,
        summary: surveyResponse.getResponseSummary()
      }
    });

  } catch (error) {
    console.error('Error completing interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete interview',
      error: error.message
    });
  }
};

// Abandon interview
const abandonInterview = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const interviewerId = req.user.id;

    const session = await InterviewSession.findOne({
      sessionId,
      interviewer: interviewerId
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    session.abandonSession();
    await session.save();

    res.status(200).json({
      success: true,
      message: 'Interview abandoned'
    });

  } catch (error) {
    console.error('Error abandoning interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to abandon interview',
      error: error.message
    });
  }
};

// Get gender response counts for quota management
const getGenderResponseCounts = async (req, res) => {
  try {
    const { surveyId } = req.params;
    const interviewerId = req.user.id;

    // Check if survey exists
    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    // Check if interviewer is assigned to this survey
    // Handle both single-mode (assignedInterviewers) and multi-mode (capiInterviewers, catiInterviewers) surveys
    let isAssigned = false;

    // Check for single-mode assignment
    if (survey.assignedInterviewers && survey.assignedInterviewers.length > 0) {
      isAssigned = survey.assignedInterviewers.some(
        assignment => assignment.interviewer.toString() === interviewerId && 
                     assignment.status === 'assigned'
      );
    }

    // Check for multi-mode CAPI assignment
    if (!isAssigned && survey.capiInterviewers && survey.capiInterviewers.length > 0) {
      isAssigned = survey.capiInterviewers.some(
        assignment => assignment.interviewer.toString() === interviewerId && 
                     assignment.status === 'assigned'
      );
    }

    // Check for multi-mode CATI assignment
    if (!isAssigned && survey.catiInterviewers && survey.catiInterviewers.length > 0) {
      isAssigned = survey.catiInterviewers.some(
        assignment => assignment.interviewer.toString() === interviewerId && 
                     assignment.status === 'assigned'
      );
    }

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this survey'
      });
    }

    // Get gender response counts from completed responses
    const genderCounts = await SurveyResponse.aggregate([
      {
        $match: {
          survey: survey._id,
          status: { $in: ['Pending_Approval', 'Approved', 'completed'] }
        }
      },
      {
        $unwind: '$responses'
      },
      {
        $match: {
          'responses.questionId': 'fixed_respondent_gender'
        }
      },
      {
        $group: {
          _id: '$responses.response',
          count: { $sum: 1 }
        }
      }
    ]);

    // Convert to object format
    const genderResponseCounts = {};
    genderCounts.forEach(item => {
      genderResponseCounts[item._id] = item.count;
    });

    // Get target audience gender requirements
    const genderRequirements = survey.targetAudience?.demographics?.genderRequirements || {};
    const sampleSize = survey.sampleSize || 0;

    // Calculate quotas and current status
    const genderQuotas = {};
    const selectedGenders = Object.keys(genderRequirements).filter(g => 
      genderRequirements[g] && !g.includes('Percentage')
    );

    selectedGenders.forEach(gender => {
      const percentage = genderRequirements[`${gender}Percentage`] || 
                       (selectedGenders.length === 1 ? 100 : 0);
      const quota = Math.round((sampleSize * percentage) / 100);
      const currentCount = genderResponseCounts[gender.toLowerCase()] || 0;
      
      genderQuotas[gender] = {
        percentage,
        quota,
        currentCount,
        remaining: Math.max(0, quota - currentCount),
        isFull: currentCount >= quota
      };
    });

    res.status(200).json({
      success: true,
      data: {
        genderQuotas,
        totalResponses: Object.values(genderResponseCounts).reduce((sum, count) => sum + count, 0),
        sampleSize,
        genderResponseCounts
      }
    });

  } catch (error) {
    console.error('Error getting gender response counts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get gender response counts',
      error: error.message
    });
  }
};

// Upload audio file for interview
const uploadAudioFile = async (req, res) => {
  try {
    console.log('Audio upload request received:', {
      hasFile: !!req.file,
      fileSize: req.file?.size,
      sessionId: req.body.sessionId,
      surveyId: req.body.surveyId,
      interviewerId: req.user?.id,
      fileDetails: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        fieldname: req.file.fieldname,
        encoding: req.file.encoding
      } : null
    });
    
    const { sessionId, surveyId } = req.body;
    const interviewerId = req.user.id;

    if (!req.file) {
      console.error('No file received in request');
      console.error('Request body:', req.body);
      console.error('Request files:', req.files);
      return res.status(400).json({
        success: false,
        message: 'No audio file provided'
      });
    }

    // Check if session exists and belongs to interviewer
    const session = await InterviewSession.findOne({
      sessionId,
      interviewer: interviewerId
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Generate unique filename based on uploaded file extension
    const timestamp = Date.now();
    const originalExt = path.extname(req.file.originalname) || '.webm';
    const filename = `interview_${sessionId}_${timestamp}${originalExt}`;
    
    const fs = require('fs');
    const { uploadToS3, isS3Configured } = require('../utils/cloudStorage');
    
    let audioUrl;
    let storageType = 'local';
    
    // Try to upload to S3 if configured, otherwise use local storage
    if (isS3Configured()) {
      try {
        const s3Key = `audio-recordings/${filename}`;
        const metadata = {
          sessionId,
          surveyId,
          interviewerId,
          uploadedBy: 'interview-interface'
        };
        
        audioUrl = await uploadToS3(req.file.path, s3Key, metadata);
        storageType = 's3';
        
        // Clean up local temp file
        fs.unlinkSync(req.file.path);
        
      } catch (s3Error) {
        console.warn('S3 upload failed, falling back to local storage:', s3Error.message);
        // Fall back to local storage
        storageType = 'local';
      }
    }
    
    // Use local storage if S3 is not configured or failed
    if (storageType === 'local') {
      // Ensure uploads directory exists
      const uploadDir = path.join(__dirname, '../../uploads/audio');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Move file from temp location to permanent location
      const tempPath = req.file.path;
      const finalPath = path.join(uploadDir, filename);
      
      console.log('Moving file from:', tempPath, 'to:', finalPath);
      console.log('File details:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        fieldname: req.file.fieldname
      });
      
      // Check if temp file exists
      if (fs.existsSync(tempPath)) {
        fs.renameSync(tempPath, finalPath);
        console.log('File moved successfully');
      } else {
        console.error('Temp file does not exist:', tempPath);
        const tempDir = path.dirname(tempPath);
        if (fs.existsSync(tempDir)) {
          console.error('Available files in temp directory:', fs.readdirSync(tempDir));
        } else {
          console.error('Temp directory does not exist:', tempDir);
          // Try to create it
          fs.mkdirSync(tempDir, { recursive: true });
          console.log('Created temp directory:', tempDir);
        }
        throw new Error(`Temporary file not found at: ${tempPath}. File may not have been uploaded correctly.`);
      }
      
      // Generate URL for accessing the file
      audioUrl = `/uploads/audio/${filename}`;
    }
    
    console.log('Upload response - File size:', req.file.size, 'bytes');
    
    res.status(200).json({
      success: true,
      message: 'Audio file uploaded successfully',
      data: {
        audioUrl,
        filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        sessionId,
        surveyId,
        storageType
      }
    });

  } catch (error) {
    console.error('Error uploading audio file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload audio file',
      error: error.message
    });
  }
};

// Get all interviews conducted by the logged-in interviewer
const getMyInterviews = async (req, res) => {
  try {
    const interviewerId = req.user.id;
    const { search, status, gender, ageMin, ageMax, sortBy = 'endTime', sortOrder = 'desc' } = req.query;

    // Build query
    let query = { interviewer: interviewerId };

    // Add status filter if provided
    if (status) {
      query.status = status;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Find interviews with populated survey data
    let interviews = await SurveyResponse.find(query)
      .populate('survey', 'surveyName description category sections')
      .sort(sort)
      .lean();

    console.log('getMyInterviews - Found interviews:', interviews.length);

    // Apply search filter if provided
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      interviews = interviews.filter(interview => {
        // Search in survey name, response ID, session ID
        const basicMatch = interview.survey?.surveyName?.match(searchRegex) ||
                          interview.responseId?.toString().includes(search) ||
                          interview.sessionId?.match(searchRegex);
        
        // Search in respondent name
        const respondentNameMatch = interview.responses?.some(response => {
          const isNameQuestion = response.questionText.toLowerCase().includes('name') || 
                                response.questionText.toLowerCase().includes('respondent');
          return isNameQuestion && response.response?.toString().toLowerCase().includes(search.toLowerCase());
        });
        
        return basicMatch || respondentNameMatch;
      });
    }

    // Apply gender filter if provided
    if (gender) {
      interviews = interviews.filter(interview => {
        const genderResponse = interview.responses?.find(response => 
          response.questionText.toLowerCase().includes('gender') || 
          response.questionText.toLowerCase().includes('sex')
        );
        return genderResponse?.response?.toString().toLowerCase() === gender.toLowerCase();
      });
    }

    // Apply age range filter if provided
    if (ageMin || ageMax) {
      interviews = interviews.filter(interview => {
        const ageResponse = interview.responses?.find(response => 
          response.questionText.toLowerCase().includes('age') || 
          response.questionText.toLowerCase().includes('year')
        );
        
        if (!ageResponse?.response) return false;
        
        // Extract age number from response
        const ageMatch = ageResponse.response.toString().match(/\d+/);
        if (!ageMatch) return false;
        
        const age = parseInt(ageMatch[0]);
        if (ageMin && age < parseInt(ageMin)) return false;
        if (ageMax && age > parseInt(ageMax)) return false;
        
        return true;
      });
    }

    // Helper function to evaluate if a condition is met
    const evaluateCondition = (condition, responses) => {
      if (!condition.questionId || !condition.operator || condition.value === undefined || condition.value === '__NOVALUE__') {
        return false;
      }

      // Find the response for the target question
      const targetResponse = responses.find(response => {
        return response.questionId === condition.questionId || 
               response.questionText === condition.questionText;
      });

      if (!targetResponse || !targetResponse.response) {
        return false;
      }

      const responseValue = targetResponse.response;
      const conditionValue = condition.value;

      switch (condition.operator) {
        case 'equals':
          return responseValue === conditionValue;
        case 'not_equals':
          return responseValue !== conditionValue;
        case 'contains':
          return responseValue.toString().toLowerCase().includes(conditionValue.toString().toLowerCase());
        case 'not_contains':
          return !responseValue.toString().toLowerCase().includes(conditionValue.toString().toLowerCase());
        case 'greater_than':
          return parseFloat(responseValue) > parseFloat(conditionValue);
        case 'less_than':
          return parseFloat(responseValue) < parseFloat(conditionValue);
        case 'is_empty':
          return !responseValue || responseValue.toString().trim() === '';
        case 'is_not_empty':
          return responseValue && responseValue.toString().trim() !== '';
        case 'is_selected':
          return responseValue === conditionValue;
        case 'is_not_selected':
          return responseValue !== conditionValue;
        default:
          return false;
      }
    };

    // Helper function to check if all conditions are met
    const areConditionsMet = (conditions, responses) => {
      if (!conditions || conditions.length === 0) return true;
      return conditions.every(condition => evaluateCondition(condition, responses));
    };

    // Helper function to find question by text in survey
    const findQuestionByText = (questionText, survey) => {
      if (survey?.sections) {
        for (const section of survey.sections) {
          if (section.questions) {
            for (const question of section.questions) {
              if (question.text === questionText) {
                return question;
              }
            }
          }
        }
      }
      return null;
    };

    // Transform the data to include calculated fields
    const transformedInterviews = interviews.map(interview => {
      // Calculate effective questions (only questions that were actually shown to the user)
      const effectiveQuestions = interview.responses?.filter(r => {
        // If not skipped, it was shown and answered
        if (!r.isSkipped) return true;
        
        // If skipped, check if it was due to unmet conditions
        const surveyQuestion = findQuestionByText(r.questionText, interview.survey);
        const hasConditions = surveyQuestion?.conditions && surveyQuestion.conditions.length > 0;
        
        if (hasConditions) {
          // Check if conditions were met
          const conditionsMet = areConditionsMet(surveyQuestion.conditions, interview.responses);
          
          // If conditions were not met, this question was never shown
          if (!conditionsMet) {
            return false;
          }
        }
        
        // If no conditions or conditions were met, user saw it and chose to skip
        return true;
      }).length || 0;
      
      const answeredQuestions = interview.responses?.filter(r => !r.isSkipped).length || 0;
      const completionPercentage = effectiveQuestions > 0 ? Math.round((answeredQuestions / effectiveQuestions) * 100) : 0;

      return {
        ...interview,
        totalQuestions: effectiveQuestions, // Use effective questions instead of all responses
        answeredQuestions,
        completionPercentage
      };
    });

    res.status(200).json({
      success: true,
      data: {
        interviews: transformedInterviews,
        total: transformedInterviews.length
      }
    });

  } catch (error) {
    console.error('Error fetching my interviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch interviews',
      error: error.message
    });
  }
};

// Get pending approval responses for company admin
const getPendingApprovals = async (req, res) => {
  try {
    const companyId = req.user.company;
    const userId = req.user.id;
    const userType = req.user.userType;
    const { search, gender, ageMin, ageMax, sortBy = 'endTime', sortOrder = 'desc' } = req.query;

    console.log('getPendingApprovals - User company ID:', companyId);
    console.log('getPendingApprovals - User:', req.user.email, req.user.userType);
    console.log('getPendingApprovals - User ID:', req.user.id, 'Type:', typeof req.user.id);

    // Build query - only get responses with status 'Pending_Approval' for surveys belonging to this company
    let query = { 
      status: 'Pending_Approval'
    };

    // If quality agent, first get the surveys they're assigned to and filter responses by those surveys
    let assignedSurveyIds = null;
    let surveyAssignmentsMap = {}; // Map to store AC assignments for each survey
    if (userType === 'quality_agent') {
      const Survey = require('../models/Survey');
      const mongoose = require('mongoose');
      
      // Convert userId to ObjectId for proper matching
      const userIdObjectId = mongoose.Types.ObjectId.isValid(userId) 
        ? new mongoose.Types.ObjectId(userId) 
        : userId;
      
      console.log('getPendingApprovals - Querying surveys for quality agent:', {
        userId: userId,
        userIdObjectId: userIdObjectId,
        companyId: companyId
      });
      
      // Query surveys where this quality agent is assigned
      // Try both ObjectId and string matching
      const assignedSurveys = await Survey.find({
        company: companyId,
        'assignedQualityAgents.qualityAgent': { $in: [userIdObjectId, userId] }
      })
      .select('_id surveyName assignedQualityAgents')
      .lean();
      
      console.log('getPendingApprovals - Found assigned surveys:', assignedSurveys.length);
      console.log('getPendingApprovals - Survey IDs:', assignedSurveys.map(s => s._id.toString()));
      
      // Build a map of survey assignments for quick lookup
      assignedSurveys.forEach(survey => {
        // Find the assignment for this quality agent
        const agentAssignment = survey.assignedQualityAgents.find(a => {
          if (!a.qualityAgent) return false;
          
          // Handle both ObjectId and string formats
          const agentId = a.qualityAgent._id || a.qualityAgent;
          const agentIdStr = agentId?.toString();
          const userIdStr = userId?.toString();
          
          return agentIdStr === userIdStr;
        });
        
        if (agentAssignment) {
          surveyAssignmentsMap[survey._id.toString()] = {
            assignedACs: agentAssignment.assignedACs || [],
            selectedState: agentAssignment.selectedState,
            selectedCountry: agentAssignment.selectedCountry
          };
          
          console.log('getPendingApprovals - Survey assignment map entry:', {
            surveyId: survey._id.toString(),
            surveyName: survey.surveyName,
            assignedACs: agentAssignment.assignedACs,
            assignedACsRaw: JSON.stringify(agentAssignment.assignedACs),
            assignedACsLength: (agentAssignment.assignedACs || []).length,
            assignedACsType: typeof agentAssignment.assignedACs,
            isArray: Array.isArray(agentAssignment.assignedACs)
          });
        } else {
          console.log('getPendingApprovals - WARNING: No assignment found for quality agent in survey:', survey._id.toString());
          console.log('getPendingApprovals - Available assignments:', survey.assignedQualityAgents.map(a => ({
            qualityAgentId: (a.qualityAgent?._id || a.qualityAgent)?.toString(),
            assignedACs: a.assignedACs
          })));
        }
      });
      
      assignedSurveyIds = assignedSurveys.map(s => s._id);
      console.log('getPendingApprovals - Quality agent assigned survey IDs:', assignedSurveyIds);
      console.log('getPendingApprovals - Survey assignments map keys:', Object.keys(surveyAssignmentsMap));
      
      if (assignedSurveyIds.length === 0) {
        console.log('getPendingApprovals - Quality agent has no assigned surveys, returning empty');
        return res.status(200).json({
          success: true,
          data: {
            interviews: [],
            total: 0
          }
        });
      }
      
      // Filter responses to only those surveys
      query.survey = { $in: assignedSurveyIds };
      console.log('getPendingApprovals - Query for responses:', JSON.stringify(query, null, 2));
      
      // Check how many pending responses exist for these surveys
      const pendingCount = await SurveyResponse.countDocuments(query);
      console.log('getPendingApprovals - Total pending responses for assigned surveys:', pendingCount);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Find pending approval responses with populated survey data
    let interviews = await SurveyResponse.find(query)
      .populate({
        path: 'survey',
        select: 'surveyName description category sections company assignedQualityAgents',
        ...(userType !== 'quality_agent' ? { match: { company: companyId } } : {}), // Only filter by company if not quality agent (we already filtered by survey IDs)
        populate: {
          path: 'assignedQualityAgents.qualityAgent',
          select: 'firstName lastName email _id'
        }
      })
      .sort(sort)
      .lean();
    
    console.log('getPendingApprovals - Found interviews before filtering:', interviews.length);
    console.log('getPendingApprovals - Interview survey IDs:', interviews.map(i => i.survey?._id?.toString() || i.survey?.toString() || 'null').filter((v, i, a) => a.indexOf(v) === i));
    console.log('getPendingApprovals - Raw interviews data:', interviews.map(i => ({
      id: i._id,
      responseId: i.responseId,
      status: i.status,
      surveyId: i.survey?._id || i.survey,
      surveyName: i.survey?.surveyName,
      hasSurvey: !!i.survey,
      createdAt: i.createdAt
    })));

    // Filter out responses where survey is null (doesn't belong to company)
    const beforeNullFilter = interviews.length;
    interviews = interviews.filter(interview => interview.survey !== null);
    console.log('getPendingApprovals - After null survey filter:', interviews.length, '(removed', beforeNullFilter - interviews.length, 'responses with null survey)');
    
    // Debug: Log the structure of assignedQualityAgents to see if assignedACs is included
    if (interviews.length > 0 && interviews[0].survey && interviews[0].survey.assignedQualityAgents) {
      console.log('getPendingApprovals - Sample assignedQualityAgents structure:', 
        JSON.stringify(interviews[0].survey.assignedQualityAgents[0], null, 2));
    }
    
    // If user is a quality agent, filter by AC assignments if any
    if (userType === 'quality_agent') {
      console.log('getPendingApprovals - Quality agent filtering, total interviews before filter:', interviews.length);
      console.log('getPendingApprovals - Survey assignments map:', JSON.stringify(surveyAssignmentsMap, null, 2));
      
      interviews = interviews.filter(interview => {
        const survey = interview.survey;
        if (!survey || !survey._id) {
          console.log('getPendingApprovals - Interview filtered out: no survey');
          return false;
        }
        
        const surveyId = survey._id.toString();
        const assignment = surveyAssignmentsMap[surveyId];
        
        if (!assignment) {
          console.log('getPendingApprovals - Interview filtered out: no assignment found for survey', surveyId);
          return false;
        }
        
        // Simple check: if assignedACs array has more than 0 elements, ACs are assigned
        const assignedACs = assignment.assignedACs || [];
        const acsCount = Array.isArray(assignedACs) ? assignedACs.length : 0;
        const hasAssignedACs = acsCount > 0;
        
        console.log('getPendingApprovals - AC check for response:', {
          responseId: interview.responseId,
          surveyId: surveyId,
          surveyName: survey.surveyName,
          assignedACs: assignedACs,
          acsCount: acsCount,
          hasAssignedACs: hasAssignedACs,
          interviewSelectedAC: interview.selectedAC
        });
        
        // If ACs are assigned (count > 0), filter by AC
        if (hasAssignedACs) {
          // Only show responses from the assigned ACs
          if (interview.selectedAC && assignedACs.includes(interview.selectedAC)) {
            console.log('getPendingApprovals - ✅ INCLUDING response: AC matches');
            return true;
          }
          // Response doesn't have selectedAC or AC doesn't match, exclude it
          console.log('getPendingApprovals - ❌ EXCLUDING response: AC mismatch or missing');
          return false;
        }
        
        // No ACs assigned (count = 0) - show ALL responses for this survey
        console.log('getPendingApprovals - ✅ INCLUDING response: No ACs assigned (count = 0), showing all');
        return true;
      });
      console.log('getPendingApprovals - Quality agent filtering complete, interviews after filter:', interviews.length);
    }
    
    console.log('getPendingApprovals - After company filtering:', interviews.length);

    // Apply client-side filtering for search, gender, and age
    let filteredInterviews = interviews;

    if (search) {
      const searchLower = search.toLowerCase();
      filteredInterviews = filteredInterviews.filter(interview => {
        // Search in survey name, response ID, session ID, and respondent name
        const respondentName = getRespondentName(interview.responses);
        return (
          interview.survey?.surveyName?.toLowerCase().includes(searchLower) ||
          interview.responseId?.toString().includes(search) ||
          interview.sessionId?.toLowerCase().includes(searchLower) ||
          respondentName.toLowerCase().includes(searchLower)
        );
      });
    }

    if (gender) {
      filteredInterviews = filteredInterviews.filter(interview => {
        const respondentGender = getRespondentGender(interview.responses);
        return respondentGender.toLowerCase() === gender.toLowerCase();
      });
    }

    if (ageMin || ageMax) {
      filteredInterviews = filteredInterviews.filter(interview => {
        const age = getRespondentAge(interview.responses);
        if (!age) return false;
        if (ageMin && age < parseInt(ageMin)) return false;
        if (ageMax && age > parseInt(ageMax)) return false;
        return true;
      });
    }

    // Helper functions to extract respondent info
    function getRespondentName(responses) {
      const nameResponse = responses.find(r => 
        r.questionText.toLowerCase().includes('name') || 
        r.questionText.toLowerCase().includes('respondent')
      );
      return nameResponse?.response || 'Not Available';
    }

    function getRespondentGender(responses) {
      const genderResponse = responses.find(r => 
        r.questionText.toLowerCase().includes('gender') || 
        r.questionText.toLowerCase().includes('sex')
      );
      return genderResponse?.response || 'Not Available';
    }

    function getRespondentAge(responses) {
      const ageResponse = responses.find(r => 
        r.questionText.toLowerCase().includes('age') || 
        r.questionText.toLowerCase().includes('year')
      );
      if (!ageResponse?.response) return null;
      const ageMatch = ageResponse.response.toString().match(/\d+/);
      return ageMatch ? parseInt(ageMatch[0]) : null;
    }

    // Helper functions for conditional logic evaluation (same as getMyInterviews)
    function evaluateCondition(condition, responses) {
      if (!condition.questionId || !condition.operator || condition.value === undefined || condition.value === '__NOVALUE__') {
        return false;
      }

      const targetResponse = responses.find(response => {
        return response.questionId === condition.questionId || 
               response.questionText === condition.questionText;
      });

      if (!targetResponse || !targetResponse.response) {
        return false;
      }

      const responseValue = targetResponse.response;
      const conditionValue = condition.value;

      switch (condition.operator) {
        case 'equals':
          return responseValue === conditionValue;
        case 'not_equals':
          return responseValue !== conditionValue;
        case 'contains':
          return responseValue.toString().toLowerCase().includes(conditionValue.toString().toLowerCase());
        case 'not_contains':
          return !responseValue.toString().toLowerCase().includes(conditionValue.toString().toLowerCase());
        case 'greater_than':
          return parseFloat(responseValue) > parseFloat(conditionValue);
        case 'less_than':
          return parseFloat(responseValue) < parseFloat(conditionValue);
        case 'is_empty':
          return !responseValue || responseValue.toString().trim() === '';
        case 'is_not_empty':
          return responseValue && responseValue.toString().trim() !== '';
        case 'is_selected':
          return responseValue === conditionValue;
        case 'is_not_selected':
          return responseValue !== conditionValue;
        default:
          return false;
      }
    }

    function areConditionsMet(conditions, responses) {
      if (!conditions || conditions.length === 0) return true;
      return conditions.every(condition => evaluateCondition(condition, responses));
    }

    function findQuestionByText(questionText, survey) {
      if (survey?.sections) {
        for (const section of survey.sections) {
          if (section.questions) {
            for (const question of section.questions) {
              if (question.text === questionText) {
                return question;
              }
            }
          }
        }
      }
      return null;
    }

    // Transform interviews to include calculated fields
    const transformedInterviews = filteredInterviews.map(interview => {
      // Calculate effective questions (only questions that were actually shown)
      const effectiveQuestions = interview.responses?.filter(r => {
        // If not skipped, it was shown and answered
        if (!r.isSkipped) return true;
        
        // If skipped, check if it was due to unmet conditions
        const surveyQuestion = findQuestionByText(r.questionText, interview.survey);
        const hasConditions = surveyQuestion?.conditions && surveyQuestion.conditions.length > 0;
        
        if (hasConditions) {
          // Check if conditions were met
          const conditionsMet = areConditionsMet(surveyQuestion.conditions, interview.responses);
          
          // If conditions were not met, this question was never shown
          if (!conditionsMet) {
            return false;
          }
        }
        
        // If no conditions or conditions were met, user saw it and chose to skip
        return true;
      }).length || 0;
      
      const answeredQuestions = interview.responses?.filter(r => !r.isSkipped).length || 0;
      const completionPercentage = effectiveQuestions > 0 ? Math.round((answeredQuestions / effectiveQuestions) * 100) : 0;

      return {
        ...interview,
        totalQuestions: effectiveQuestions, // Use effective questions instead of all responses
        answeredQuestions,
        completionPercentage
      };
    });

    res.status(200).json({
      success: true,
      data: {
        interviews: transformedInterviews,
        total: transformedInterviews.length
      }
    });

  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending approvals',
      error: error.message
    });
  }
};

// Submit survey response verification
const submitVerification = async (req, res) => {
  try {
    const { responseId, status, verificationCriteria, feedback } = req.body;
    const reviewerId = req.user.id;
    const companyId = req.user.company;

    console.log('submitVerification - Request data:', {
      responseId,
      status,
      verificationCriteria,
      feedback: feedback ? 'Provided' : 'Not provided',
      reviewerId,
      companyId
    });

    // Validate required fields
    if (!responseId || !status || !verificationCriteria) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: responseId, status, and verificationCriteria are required'
      });
    }

    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be either "approved" or "rejected"'
      });
    }

    // Find the survey response
    const surveyResponse = await SurveyResponse.findOne({ responseId })
      .populate('survey', 'company surveyName')
      .populate('interviewer', 'firstName lastName email');

    if (!surveyResponse) {
      return res.status(404).json({
        success: false,
        message: 'Survey response not found'
      });
    }

    // Verify the survey belongs to the reviewer's company
    if (surveyResponse.survey.company.toString() !== companyId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to verify this survey response'
      });
    }

    // Check if response is still pending approval
    if (surveyResponse.status !== 'Pending_Approval') {
      return res.status(400).json({
        success: false,
        message: 'This survey response has already been processed'
      });
    }

    // Update the survey response with verification data
    const updateData = {
      status: status === 'approved' ? 'Approved' : 'Rejected',
      verificationData: {
        reviewer: reviewerId,
        reviewedAt: new Date(),
        criteria: verificationCriteria,
        feedback: feedback || '',
        audioQuality: verificationCriteria.audioQuality,
        questionAccuracy: verificationCriteria.questionAccuracy,
        dataAccuracy: verificationCriteria.dataAccuracy,
        locationMatch: verificationCriteria.locationMatch
      }
    };

    const updatedResponse = await SurveyResponse.findByIdAndUpdate(
      surveyResponse._id,
      updateData,
      { new: true }
    ).populate('interviewer', 'firstName lastName email');

    console.log('submitVerification - Updated response:', {
      id: updatedResponse._id,
      responseId: updatedResponse.responseId,
      status: updatedResponse.status,
      interviewer: updatedResponse.interviewer?.email
    });

    res.status(200).json({
      success: true,
      message: `Survey response ${status} successfully`,
      data: {
        responseId: updatedResponse.responseId,
        status: updatedResponse.status,
        verificationData: updatedResponse.verificationData
      }
    });

  } catch (error) {
    console.error('Submit verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Debug endpoint to check all survey responses for a company
const debugSurveyResponses = async (req, res) => {
  try {
    const companyId = req.user.company;
    
    console.log('debugSurveyResponses - Company ID:', companyId);
    
    // Get all survey responses that belong to surveys from this company
    const allResponses = await SurveyResponse.find({})
      .populate({
        path: 'survey',
        select: 'surveyName company',
        populate: {
          path: 'company',
          select: '_id'
        }
      })
      .lean();
    
    // Filter responses that belong to this company
    const companyResponses = allResponses.filter(response => 
      response.survey && 
      response.survey.company && 
      response.survey.company._id.toString() === companyId.toString()
    );
    
    console.log('debugSurveyResponses - All responses for company:', companyResponses.map(r => ({
      id: r._id,
      responseId: r.responseId,
      status: r.status,
      surveyName: r.survey?.surveyName,
      surveyCompany: r.survey?.company?._id,
      userCompany: companyId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    })));
    
    // Group by status
    const statusCounts = companyResponses.reduce((acc, response) => {
      acc[response.status] = (acc[response.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('debugSurveyResponses - Status counts:', statusCounts);
    
    res.status(200).json({
      success: true,
      data: {
        totalResponses: companyResponses.length,
        statusCounts,
        responses: companyResponses.map(r => ({
          id: r._id,
          responseId: r.responseId,
          status: r.status,
          surveyName: r.survey?.surveyName,
          surveyCompany: r.survey?.company?._id,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        }))
      }
    });
    
  } catch (error) {
    console.error('debugSurveyResponses error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get survey response details by ID
const getSurveyResponseById = async (req, res) => {
  try {
    const { responseId } = req.params;
    const interviewerId = req.user.id;

    // Find the survey response
    const surveyResponse = await SurveyResponse.findById(responseId)
      .populate('survey', 'surveyName description status')
      .populate('interviewer', 'name email')
      .populate('session', 'sessionId status startTime endTime');

    if (!surveyResponse) {
      return res.status(404).json({
        success: false,
        message: 'Survey response not found'
      });
    }

    // Check if the interviewer has access to this response
    if (surveyResponse.interviewer._id.toString() !== interviewerId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this survey response'
      });
    }

    res.json({
      success: true,
      interview: surveyResponse
    });
  } catch (error) {
    console.error('Error fetching survey response:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get survey responses for View Responses modal
const getSurveyResponses = async (req, res) => {
  try {
    const { surveyId } = req.params;
    const { page = 1, limit = 10, status = 'Approved', gender, ageMin, ageMax, ac, city, district, lokSabha } = req.query;
    
    // Build filter object
    const filter = { survey: surveyId };
    
    if (status) {
      filter.status = status;
    }
    
    if (gender) {
      filter['responses.gender'] = gender;
    }
    
    if (ageMin || ageMax) {
      filter['responses.age'] = {};
      if (ageMin) filter['responses.age'].$gte = parseInt(ageMin);
      if (ageMax) filter['responses.age'].$lte = parseInt(ageMax);
    }
    
    if (ac) {
      filter['responses.assemblyConstituency'] = ac;
    }
    
    if (city) {
      filter['responses.city'] = new RegExp(city, 'i');
    }
    
    if (district) {
      filter['responses.district'] = new RegExp(district, 'i');
    }
    
    if (lokSabha) {
      filter['responses.lokSabha'] = new RegExp(lokSabha, 'i');
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get responses with pagination
    const responses = await SurveyResponse.find(filter)
      .populate('interviewer', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalResponses = await SurveyResponse.countDocuments(filter);
    
    // Get filter options for dropdowns
    const genderOptions = await SurveyResponse.distinct('responses.gender', { survey: surveyId, status: 'Approved' });
    const ageOptions = await SurveyResponse.distinct('responses.age', { survey: surveyId, status: 'Approved' });
    const acOptions = await SurveyResponse.distinct('responses.assemblyConstituency', { survey: surveyId, status: 'Approved' });
    const cityOptions = await SurveyResponse.distinct('responses.city', { survey: surveyId, status: 'Approved' });
    const districtOptions = await SurveyResponse.distinct('responses.district', { survey: surveyId, status: 'Approved' });
    const lokSabhaOptions = await SurveyResponse.distinct('responses.lokSabha', { survey: surveyId, status: 'Approved' });
    
    res.json({
      success: true,
      data: {
        responses,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalResponses / parseInt(limit)),
          totalResponses,
          hasNext: skip + responses.length < totalResponses,
          hasPrev: parseInt(page) > 1
        },
        filterOptions: {
          gender: genderOptions.filter(Boolean),
          age: ageOptions.filter(Boolean).sort((a, b) => a - b),
          ac: acOptions.filter(Boolean),
          city: cityOptions.filter(Boolean),
          district: districtOptions.filter(Boolean),
          lokSabha: lokSabhaOptions.filter(Boolean)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching survey responses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch survey responses',
      error: error.message
    });
  }
};

// Approve survey response
const approveSurveyResponse = async (req, res) => {
  try {
    const { responseId } = req.params;
    
    const response = await SurveyResponse.findByIdAndUpdate(
      responseId,
      { 
        status: 'Approved',
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Survey response not found'
      });
    }

    res.json({
      success: true,
      message: 'Survey response approved successfully',
      data: response
    });
  } catch (error) {
    console.error('Error approving survey response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve survey response',
      error: error.message
    });
  }
};

// Reject survey response
const rejectSurveyResponse = async (req, res) => {
  try {
    const { responseId } = req.params;
    const { reason, feedback } = req.body;
    
    const response = await SurveyResponse.findByIdAndUpdate(
      responseId,
      { 
        status: 'Rejected',
        'verificationData.feedback': feedback || reason,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Survey response not found'
      });
    }

    res.json({
      success: true,
      message: 'Survey response rejected successfully',
      data: response
    });
  } catch (error) {
    console.error('Error rejecting survey response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject survey response',
      error: error.message
    });
  }
};

module.exports = {
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
};