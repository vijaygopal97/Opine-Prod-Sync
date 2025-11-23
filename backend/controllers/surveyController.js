const Survey = require('../models/Survey');
const User = require('../models/User');
const Company = require('../models/Company');
const SurveyResponse = require('../models/SurveyResponse');
const CatiCall = require('../models/CatiCall');
const CatiRespondentQueue = require('../models/CatiRespondentQueue');
const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');

// @desc    Create a new survey
// @route   POST /api/surveys
// @access  Private (Company Admin, Project Manager)
exports.createSurvey = async (req, res) => {
  try {
    const {
      surveyName,
      description,
      category,
      purpose,
      mode,
      includeGigWorkers,
      startDate,
      deadline,
      sampleSize,
      targetAudience,
      thresholdInterviewsPerDay,
      maxInterviewsPerInterviewer,
      onlineContactMode,
      contactList,
      assignedInterviewers,
      sections,
      templateUsed,
      settings,
      notifications,
      status,
      assignACs,
      acAssignmentCountry,
      acAssignmentState,
      modes,
      modeAllocation,
      modeQuotas,
      modeGigWorkers,
      respondentContacts
    } = req.body;

    console.log('🔍 Backend received mode:', mode, 'type:', typeof mode);
    console.log('🔍 Backend received modes:', modes, 'type:', typeof modes);
    console.log('🔍 Backend received modeAllocation:', modeAllocation, 'type:', typeof modeAllocation);

    // Get current user and their company
    const currentUser = await User.findById(req.user.id).populate('company');
    if (!currentUser || !currentUser.company) {
      return res.status(400).json({
        success: false,
        message: 'User not associated with any company'
      });
    }

    // Validate required fields
    if (!surveyName || !description || !category || !purpose || !mode || !startDate || !deadline || !sampleSize) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(deadline);
    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'Deadline must be after start date'
      });
    }

    // Clean targetAudience data to handle new structure
    const cleanTargetAudience = (targetAudience) => {
      console.log('🔍 Backend received targetAudience:', JSON.stringify(targetAudience, null, 2));
      
      if (!targetAudience) {
        return {
          demographics: {},
          geographic: {},
          behavioral: {},
          psychographic: {},
          custom: '',
          quotaManagement: false
        };
      }

      // Handle the new structure where each category is an object with boolean flags and requirements
      const cleaned = {
        demographics: targetAudience.demographics || {},
        geographic: targetAudience.geographic || {},
        behavioral: targetAudience.behavioral || {},
        psychographic: targetAudience.psychographic || {},
        custom: targetAudience.custom || '',
        quotaManagement: targetAudience.quotaManagement || false
      };
      
      console.log('🔍 Backend cleaned targetAudience:', JSON.stringify(cleaned, null, 2));
      return cleaned;
    };

    // Create survey data object
    const surveyData = {
      surveyName,
      description,
      category,
      purpose,
      mode,
      modes: modes || [],
      modeAllocation: modeAllocation || {},
      modeQuotas: modeQuotas || {},
      modeGigWorkers: modeGigWorkers || {},
      includeGigWorkers: includeGigWorkers || false,
      startDate: start,
      deadline: end,
      sampleSize: parseInt(sampleSize),
      targetAudience: cleanTargetAudience(targetAudience),
      thresholdInterviewsPerDay: thresholdInterviewsPerDay ? parseInt(thresholdInterviewsPerDay) : undefined,
      maxInterviewsPerInterviewer: maxInterviewsPerInterviewer ? parseInt(maxInterviewsPerInterviewer) : undefined,
      onlineContactMode: onlineContactMode || [],
      contactList: contactList || [],
      sections: (() => {
        // Debug: Log sections with settings when receiving
        if (sections && Array.isArray(sections)) {
          sections.forEach((section, sectionIdx) => {
            if (section.questions && Array.isArray(section.questions)) {
              section.questions.forEach((question, questionIdx) => {
                if (question.type === 'multiple_choice' && question.settings) {
                  console.log('🔍 Backend received question with settings:', {
                    sectionIndex: sectionIdx,
                    questionIndex: questionIdx,
                    questionId: question.id,
                    questionText: question.text,
                    settings: question.settings
                  });
                }
              });
            }
          });
        }
        return sections || [];
      })(),
      templateUsed: templateUsed || {},
      settings: settings || {},
      notifications: notifications || {},
      company: currentUser.company._id,
      createdBy: currentUser._id,
      lastModifiedBy: currentUser._id,
      status: status || 'draft', // Use provided status or default to draft
      assignACs: assignACs || false,
      acAssignmentCountry: acAssignmentCountry || '',
      acAssignmentState: acAssignmentState || '',
      respondentContacts: respondentContacts || []
    };

    // Create the survey
    const survey = new Survey(surveyData);
    await survey.save();

    // Populate the created survey
    const populatedSurvey = await Survey.findById(survey._id)
      .populate('company', 'companyName companyCode')
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedInterviewers.interviewer', 'firstName lastName email userType')
      .populate('assignedQualityAgents.qualityAgent', 'firstName lastName email userType');

    res.status(201).json({
      success: true,
      message: 'Survey created successfully',
      data: { survey: populatedSurvey }
    });

  } catch (error) {
    console.error('Create survey error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Get all surveys for a company
// @route   GET /api/surveys
// @access  Private (Company Admin, Project Manager)
exports.getSurveys = async (req, res) => {
  try {
    console.log('🚀 getSurveys function called');
    const { status, mode, search, category, page = 1, limit = 10 } = req.query;
    
    console.log('getSurveys - Query parameters:', { status, mode, search, category, page, limit });

    // Get current user and their company
    const currentUser = await User.findById(req.user.id).populate('company');
    if (!currentUser || !currentUser.company) {
      return res.status(400).json({
        success: false,
        message: 'User not associated with any company'
      });
    }

    // Build query
    const query = { company: currentUser.company._id };
    if (status) query.status = status;
    if (mode) query.mode = mode;
    if (category) query.category = category;
    
    // Add search functionality
    if (search) {
      query.$and = [
        { company: currentUser.company._id },
        {
          $or: [
            { surveyName: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ]
        }
      ];
      // Remove the company filter from the main query since it's now in $and
      delete query.company;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log('getSurveys - Final query:', JSON.stringify(query, null, 2));
    console.log('getSurveys - Pagination:', { skip, limit: parseInt(limit) });

    // Get surveys with pagination
    const surveys = await Survey.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedInterviewers.interviewer', 'firstName lastName email userType')
      .populate('capiInterviewers.interviewer', 'firstName lastName email userType')
      .populate('catiInterviewers.interviewer', 'firstName lastName email userType')
      .populate('assignedQualityAgents.qualityAgent', 'firstName lastName email userType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Survey.countDocuments(query);

    console.log(`🔍 Found ${surveys.length} surveys to process`);
    console.log(`🔍 Survey names:`, surveys.map(s => s.surveyName));

    // Calculate analytics for each survey
    console.log(`🔍 Starting analytics calculation for ${surveys.length} surveys`);
    const surveysWithAnalytics = await Promise.all(surveys.map(async (survey) => {
      console.log(`📊 Calculating analytics for: ${survey.surveyName} (ID: ${survey._id})`);
      
      // Get approved survey responses count
      const approvedResponses = await SurveyResponse.countDocuments({
        survey: survey._id,
        status: 'Approved'
      });
      
      // Also check what statuses actually exist
      const allResponses = await SurveyResponse.find({ survey: survey._id });
      const statusCounts = {};
      allResponses.forEach(r => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      });
      
      console.log(`✅ Found ${approvedResponses} approved responses for ${survey.surveyName}`);
      console.log(`📊 All status counts for ${survey.surveyName}:`, statusCounts);


      // Calculate completion percentage
      const sampleSize = survey.sampleSize || 0;
      const completionRate = sampleSize > 0 ? Math.round((approvedResponses / sampleSize) * 100) : 0;

      // Count assigned interviewers (handle both single-mode and multi-mode)
      let assignedInterviewersCount = 0;
      if (survey.assignedInterviewers && survey.assignedInterviewers.length > 0) {
        assignedInterviewersCount = survey.assignedInterviewers.length;
      } else if (survey.capiInterviewers && survey.catiInterviewers) {
        // For multi-mode surveys, count unique interviewers from both arrays
        const capiInterviewerIds = survey.capiInterviewers.map(a => a.interviewer._id.toString());
        const catiInterviewerIds = survey.catiInterviewers.map(a => a.interviewer._id.toString());
        const uniqueInterviewerIds = new Set([...capiInterviewerIds, ...catiInterviewerIds]);
        assignedInterviewersCount = uniqueInterviewerIds.size;
      }

      return {
        ...survey.toObject(),
        analytics: {
          totalResponses: approvedResponses,
          completionRate: completionRate,
          assignedInterviewersCount: assignedInterviewersCount
        }
      };
    }));

    // Debug: Log the analytics data being sent
    console.log('📊 Analytics data being sent to frontend:');
    surveysWithAnalytics.forEach(survey => {
      console.log(`  ${survey.surveyName}:`, {
        approvedResponses: survey.analytics?.totalResponses,
        completionRate: survey.analytics?.completionRate,
        assignedInterviewersCount: survey.analytics?.assignedInterviewersCount
      });
    });

    res.status(200).json({
      success: true,
      message: 'Surveys retrieved successfully',
      data: {
        surveys: surveysWithAnalytics,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get surveys error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Get a single survey
// @route   GET /api/surveys/:id
// @access  Private (Company Admin, Project Manager, Interviewer)
exports.getSurvey = async (req, res) => {
  try {
    const { id } = req.params;

    // Get current user and their company
    const currentUser = await User.findById(req.user.id).populate('company');
    if (!currentUser || !currentUser.company) {
      return res.status(400).json({
        success: false,
        message: 'User not associated with any company'
      });
    }

    // Find survey
    const survey = await Survey.findById(id)
      .populate('company', 'companyName companyCode')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email')
      .populate('assignedInterviewers.interviewer', 'firstName lastName email userType phone')
      .populate('assignedInterviewers.assignedBy', 'firstName lastName email')
      .populate('assignedQualityAgents.qualityAgent', 'firstName lastName email userType phone')
      .populate('assignedQualityAgents.assignedBy', 'firstName lastName email');

    if (!survey) {
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    // Check if user has access to this survey
    if (survey.company._id.toString() !== currentUser.company._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view surveys from your company.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Survey retrieved successfully',
      data: { survey }
    });

  } catch (error) {
    console.error('Get survey error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};


// @desc    Delete a survey
// @route   DELETE /api/surveys/:id
// @access  Private (Company Admin, Project Manager)
exports.deleteSurvey = async (req, res) => {
  try {
    const { id } = req.params;

    // Get current user and their company
    const currentUser = await User.findById(req.user.id).populate('company');
    if (!currentUser || !currentUser.company) {
      return res.status(400).json({
        success: false,
        message: 'User not associated with any company'
      });
    }

    // Find survey
    const survey = await Survey.findById(id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    // Check if user has access to this survey
    if (survey.company.toString() !== currentUser.company._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete surveys from your company.'
      });
    }

    // Check if survey can be deleted (only draft and active surveys)
    if (survey.status !== 'draft' && survey.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only draft and active surveys can be deleted'
      });
    }

    // Delete the survey
    await Survey.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Survey deleted successfully'
    });

  } catch (error) {
    console.error('Delete survey error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Publish a survey
// @route   POST /api/surveys/:id/publish
// @access  Private (Company Admin, Project Manager)
exports.publishSurvey = async (req, res) => {
  try {
    const { id } = req.params;

    // Get current user and their company
    const currentUser = await User.findById(req.user.id).populate('company');
    if (!currentUser || !currentUser.company) {
      return res.status(400).json({
        success: false,
        message: 'User not associated with any company'
      });
    }

    // Find survey
    const survey = await Survey.findById(id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    // Check if user has access to this survey
    if (survey.company.toString() !== currentUser.company._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only publish surveys from your company.'
      });
    }

    // Check if survey can be published
    if (survey.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft surveys can be published'
      });
    }

    // Validate required fields for publishing
    if (!survey.sections || survey.sections.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Survey must have at least one section with questions to be published'
      });
    }

    // Update survey status and publish date
    survey.status = 'active';
    survey.publishedAt = new Date();
    survey.lastModifiedBy = currentUser._id;
    await survey.save();

    // Populate the updated survey
    const publishedSurvey = await Survey.findById(survey._id)
      .populate('company', 'companyName companyCode')
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedInterviewers.interviewer', 'firstName lastName email userType');

    res.status(200).json({
      success: true,
      message: 'Survey published successfully',
      data: { survey: publishedSurvey }
    });

  } catch (error) {
    console.error('Publish survey error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Assign interviewers to survey
// @route   POST /api/surveys/:id/assign-interviewers
// @access  Private (Company Admin, Project Manager)
exports.assignInterviewers = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      interviewerIds, 
      maxInterviews, 
      interviewerACAssignments, 
      interviewerStateAssignments, 
      interviewerCountryAssignments,
      capiInterviewerIds,
      catiInterviewerIds,
      capiACAssignments,
      catiACAssignments,
      capiStateAssignments,
      catiStateAssignments,
      capiCountryAssignments,
      catiCountryAssignments
    } = req.body;

    // Get current user and their company
    const currentUser = await User.findById(req.user.id).populate('company');
    if (!currentUser || !currentUser.company) {
      return res.status(400).json({
        success: false,
        message: 'User not associated with any company'
      });
    }

    // Find survey
    const survey = await Survey.findById(id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    // Check if user has access to this survey
    if (survey.company.toString() !== currentUser.company._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only assign interviewers to surveys from your company.'
      });
    }

    // Check if this is a multi-mode survey
    const isMultiMode = survey.mode === 'multi_mode' || (survey.modes && survey.modes.length > 1);
    
    // Validate interviewer IDs based on survey mode
    if (isMultiMode) {
      // For multi-mode surveys, we need either capiInterviewerIds or catiInterviewerIds
      if ((!capiInterviewerIds || !Array.isArray(capiInterviewerIds) || capiInterviewerIds.length === 0) &&
          (!catiInterviewerIds || !Array.isArray(catiInterviewerIds) || catiInterviewerIds.length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'CAPI or CATI interviewer IDs are required for multi-mode surveys'
        });
      }
    } else {
      // For single-mode surveys, use the original logic
      if (!interviewerIds || !Array.isArray(interviewerIds) || interviewerIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Interviewer IDs are required'
        });
      }
    }

    if (isMultiMode) {
      // Handle multi-mode assignments
      const capiAssignments = [];
      const catiAssignments = [];
      
      // Process CAPI interviewers
      if (capiInterviewerIds && capiInterviewerIds.length > 0) {
        const capiInterviewers = await User.find({
          _id: { $in: capiInterviewerIds },
          company: currentUser.company._id,
          userType: 'interviewer',
          status: 'active'
        });

        if (capiInterviewers.length !== capiInterviewerIds.length) {
          return res.status(400).json({
            success: false,
            message: 'Some CAPI interviewers not found or not available'
          });
        }

        capiAssignments.push(...capiInterviewerIds.map(interviewerId => {
          const assignment = {
            interviewer: interviewerId,
            assignedBy: currentUser._id,
            maxInterviews: maxInterviews || 0,
            status: 'assigned'
          };
          
          // Add AC assignments only if assignACs is true and AC assignments are provided
          if (survey.assignACs && capiACAssignments && capiACAssignments[interviewerId]) {
            assignment.assignedACs = capiACAssignments[interviewerId];
          }
          
          // Add state assignment if provided
          if (capiStateAssignments && capiStateAssignments[interviewerId]) {
            assignment.selectedState = capiStateAssignments[interviewerId];
          }
          
          // Add country assignment if provided
          if (capiCountryAssignments && capiCountryAssignments[interviewerId]) {
            assignment.selectedCountry = capiCountryAssignments[interviewerId];
          }
          
          return assignment;
        }));
      }
      
      // Process CATI interviewers
      if (catiInterviewerIds && catiInterviewerIds.length > 0) {
        const catiInterviewers = await User.find({
          _id: { $in: catiInterviewerIds },
          company: currentUser.company._id,
          userType: 'interviewer',
          status: 'active'
        });

        if (catiInterviewers.length !== catiInterviewerIds.length) {
          return res.status(400).json({
            success: false,
            message: 'Some CATI interviewers not found or not available'
          });
        }

        catiAssignments.push(...catiInterviewerIds.map(interviewerId => {
          const assignment = {
            interviewer: interviewerId,
            assignedBy: currentUser._id,
            maxInterviews: maxInterviews || 0,
            status: 'assigned'
          };
          
          // Add AC assignments only if assignACs is true and AC assignments are provided
          if (survey.assignACs && catiACAssignments && catiACAssignments[interviewerId]) {
            assignment.assignedACs = catiACAssignments[interviewerId];
          }
          
          // Add state assignment if provided
          if (catiStateAssignments && catiStateAssignments[interviewerId]) {
            assignment.selectedState = catiStateAssignments[interviewerId];
          }
          
          // Add country assignment if provided
          if (catiCountryAssignments && catiCountryAssignments[interviewerId]) {
            assignment.selectedCountry = catiCountryAssignments[interviewerId];
          }
          
          return assignment;
        }));
      }
      
      // Update survey with mode-specific assignments
      survey.capiInterviewers = capiAssignments;
      survey.catiInterviewers = catiAssignments;
      survey.lastModifiedBy = currentUser._id;
      await survey.save();
      
    } else {
      // Handle single-mode assignments (original logic)
      const interviewers = await User.find({
        _id: { $in: interviewerIds },
        company: currentUser.company._id,
        userType: 'interviewer',
        status: 'active'
      });

      if (interviewers.length !== interviewerIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some interviewers not found or not available'
        });
      }

      // Assign interviewers
      const assignments = interviewerIds.map(interviewerId => {
        const assignment = {
          interviewer: interviewerId,
          assignedBy: currentUser._id,
          maxInterviews: maxInterviews || 0,
          status: 'assigned'
        };
        
        // Add mode assignment if provided (for multi-mode surveys)
        if (req.body.interviewerModeAssignments && req.body.interviewerModeAssignments[interviewerId]) {
          assignment.assignedMode = req.body.interviewerModeAssignments[interviewerId];
        }
        
        // Add AC assignments only if assignACs is true and AC assignments are provided
        if (survey.assignACs && interviewerACAssignments && interviewerACAssignments[interviewerId]) {
          assignment.assignedACs = interviewerACAssignments[interviewerId];
        }
        
        // Add state assignment if provided
        if (interviewerStateAssignments && interviewerStateAssignments[interviewerId]) {
          assignment.selectedState = interviewerStateAssignments[interviewerId];
        }
        
        // Add country assignment if provided
        if (interviewerCountryAssignments && interviewerCountryAssignments[interviewerId]) {
          assignment.selectedCountry = interviewerCountryAssignments[interviewerId];
        }
        
        return assignment;
      });

      survey.assignedInterviewers = assignments;
      survey.lastModifiedBy = currentUser._id;
      await survey.save();
    }

    // Populate the updated survey based on mode
    let updatedSurvey;
    if (isMultiMode) {
      updatedSurvey = await Survey.findById(survey._id)
        .populate('capiInterviewers.interviewer', 'firstName lastName email userType phone')
        .populate('capiInterviewers.assignedBy', 'firstName lastName email')
        .populate('catiInterviewers.interviewer', 'firstName lastName email userType phone')
        .populate('catiInterviewers.assignedBy', 'firstName lastName email');
    } else {
      updatedSurvey = await Survey.findById(survey._id)
        .populate('assignedInterviewers.interviewer', 'firstName lastName email userType phone')
        .populate('assignedInterviewers.assignedBy', 'firstName lastName email');
    }

    res.status(200).json({
      success: true,
      message: 'Interviewers assigned successfully',
      data: { survey: updatedSurvey }
    });

  } catch (error) {
    console.error('Assign interviewers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Assign quality agents to a survey
// @route   POST /api/surveys/:id/assign-quality-agents
// @access  Private (Company Admin, Project Manager)
exports.assignQualityAgents = async (req, res) => {
  try {
    const { id } = req.params;
    const { qualityAgentIds, qualityAgentACAssignments, qualityAgentStateAssignments, qualityAgentCountryAssignments } = req.body;

    // Get current user and their company
    const currentUser = await User.findById(req.user.id).populate('company');
    if (!currentUser || !currentUser.company) {
      return res.status(400).json({
        success: false,
        message: 'User not associated with any company'
      });
    }

    // Find survey
    const survey = await Survey.findById(id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    // Check if user has access to this survey
    if (survey.company.toString() !== currentUser.company._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only assign quality agents to surveys from your company.'
      });
    }

    // Validate quality agent IDs
    if (!qualityAgentIds || !Array.isArray(qualityAgentIds) || qualityAgentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Quality agent IDs are required'
      });
    }

    // Check if quality agents exist and belong to the same company
    const qualityAgents = await User.find({
      _id: { $in: qualityAgentIds },
      company: currentUser.company._id,
      userType: 'quality_agent',
      status: 'active'
    });

    if (qualityAgents.length !== qualityAgentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some quality agents not found or not available'
      });
    }

    // Assign quality agents
    const assignments = qualityAgentIds.map(agentId => {
      const assignment = {
        qualityAgent: agentId,
        assignedBy: currentUser._id,
        status: 'assigned'
      };
      
      // Add AC assignments only if assignACs is true and AC assignments are provided
      if (survey.assignACs && qualityAgentACAssignments && qualityAgentACAssignments[agentId]) {
        assignment.assignedACs = qualityAgentACAssignments[agentId];
      }
      
      // Add state assignment if provided
      if (qualityAgentStateAssignments && qualityAgentStateAssignments[agentId]) {
        assignment.selectedState = qualityAgentStateAssignments[agentId];
      }
      
      // Add country assignment if provided
      if (qualityAgentCountryAssignments && qualityAgentCountryAssignments[agentId]) {
        assignment.selectedCountry = qualityAgentCountryAssignments[agentId];
      }
      
      return assignment;
    });

    survey.assignedQualityAgents = assignments;
    survey.lastModifiedBy = currentUser._id;
    await survey.save();

    // Populate the updated survey
    const updatedSurvey = await Survey.findById(survey._id)
      .populate('assignedQualityAgents.qualityAgent', 'firstName lastName email userType phone')
      .populate('assignedQualityAgents.assignedBy', 'firstName lastName email');

    res.status(200).json({
      success: true,
      message: 'Quality agents assigned successfully',
      data: { survey: updatedSurvey }
    });

  } catch (error) {
    console.error('Assign quality agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Get survey statistics
// @route   GET /api/surveys/stats
// @access  Private (Company Admin, Project Manager)
exports.getSurveyStats = async (req, res) => {
  try {
    // Get current user and their company
    const currentUser = await User.findById(req.user.id).populate('company');
    if (!currentUser || !currentUser.company) {
      return res.status(400).json({
        success: false,
        message: 'User not associated with any company'
      });
    }

    // Get statistics
    const stats = await Survey.getStats(currentUser.company._id);

    res.status(200).json({
      success: true,
      message: 'Survey statistics retrieved successfully',
      data: { stats }
    });

  } catch (error) {
    console.error('Get survey stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Update an existing survey
// @route   PUT /api/surveys/:id
// @access  Private (Company Admin, Project Manager)
exports.updateSurvey = async (req, res) => {
  try {
    const surveyId = req.params.id;
    const {
      surveyName,
      description,
      category,
      purpose,
      mode,
      includeGigWorkers,
      startDate,
      deadline,
      sampleSize,
      targetAudience,
      thresholdInterviewsPerDay,
      maxInterviewsPerInterviewer,
      onlineContactMode,
      contactList,
      assignedInterviewers,
      assignedQualityAgents,
      sections,
      templateUsed,
      settings,
      notifications,
      status,
      assignACs,
      acAssignmentCountry,
      acAssignmentState,
      modes,
      modeAllocation,
      modeQuotas,
      modeGigWorkers,
      respondentContacts
    } = req.body;

    // Find the survey
    const survey = await Survey.findById(surveyId);
    if (!survey) {
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    // Check if user has permission to update this survey
    const user = req.user;
    if (user.userType === 'company_admin' && survey.company.toString() !== user.company._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this survey'
      });
    }

    // Clean targetAudience data for update
    const cleanTargetAudience = (targetAudience) => {
      console.log('🔍 Backend received targetAudience for update:', JSON.stringify(targetAudience, null, 2));
      
      if (!targetAudience) {
        return {
          demographics: {},
          geographic: {},
          behavioral: {},
          psychographic: {},
          custom: '',
          quotaManagement: false
        };
      }

      // Handle the new structure where each category is an object with boolean flags and requirements
      const cleaned = {
        demographics: targetAudience.demographics || {},
        geographic: targetAudience.geographic || {},
        behavioral: targetAudience.behavioral || {},
        psychographic: targetAudience.psychographic || {},
        custom: targetAudience.custom || '',
        quotaManagement: targetAudience.quotaManagement || false
      };
      
      console.log('🔍 Backend cleaned targetAudience for update:', JSON.stringify(cleaned, null, 2));
      return cleaned;
    };

    // Process assignedInterviewers to handle status updates
    let processedAssignedInterviewers = assignedInterviewers;
    if (assignedInterviewers && Array.isArray(assignedInterviewers)) {
      processedAssignedInterviewers = assignedInterviewers.map(assignment => {
        const processedAssignment = { ...assignment };
        
        // If Company Admin is reassigning an interviewer, reset status to 'assigned'
        if (assignment.status === 'rejected' && assignment.interviewer) {
          processedAssignment.status = 'assigned';
          processedAssignment.assignedAt = new Date(); // Update assignment time
        }
        
        // If assignACs is false, explicitly set assignedACs to empty array to ensure it's removed
        // Using empty array instead of delete to ensure Mongoose properly updates the field
        if (assignACs === false) {
          processedAssignment.assignedACs = [];
        }
        
        return processedAssignment;
      });
    }

    // Process assignedQualityAgents to remove ACs if assignACs is false
    let processedAssignedQualityAgents = assignedQualityAgents || survey.assignedQualityAgents;
    if (processedAssignedQualityAgents && Array.isArray(processedAssignedQualityAgents)) {
      processedAssignedQualityAgents = processedAssignedQualityAgents.map(assignment => {
        const processedAssignment = { ...assignment };
        
        // If assignACs is false, explicitly set assignedACs to empty array to ensure it's removed
        // Using empty array instead of delete to ensure Mongoose properly updates the field
        if (assignACs === false) {
          processedAssignment.assignedACs = [];
        }
        
        return processedAssignment;
      });
    }

    // Prepare update data
    const updateData = {
      surveyName,
      description,
      category,
      purpose,
      mode,
      modes: modes || [],
      modeAllocation: modeAllocation || {},
      modeQuotas: modeQuotas || {},
      modeGigWorkers: modeGigWorkers || {},
      includeGigWorkers: includeGigWorkers || false,
      startDate,
      deadline,
      sampleSize,
      targetAudience: cleanTargetAudience(targetAudience),
      thresholdInterviewsPerDay,
      maxInterviewsPerInterviewer,
      onlineContactMode,
      contactList,
      assignedInterviewers: processedAssignedInterviewers,
      assignedQualityAgents: processedAssignedQualityAgents,
      sections: (() => {
        // Debug: Log sections with settings when updating
        if (sections && Array.isArray(sections)) {
          sections.forEach((section, sectionIdx) => {
            if (section.questions && Array.isArray(section.questions)) {
              section.questions.forEach((question, questionIdx) => {
                if (question.type === 'multiple_choice' && question.settings) {
                  console.log('🔍 Backend updating question with settings:', {
                    sectionIndex: sectionIdx,
                    questionIndex: questionIdx,
                    questionId: question.id,
                    questionText: question.text,
                    settings: question.settings
                  });
                }
              });
            }
          });
        }
        return sections;
      })(),
      templateUsed,
      settings,
      notifications,
      status,
      assignACs,
      acAssignmentCountry: assignACs ? acAssignmentCountry : '',
      acAssignmentState: assignACs ? acAssignmentState : '',
      respondentContacts: respondentContacts !== undefined ? respondentContacts : survey.respondentContacts,
      updatedAt: new Date()
    };

    // Update the survey
    const updatedSurvey = await Survey.findByIdAndUpdate(
      surveyId,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName email')
     .populate('company', 'companyName companyCode')
     .populate('assignedInterviewers.interviewer', 'firstName lastName email phone')
     .populate('assignedQualityAgents.qualityAgent', 'firstName lastName email phone');

    res.status(200).json({
      success: true,
      message: 'Survey updated successfully',
      data: {
        survey: updatedSurvey
      }
    });

  } catch (error) {
    console.error('Error updating survey:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Get available surveys for interviewer
// @route   GET /api/surveys/available
// @access  Private (Interviewer)
exports.getAvailableSurveys = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const { search, status, category, sortBy = 'assignedAt', sortOrder = 'desc' } = req.query;

    console.log('🔍 getAvailableSurveys - Current user ID:', currentUser._id);
    console.log('🔍 getAvailableSurveys - Query params:', { search, status, category, sortBy, sortOrder });

    // Build query to find surveys where the current user is assigned
    // Handle both single-mode (assignedInterviewers) and multi-mode (capiInterviewers, catiInterviewers) surveys
    const query = {
      $or: [
        { 'assignedInterviewers.interviewer': currentUser._id },
        { 'capiInterviewers.interviewer': currentUser._id },
        { 'catiInterviewers.interviewer': currentUser._id }
      ],
      status: { $in: ['active', 'draft'] } // Only show active or draft surveys
    };

    // Add search filter
    if (search) {
      query.$and = [
        {
          $or: [
            { 'assignedInterviewers.interviewer': currentUser._id },
            { 'capiInterviewers.interviewer': currentUser._id },
            { 'catiInterviewers.interviewer': currentUser._id }
          ]
        },
        {
          $or: [
            { surveyName: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } }
          ]
        }
      ];
      delete query.$or; // Remove the original $or since we're using $and now
    }

    // Add category filter
    if (category) {
      query.category = category;
    }

    // Build sort object
    let sort = {};
    if (sortBy === 'assignedAt') {
      // For assignedAt sorting, we'll handle this in the transformation since we have multiple possible assignment arrays
      sort.createdAt = sortOrder === 'asc' ? 1 : -1; // Fallback to createdAt
    } else if (sortBy === 'deadline') {
      sort.deadline = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'surveyName') {
      sort.surveyName = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort.createdAt = -1; // Default sort
    }

    console.log('🔍 getAvailableSurveys - Final query:', JSON.stringify(query, null, 2));

    const surveys = await Survey.find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort(sort)
      .lean();

    console.log('🔍 getAvailableSurveys - Found surveys:', surveys.length);
    if (surveys.length > 0) {
      console.log('🔍 getAvailableSurveys - First survey ID:', surveys[0]._id);
      console.log('🔍 getAvailableSurveys - First survey mode:', surveys[0].mode);
    }

    // Transform the data to include assignment-specific information
    const transformedSurveys = surveys.map(survey => {
      console.log(`🔍 Processing survey ${survey._id} (mode: ${survey.mode})`);
      let assignment = null;
      let assignedMode = null;

      // Check for single-mode assignment
      if (survey.assignedInterviewers && survey.assignedInterviewers.length > 0) {
        assignment = survey.assignedInterviewers.find(
          assignment => assignment.interviewer.toString() === currentUser._id.toString()
        );
        if (assignment) {
          assignedMode = assignment.assignedMode || 'single';
        }
      }

      // Check for multi-mode CAPI assignment
      if (!assignment && survey.capiInterviewers && survey.capiInterviewers.length > 0) {
        console.log(`🔍 Checking CAPI interviewers for survey ${survey._id}:`, survey.capiInterviewers.length);
        assignment = survey.capiInterviewers.find(
          assignment => assignment.interviewer.toString() === currentUser._id.toString()
        );
        if (assignment) {
          assignedMode = 'capi';
          console.log(`🔍 Found CAPI assignment for user ${currentUser._id}`);
        }
      }

      // Check for multi-mode CATI assignment
      if (!assignment && survey.catiInterviewers && survey.catiInterviewers.length > 0) {
        assignment = survey.catiInterviewers.find(
          assignment => assignment.interviewer.toString() === currentUser._id.toString()
        );
        if (assignment) {
          assignedMode = 'cati';
        }
      }

      return {
        ...survey,
        assignmentStatus: assignment ? assignment.status : 'assigned',
        assignedAt: assignment ? assignment.assignedAt : survey.createdAt,
        assignedACs: assignment ? assignment.assignedACs : [],
        selectedState: assignment ? assignment.selectedState : null,
        selectedCountry: assignment ? assignment.selectedCountry : null,
        maxInterviews: assignment ? assignment.maxInterviews : 0,
        completedInterviews: assignment ? assignment.completedInterviews : 0,
        assignedMode: assignedMode // Add the assigned mode for multi-mode surveys
      };
    });

    // Filter out surveys where the interviewer has rejected the assignment
    let filteredSurveys = transformedSurveys.filter(survey => 
      survey.assignmentStatus !== 'rejected'
    );
    
    if (status) {
      filteredSurveys = filteredSurveys.filter(survey => survey.assignmentStatus === status);
    }

    // Handle assignedAt sorting after transformation
    if (sortBy === 'assignedAt') {
      filteredSurveys.sort((a, b) => {
        const aDate = new Date(a.assignedAt);
        const bDate = new Date(b.assignedAt);
        return sortOrder === 'asc' ? aDate - bDate : bDate - aDate;
      });
    }

    res.json({
      success: true,
      data: {
        surveys: filteredSurveys,
        total: filteredSurveys.length
      }
    });

  } catch (error) {
    console.error('Error fetching available surveys:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Reject an interview assignment
// @route   POST /api/surveys/:id/reject-interview
// @access  Private (Interviewer)
exports.rejectInterview = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    // Find the assignment for this interviewer
    const assignment = survey.assignedInterviewers.find(
      assignment => assignment.interviewer.toString() === currentUser._id.toString()
    );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Interview assignment not found'
      });
    }

    // Check if already rejected or completed
    if (assignment.status === 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Interview has already been rejected'
      });
    }

    if (assignment.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject a completed interview'
      });
    }

    // Update the assignment status to rejected
    assignment.status = 'rejected';
    await survey.save();

    res.json({
      success: true,
      message: 'Interview rejected successfully',
      data: {
        surveyId: survey._id,
        assignmentStatus: 'rejected'
      }
    });

  } catch (error) {
    console.error('Error rejecting interview:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Debug endpoint to check survey responses
exports.debugSurveyResponses = async (req, res) => {
  try {
    const { surveyId } = req.params;
    
    // Get all responses for this survey
    const allResponses = await SurveyResponse.find({ survey: surveyId });
    
    // Group by status
    const statusCounts = {};
    allResponses.forEach(response => {
      statusCounts[response.status] = (statusCounts[response.status] || 0) + 1;
    });
    
    res.json({
      success: true,
      data: {
        surveyId,
        totalResponses: allResponses.length,
        statusCounts,
        responses: allResponses.map(r => ({
          id: r._id,
          status: r.status,
          interviewer: r.interviewer,
          createdAt: r.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Debug survey responses error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Configure multer for Excel file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/vnd.ms-excel.sheet.macroEnabled.12' // .xlsm
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  }
});

// @desc    Download Excel template for respondent contacts
// @route   GET /api/surveys/respondent-contacts/template
// @access  Private (Company Admin, Project Manager)
exports.downloadRespondentTemplate = async (req, res) => {
  try {
    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    
    // Define column headers - Country Code is optional and comes before Phone
    const headers = ['Name', 'Country Code', 'Phone', 'Email', 'Address', 'City', 'AC', 'PC', 'PS'];
    
    // Create worksheet with headers
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // Name
      { wch: 12 }, // Country Code
      { wch: 15 }, // Phone
      { wch: 30 }, // Email
      { wch: 40 }, // Address
      { wch: 20 }, // City
      { wch: 15 }, // AC
      { wch: 15 }, // PC
      { wch: 15 }  // PS
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Respondents');
    
    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="CATI_Respondent_Template.xlsx"');
    
    // Send file
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error generating Excel template:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating template',
      error: error.message
    });
  }
};

// @desc    Upload and parse Excel file with respondent contacts
// @route   POST /api/surveys/respondent-contacts/upload
// @access  Private (Company Admin, Project Manager)
exports.uploadRespondentContacts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON - use raw: true to preserve phone numbers as they are
    const data = XLSX.utils.sheet_to_json(worksheet, { 
      header: ['name', 'countryCode', 'phone', 'email', 'address', 'city', 'ac', 'pc', 'ps'],
      defval: '',
      raw: true  // Get raw values to preserve phone numbers exactly as entered
    });
    
    // Filter out header rows - check if row contains header values
    const headerValues = ['name', 'country code', 'phone', 'email', 'address', 'city', 'ac', 'pc', 'ps'];
    const filteredData = data.filter(row => {
      // Skip rows where name or phone matches header values (case-insensitive)
      const nameStr = row.name ? row.name.toString().toLowerCase().trim() : '';
      const phoneStr = row.phone ? row.phone.toString().toLowerCase().trim() : '';
      
      // Skip if name or phone is a header value
      if (headerValues.includes(nameStr) || headerValues.includes(phoneStr)) {
        return false;
      }
      
      // Skip if name is exactly "Name" or phone is exactly "Phone"
      if (nameStr === 'name' || phoneStr === 'phone') {
        return false;
      }
      
      return true;
    });
    
    // Debug: Log first few rows to see what we're getting
    console.log('📊 Total rows from Excel (before filter):', data.length);
    console.log('📊 Filtered rows (after removing headers):', filteredData.length);
    console.log('📊 First 3 rows from Excel:', JSON.stringify(filteredData.slice(0, 3), null, 2));

    // Validate and process contacts
    const contacts = [];
    const errors = [];

    // Use filtered data (with headers removed)
    filteredData.forEach((row, index) => {
      // Skip empty rows
      if (!row.name && !row.phone && !row.countryCode) {
        return;
      }

      // Validate required fields
      if (!row.name || (typeof row.name === 'string' && row.name.trim() === '')) {
        errors.push(`Row ${index + 2}: Name is required`);
        return;
      }
      
      // Check if phone is provided (handle 0, empty string, null, undefined, and dash)
      const phoneValue = row.phone;
      if (phoneValue === null || phoneValue === undefined || phoneValue === '' || 
          (typeof phoneValue === 'string' && phoneValue.trim() === '') ||
          (typeof phoneValue === 'string' && phoneValue.trim() === '-')) {
        errors.push(`Row ${index + 2}: Phone number is required (received: ${JSON.stringify(phoneValue)})`);
        return;
      }

      // Convert phone to string and handle various formats
      let phoneStr = '';
      
      // Debug logging for phone number
      console.log(`📱 Row ${index + 2} - Phone raw value:`, row.phone, 'Type:', typeof row.phone);
      
      if (row.phone === null || row.phone === undefined) {
        errors.push(`Row ${index + 2}: Phone number is required`);
        return;
      }
      
      // Handle different phone number formats
      if (typeof row.phone === 'number') {
        // If it's a number, convert to string without scientific notation
        // Handle large numbers that might be in scientific notation
        const numStr = row.phone.toString();
        if (numStr.includes('e') || numStr.includes('E')) {
          // Convert from scientific notation (e.g., 9.958011332e+9 -> 9958011332)
          phoneStr = row.phone.toFixed(0);
        } else {
          // Regular number, convert to string
          phoneStr = numStr;
        }
      } else if (typeof row.phone === 'string') {
        phoneStr = row.phone;
      } else if (row.phone !== null && row.phone !== undefined) {
        // Try to convert to string
        phoneStr = String(row.phone);
      } else {
        errors.push(`Row ${index + 2}: Phone number is empty or invalid (type: ${typeof row.phone})`);
        return;
      }

      // Clean phone number (remove spaces, dashes, parentheses, plus signs, dots, etc.)
      let cleanPhone = phoneStr.trim();
      
      // Remove leading + if present (we'll validate length separately)
      if (cleanPhone.startsWith('+')) {
        cleanPhone = cleanPhone.substring(1);
      }
      
      // Remove all non-digit characters
      cleanPhone = cleanPhone.replace(/[^\d]/g, '');
      
      console.log(`📱 Row ${index + 2} - Phone after cleaning:`, cleanPhone, 'Length:', cleanPhone.length);

      // Validate phone number format (should be numeric and 10-15 digits)
      // Also check if it's not empty after cleaning
      if (!cleanPhone || cleanPhone.length === 0) {
        errors.push(`Row ${index + 2}: Phone number is empty or invalid (original: "${phoneStr}", cleaned: "${cleanPhone}")`);
        return;
      }
      
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        errors.push(`Row ${index + 2}: Invalid phone number format. Phone must be 10-15 digits (got ${cleanPhone.length} digits: "${cleanPhone}")`);
        return;
      }
      
      if (!/^\d+$/.test(cleanPhone)) {
        errors.push(`Row ${index + 2}: Phone number contains non-numeric characters`);
        return;
      }

      // Handle country code (optional)
      let countryCode = '';
      if (row.countryCode !== null && row.countryCode !== undefined && row.countryCode !== '') {
        const countryCodeStr = String(row.countryCode).trim();
        // Remove + if present
        countryCode = countryCodeStr.startsWith('+') ? countryCodeStr.substring(1) : countryCodeStr;
        // Remove non-digit characters
        countryCode = countryCode.replace(/[^\d]/g, '');
      }

      // Create contact object
      const contact = {
        name: row.name.toString().trim(),
        countryCode: countryCode || undefined, // Store only if provided
        phone: cleanPhone,
        email: row.email ? row.email.toString().trim() : '',
        address: row.address ? row.address.toString().trim() : '',
        city: row.city ? row.city.toString().trim() : '',
        ac: row.ac ? row.ac.toString().trim() : '',
        pc: row.pc ? row.pc.toString().trim() : '',
        ps: row.ps ? row.ps.toString().trim() : '',
        addedAt: new Date(),
        addedBy: req.user.id
      };

      contacts.push(contact);
    });

    if (errors.length > 0 && contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid contacts found in file',
        errors: errors
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully parsed ${contacts.length} contact(s)`,
      data: {
        contacts: contacts,
        errors: errors.length > 0 ? errors : undefined,
        totalRows: data.length,
        validContacts: contacts.length,
        invalidRows: errors.length
      }
    });

  } catch (error) {
    console.error('Error parsing Excel file:', error);
    res.status(500).json({
      success: false,
      message: 'Error parsing Excel file',
      error: error.message
    });
  }
};

// @desc    Get CATI performance stats for a survey
// @route   GET /api/surveys/:id/cati-stats
// @access  Private (Company Admin, Project Manager)
exports.getCatiStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔍🔍🔍 getCatiStats - START - Request for survey ID: ${id}`);
    console.log(`🔍🔍🔍 getCatiStats - User:`, req.user?.email, req.user?.userType);
    
    // Get current user and their company
    const currentUser = await User.findById(req.user.id).populate('company');
    if (!currentUser || !currentUser.company) {
      return res.status(400).json({
        success: false,
        message: 'User not associated with any company'
      });
    }

    // Find survey
    const survey = await Survey.findById(id);
    if (!survey) {
      console.log(`❌ getCatiStats - Survey not found: ${id}`);
      return res.status(404).json({
        success: false,
        message: 'Survey not found'
      });
    }

    console.log(`✅ getCatiStats - Survey found: ${survey.surveyName || survey.title}`);

    // Check access
    if (survey.company.toString() !== currentUser.company._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Convert survey ID to ObjectId if needed
    const mongoose = require('mongoose');
    const surveyObjectId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;

    console.log(`🔍 getCatiStats - Survey ID: ${id}, ObjectId: ${surveyObjectId}`);

    // Get queue entries first to find all related call records
    const queueEntries = await CatiRespondentQueue.find({
      survey: surveyObjectId
    }).select('_id callRecord');

    console.log(`🔍 getCatiStats - Found ${queueEntries.length} queue entries for survey`);

    const queueEntryIds = queueEntries.map(q => q._id);
    const callRecordIdsFromQueue = queueEntries
      .filter(q => q.callRecord)
      .map(q => q.callRecord._id || q.callRecord)
      .filter(id => id);

    console.log(`🔍 getCatiStats - Queue entry IDs: ${queueEntryIds.length}, Call record IDs from queue: ${callRecordIdsFromQueue.length}`);

    // Get ALL call records linked to this survey (directly via survey field)
    // Try multiple query approaches to ensure we find all calls
    let callRecords = [];
    
    // Approach 1: Query by ObjectId (primary method - should find all calls)
    console.log(`🔍🔍🔍 getCatiStats - Querying CatiCall with survey: ${surveyObjectId}`);
    const callsByObjectId = await CatiCall.find({
      survey: surveyObjectId
    })
      .populate('createdBy', 'firstName lastName email')
      .populate('queueEntry');

    console.log(`🔍🔍🔍 getCatiStats - Calls found by ObjectId: ${callsByObjectId.length}`);
    if (callsByObjectId.length > 0) {
      console.log(`🔍🔍🔍 getCatiStats - Sample call:`, {
        _id: callsByObjectId[0]._id,
        callId: callsByObjectId[0].callId,
        survey: String(callsByObjectId[0].survey),
        callStatus: callsByObjectId[0].callStatus,
        originalStatusCode: callsByObjectId[0].originalStatusCode
      });
    }
    // Convert Mongoose documents to plain objects for processing
    callRecords = callsByObjectId.map(c => {
      if (c.toObject) {
        return c.toObject();
      } else if (c.toJSON) {
        return c.toJSON();
      }
      return c;
    });
    
    // Approach 2: Get calls linked via queueEntry (in case some don't have survey field set)
    if (queueEntryIds.length > 0) {
      const callsViaQueue = await CatiCall.find({
        queueEntry: { $in: queueEntryIds },
        _id: { $nin: callRecords.map(c => c._id) }  // Exclude already found calls
      })
        .populate('createdBy', 'firstName lastName email')
        .populate('queueEntry');
      
      console.log(`🔍 getCatiStats - Calls found via queueEntry: ${callsViaQueue.length}`);
      
      // Add calls not already in the list
      const existingCallIds = new Set(callRecords.map(c => c._id.toString()));
      callsViaQueue.forEach(call => {
        let callObj;
        if (call.toObject) {
          callObj = call.toObject();
        } else if (call.toJSON) {
          callObj = call.toJSON();
        } else {
          callObj = call;
        }
        if (!existingCallIds.has(callObj._id.toString())) {
          callRecords.push(callObj);
        }
      });
    }
    
    console.log(`🔍 getCatiStats - Total unique call records found: ${callRecords.length}`);
    
    // Log sample call records to understand the data structure
    if (callRecords.length > 0) {
      console.log(`🔍 getCatiStats - Sample call record structure:`, {
        _id: callRecords[0]._id,
        callId: callRecords[0].callId,
        survey: callRecords[0].survey,
        surveyType: typeof callRecords[0].survey,
        surveyString: String(callRecords[0].survey),
        queueEntry: callRecords[0].queueEntry,
        callStatus: callRecords[0].callStatus,
        originalStatusCode: callRecords[0].originalStatusCode,
        webhookReceived: callRecords[0].webhookReceived,
        hasWebhookData: !!callRecords[0].webhookData,
        webhookDataKeys: callRecords[0].webhookData ? Object.keys(callRecords[0].webhookData) : []
      });
    } else {
      // If no calls found, try a broader search to debug
      const allCallsCount = await CatiCall.countDocuments({});
      const callsWithSurveyCount = await CatiCall.countDocuments({ survey: { $exists: true, $ne: null } });
      console.log(`⚠️ getCatiStats - No calls found. Total calls in DB: ${allCallsCount}, Calls with survey field: ${callsWithSurveyCount}`);
      
      // Try to find any calls with similar survey IDs
      if (mongoose.Types.ObjectId.isValid(id)) {
        const sampleCalls = await CatiCall.find({ survey: { $exists: true } }).limit(5).select('survey callId').lean();
        console.log(`🔍 getCatiStats - Sample survey IDs from other calls:`, sampleCalls.map(c => ({ survey: String(c.survey), callId: c.callId })));
      }
    }
    
    // Count calls with webhook data for reference
    const callsWithWebhook = callRecords.filter(c => c.webhookReceived === true || (c.webhookData && Object.keys(c.webhookData).length > 0));
    console.log(`🔍 getCatiStats - Calls with webhook data: ${callsWithWebhook.length} out of ${callRecords.length} total`);
    
    // Use ALL call records for counting (not just those with webhook)
    // For status determination, prioritize webhook data but fall back to stored callStatus
    
    // Helper functions defined here (before use)
    // Helper function to get call status from status code
    // Priority: originalStatusCode field > webhookData.callStatus > webhookData.status > stored callStatus
    const getCallStatus = (call) => {
      const webhookData = call.webhookData || {};
      
      // Try to get status code from multiple sources
      let statusCode = call.originalStatusCode;
      if (!statusCode && webhookData) {
        statusCode = webhookData.callStatus || webhookData.status;
      }
      
      // Convert to number if it's a string
      const statusCodeNum = typeof statusCode === 'number' ? statusCode : parseInt(statusCode);
      
      if (!isNaN(statusCodeNum)) {
        // Map DeepCall status codes (CTC - Click to Call)
        // Status 3: Both Answered -> completed
        if (statusCodeNum === 3) return 'completed';
        // Status 4, 5, 10: Answered -> answered
        // 4: To Ans. - From Unans., 5: To Ans, 10: From Ans.
        if (statusCodeNum === 4 || statusCodeNum === 5 || statusCodeNum === 10) return 'answered';
        // Status 6, 7, 8, 9: Unanswered -> no-answer
        // 6: To Unans - From Ans., 7: From Unanswered, 8: To Unans., 9: Both Unanswered
        if (statusCodeNum === 6 || statusCodeNum === 7 || statusCodeNum === 8 || statusCodeNum === 9) return 'no-answer';
        // Status 11, 12, 20, 21: Rejected/Skipped/Hangup -> cancelled
        // 11: Rejected Call, 12: Skipped, 20: To Hangup in Queue, 21: To Hangup
        if (statusCodeNum === 11 || statusCodeNum === 12 || statusCodeNum === 20 || statusCodeNum === 21) return 'cancelled';
        // Status 13, 14, 15, 16: Failed -> failed
        // 13: From Failed, 14: To Failed - From Ans., 15: To Failed, 16: To Ans - From Failed
        if (statusCodeNum === 13 || statusCodeNum === 14 || statusCodeNum === 15 || statusCodeNum === 16) return 'failed';
        // Status 18: To Ans. - From Not Found -> failed (but mark as "does not exist" separately)
        if (statusCodeNum === 18) return 'failed';
        // Status 17, 19: Busy -> busy
        // 17: From Busy, 19: To Unans. - From Busy
        if (statusCodeNum === 17 || statusCodeNum === 19) return 'busy';
      }
      
      // Fallback to stored callStatus
      return call.callStatus || 'initiated';
    };
    
    // Helper function to check if "From" is answered (interviewer/agent answered)
    // Status codes where "From" is answered: 3, 6, 10, 14, 16
    const isFromAnswered = (call) => {
      const webhookData = call.webhookData || {};
      let statusCode = call.originalStatusCode;
      if (!statusCode && webhookData) {
        statusCode = webhookData.callStatus || webhookData.status;
      }
      const statusCodeNum = typeof statusCode === 'number' ? statusCode : parseInt(statusCode);
      
      if (!isNaN(statusCodeNum)) {
        // Status codes where "From" (interviewer/agent) is answered:
        // 3: Both Answered, 6: To Unans - From Ans., 10: From Ans., 14: To Failed - From Ans., 16: To Ans - From Failed
        return statusCodeNum === 3 || statusCodeNum === 6 || statusCodeNum === 10 || statusCodeNum === 14 || statusCodeNum === 16;
      }
      return false;
    };
    
    if (callRecords.length > 0) {
      console.log(`🔍 getCatiStats - Sample call record:`, {
        callId: callRecords[0].callId,
        callStatus: callRecords[0].callStatus,
        originalStatusCode: callRecords[0].originalStatusCode,
        talkDuration: callRecords[0].talkDuration,
        callDuration: callRecords[0].callDuration,
        hasWebhookData: !!callRecords[0].webhookData,
        webhookReceived: callRecords[0].webhookReceived,
        webhookDataStatus: callRecords[0].webhookData?.callStatus || callRecords[0].webhookData?.status
      });
      
      // Show breakdown using getCallStatus helper
      const statusBreakdown = {
        completed: callRecords.filter(c => getCallStatus(c) === 'completed').length,
        answered: callRecords.filter(c => getCallStatus(c) === 'answered').length,
        no_answer: callRecords.filter(c => getCallStatus(c) === 'no-answer').length,
        busy: callRecords.filter(c => getCallStatus(c) === 'busy').length,
        failed: callRecords.filter(c => getCallStatus(c) === 'failed').length,
        cancelled: callRecords.filter(c => getCallStatus(c) === 'cancelled').length,
        ringing: callRecords.filter(c => getCallStatus(c) === 'ringing').length,
        initiated: callRecords.filter(c => getCallStatus(c) === 'initiated').length
      };
      console.log(`🔍 getCatiStats - Call statuses breakdown (using status codes):`, statusBreakdown);
      console.log(`🔍 getCatiStats - Calls where From is answered: ${callRecords.filter(c => isFromAnswered(c)).length}`);
    } else {
      console.log(`⚠️ getCatiStats - No call records found for survey ${id}`);
      console.log(`⚠️ getCatiStats - Survey ObjectId used: ${surveyObjectId}`);
    }

    // Get queue entries for additional context (status breakdowns) - already fetched above
    const queueEntriesWithDetails = await CatiRespondentQueue.find({
      survey: surveyObjectId
    })
      .populate('assignedTo', 'firstName lastName email');

    console.log(`🔍 getCatiStats - Found ${queueEntriesWithDetails.length} queue entries for survey ${id}`);

    // Calculate total calls made = total call records (each record = one call attempt)
    const totalCallsMade = callRecords.length;

    // Dials attempted = total calls made (same thing)
    const dialsAttempted = totalCallsMade;

    // Calls attended = calls where "From" is answered (interviewer/agent answered)
    // Status codes 3, 6, 10, 14, 16 indicate "From" is answered
    const callsAttended = callRecords.filter(c => {
      return isFromAnswered(c);
    }).length;

    // Calls connected = calls where status is 'answered' or 'completed' (successful connections)
    // Status codes 3, 4, 5, 10 indicate successful connection
    const callsConnected = callRecords.filter(c => {
      const status = getCallStatus(c);
      return status === 'answered' || status === 'completed';
    }).length;

    console.log(`🔍 getCatiStats - Calls attended: ${callsAttended}, Calls connected: ${callsConnected}`);
    
    // Calculate total talk duration from call records (in seconds)
    // Use talkDuration field which is extracted from webhookData
    const totalTalkDuration = callRecords.reduce((sum, c) => {
      // talkDuration is already in seconds from webhook processing
      return sum + (c.talkDuration || 0);
    }, 0);
    
    console.log(`🔍 getCatiStats - Total talk duration: ${totalTalkDuration} seconds`);
    const formatDuration = (seconds) => {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Get queue status breakdown for additional context
    const queueStats = await CatiRespondentQueue.aggregate([
      { $match: { survey: surveyObjectId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log(`🔍 getCatiStats - Queue stats:`, queueStats);
    console.log(`🔍 getCatiStats - Total call records found: ${callRecords.length}`);

    // Status breakdowns from queue entries (for reference, but primary source is call records)
    const statusCounts = {
      interview_success: 0,
      call_failed: 0,
      busy: 0,
      not_interested: 0,
      no_answer: 0,
      switched_off: 0,
      not_reachable: 0,
      does_not_exist: 0,
      rejected: 0,
      call_later: 0
    };

    queueStats.forEach(stat => {
      if (statusCounts.hasOwnProperty(stat._id)) {
        statusCounts[stat._id] = stat.count;
      }
    });

    // Call status breakdown from call records (webhook data) - PRIMARY SOURCE
    // Use getCallStatus helper function to map DeepCall status codes correctly
    const callStatusBreakdown = {
      answered: callRecords.filter(c => getCallStatus(c) === 'answered').length,
      completed: callRecords.filter(c => getCallStatus(c) === 'completed').length,
      no_answer: callRecords.filter(c => getCallStatus(c) === 'no-answer').length,
      busy: callRecords.filter(c => getCallStatus(c) === 'busy').length,
      failed: callRecords.filter(c => getCallStatus(c) === 'failed').length,
      cancelled: callRecords.filter(c => getCallStatus(c) === 'cancelled').length,
      ringing: callRecords.filter(c => getCallStatus(c) === 'ringing' || c.callStatus === 'ringing').length,
      initiated: callRecords.filter(c => getCallStatus(c) === 'initiated' || c.callStatus === 'initiated').length
    };
    
    console.log(`🔍 getCatiStats - Call status breakdown:`, callStatusBreakdown);

    // Extract additional details from webhookData and originalStatusCode for number status
    // Use DeepCall status codes to correctly categorize calls
    let switchOffCount = 0;
    let numberNotReachableCount = 0;
    let numberDoesNotExistCount = 0;
    
    // DeepCall Status Code Mapping (CTC - Click to Call)
    // Status codes: 3=Both Answered, 4=To Ans-From Unans, 5=To Ans, 6=To Unans-From Ans,
    // 7=From Unanswered, 8=To Unans, 9=Both Unanswered, 10=From Ans,
    // 11=Rejected, 12=Skipped, 13=From Failed, 14=To Failed-From Ans, 15=To Failed,
    // 16=To Ans-From Failed, 17=From Busy, 18=To Ans-From Not Found, 19=To Unans-From Busy,
    // 20=To Hangup in Queue, 21=To Hangup
    
    callRecords.forEach(call => {
      const webhookData = call.webhookData || {};
      const originalStatusCode = call.originalStatusCode || webhookData.callStatus || webhookData.status;
      const statusCode = typeof originalStatusCode === 'number' ? originalStatusCode : parseInt(originalStatusCode);
      
      // Map status codes to number status categories
      if (statusCode === 13 || statusCode === 15 || statusCode === 16) {
        // Status 13: From Failed, 15: To Failed, 16: To Ans - From Failed
        // These indicate the number failed - could be switch off or not reachable
        // Check webhookData for more details
        const exitCode = webhookData.exitCode || call.hangupCause || '';
        const hangupReason = webhookData.hangupReason || call.hangupReason || '';
        const statusDesc = call.statusDescription || '';
        
        const exitCodeStr = String(exitCode).toLowerCase();
        const reasonStr = String(hangupReason).toLowerCase();
        const descStr = String(statusDesc).toLowerCase();
        
        if (exitCodeStr.includes('switch') || reasonStr.includes('switch') || descStr.includes('switch')) {
          switchOffCount++;
        } else if (exitCodeStr.includes('not reachable') || reasonStr.includes('not reachable') || descStr.includes('not reachable')) {
          numberNotReachableCount++;
        } else {
          // Default to not reachable for failed calls
          numberNotReachableCount++;
        }
      } else if (statusCode === 18) {
        // Status 18: To Ans. - From Not Found (Number does not exist)
        numberDoesNotExistCount++;
      } else if (statusCode === 7 || statusCode === 8 || statusCode === 9) {
        // Status 7: From Unanswered, 8: To Unans., 9: Both Unanswered
        // These could be switch off - check webhookData
        const exitCode = webhookData.exitCode || call.hangupCause || '';
        const hangupReason = webhookData.hangupReason || call.hangupReason || '';
        const statusDesc = call.statusDescription || '';
        
        const exitCodeStr = String(exitCode).toLowerCase();
        const reasonStr = String(hangupReason).toLowerCase();
        const descStr = String(statusDesc).toLowerCase();
        
        if (exitCodeStr.includes('switch') || reasonStr.includes('switch') || descStr.includes('switch')) {
          switchOffCount++;
        } else {
          // Default: no answer (not switch off)
          // This will be counted in "Call Not Received" but not in "Switch Off"
        }
      }
    });

    // Calculate number stats based on DeepCall status codes
    // Call Not Received = no_answer (status 6,7,8,9) + failed (status 13,14,15,16,18) that didn't connect
    const callNotReceived = callStatusBreakdown.no_answer + 
                            callRecords.filter(c => {
                              const status = getCallStatus(c);
                              return status === 'failed' && status !== 'answered' && status !== 'completed';
                            }).length;
    
    // Ringing = calls that reached ringing status (status 1, 2, or ringing status)
    const ringing = callStatusBreakdown.ringing;
    
    // Not Ringing = switch off + not reachable + does not exist (from status code analysis)
    // Status 18 = does not exist, Status 13/15/16 = failed (could be switch off or not reachable)
    const notRinging = switchOffCount + numberNotReachableCount + numberDoesNotExistCount;
    
    // No Response by Telecaller = 0 (not tracked currently)
    const noResponseByTelecaller = 0;

    // Call Not Ring Status breakdown (from webhook data analysis)
    const callNotRingStatus = {
      switchOff: switchOffCount,
      numberNotReachable: numberNotReachableCount,
      numberDoesNotExist: numberDoesNotExistCount,
      noResponseByTelecaller: 0
    };

    // Call Ring Status breakdown (from call records)
    // Calls that rang but didn't connect = no_answer status
    const callsNotConnected = callRecords.filter(c => {
      const status = getCallStatus(c);
      return status === 'no-answer';
    }).length;
    
    const callRingStatus = {
      callsConnected: callsConnected,
      callsNotConnected: callsNotConnected,
      noResponseByTelecaller: 0
    };

    // Interviewer performance - aggregate from call records (primary source)
    const interviewerStatsMap = new Map();
    
    // Count calls by interviewer from call records
    callRecords.forEach(call => {
      if (call.createdBy) {
        const interviewerId = call.createdBy._id.toString();
        if (!interviewerStatsMap.has(interviewerId)) {
          interviewerStatsMap.set(interviewerId, {
            interviewerId: call.createdBy._id,
            interviewerName: `${call.createdBy.firstName} ${call.createdBy.lastName}`,
            callsMade: 0,
            callsConnected: 0,
            totalTalkDuration: 0
          });
        }
        const stat = interviewerStatsMap.get(interviewerId);
        
        // Count this call
        stat.callsMade += 1;
        
        // Count connected calls (using status code mapping)
        const callStatus = getCallStatus(call);
        if (callStatus === 'answered' || callStatus === 'completed') {
          stat.callsConnected += 1;
        }
        
        // Add talk duration
        if (call.talkDuration) {
          stat.totalTalkDuration += call.talkDuration;
        }
      }
    });
    
    const interviewerStats = Array.from(interviewerStatsMap.values());
    
    console.log(`🔍 getCatiStats - Interviewer stats:`, interviewerStats.length, 'interviewers');

    console.log(`🔍 getCatiStats - Final stats:`, {
      callsMade: totalCallsMade,
      callsAttended: callsAttended,
      dialsAttempted: dialsAttempted,
      callsConnected: callsConnected,
      totalTalkDuration: formatDuration(totalTalkDuration),
      callNotReceived,
      ringing,
      notRinging,
      switchOff: switchOffCount,
      numberNotReachable: numberNotReachableCount,
      numberDoesNotExist: numberDoesNotExistCount
    });

    const responseData = {
      callerPerformance: {
        callsMade: totalCallsMade,
        callsAttended: callsAttended,
        dialsAttempted: dialsAttempted,
        callsConnected: callsConnected,
        totalTalkDuration: formatDuration(totalTalkDuration)
      },
      numberStats: {
        callNotReceived: callNotReceived,
        ringing: ringing,
        notRinging: notRinging,
        noResponseByTelecaller: noResponseByTelecaller
      },
      callNotRingStatus: callNotRingStatus,
      callRingStatus: callRingStatus,
      statusBreakdown: statusCounts,
      callStatusBreakdown: callStatusBreakdown,
      interviewerStats: interviewerStats.map(stat => ({
        interviewerId: stat.interviewerId,
        interviewerName: stat.interviewerName,
        callsMade: stat.callsMade,
        callsConnected: stat.callsConnected,
        totalTalkDuration: formatDuration(stat.totalTalkDuration || 0)
      })),
      callRecords: callRecords.map(call => ({
        _id: call._id,
        callId: call.callId,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        callStatus: call.callStatus,
        callStatusDescription: call.callStatusDescription,
        callStartTime: call.callStartTime,
        callEndTime: call.callEndTime,
        callDuration: call.callDuration,
        talkDuration: call.talkDuration,
        recordingUrl: call.recordingUrl,
        interviewer: call.createdBy ? {
          _id: call.createdBy._id,
          name: `${call.createdBy.firstName} ${call.createdBy.lastName}`,
          email: call.createdBy.email
        } : null,
        createdAt: call.createdAt
      }))
    };

    console.log(`🔍🔍🔍 getCatiStats - Sending response with ${callRecords.length} call records`);
    console.log(`🔍🔍🔍 getCatiStats - Response callerPerformance:`, {
      callsMade: responseData.callerPerformance.callsMade,
      callsAttended: responseData.callerPerformance.callsAttended,
      callsConnected: responseData.callerPerformance.callsConnected
    });
    console.log(`🔍🔍🔍 getCatiStats - Response data structure (first 1000 chars):`, JSON.stringify(responseData, null, 2).substring(0, 1000));

    res.status(200).json({
      success: true,
      data: responseData
    });
    console.log(`🔍🔍🔍 getCatiStats - END - Response sent successfully`);

  } catch (error) {
    console.error('Get CATI stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Export multer middleware for use in routes
exports.uploadRespondentContactsMiddleware = upload.single('file');
