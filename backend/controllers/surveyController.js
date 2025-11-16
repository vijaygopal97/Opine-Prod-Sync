const Survey = require('../models/Survey');
const User = require('../models/User');
const Company = require('../models/Company');
const SurveyResponse = require('../models/SurveyResponse');

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
      modeGigWorkers
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
      sections: sections || [],
      templateUsed: templateUsed || {},
      settings: settings || {},
      notifications: notifications || {},
      company: currentUser.company._id,
      createdBy: currentUser._id,
      lastModifiedBy: currentUser._id,
      status: status || 'draft', // Use provided status or default to draft
      assignACs: assignACs || false,
      acAssignmentCountry: acAssignmentCountry || '',
      acAssignmentState: acAssignmentState || ''
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
      modeGigWorkers
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
      sections,
      templateUsed,
      settings,
      notifications,
      status,
      assignACs,
      acAssignmentCountry: assignACs ? acAssignmentCountry : '',
      acAssignmentState: assignACs ? acAssignmentState : '',
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
