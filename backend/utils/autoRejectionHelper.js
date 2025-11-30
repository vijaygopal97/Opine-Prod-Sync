const SurveyResponse = require('../models/SurveyResponse');

/**
 * Check if a survey response should be automatically rejected
 * @param {Object} surveyResponse - The survey response object
 * @param {Array} responses - Array of response objects from the interview
 * @param {String} surveyId - The survey ID
 * @returns {Object|null} - Returns rejection info if should be rejected, null otherwise
 */
const checkAutoRejection = async (surveyResponse, responses, surveyId) => {
  const rejectionReasons = [];
  
  // Condition 1: Duration check - must be more than 3 minutes (180 seconds)
  if (surveyResponse.totalTimeSpent && surveyResponse.totalTimeSpent < 180) {
    rejectionReasons.push({
      reason: 'Interview Too Short',
      condition: 'duration'
    });
  }
  
  // Condition 2: Duplicate phone number check (only for specific survey)
  const TARGET_SURVEY_ID = '68fd1915d41841da463f0d46';
  const PHONE_QUESTION_TEXT = 'Would you like to share your mobile number with us? We assure you we shall keep it confidential and shall use only for quality control purposes.';
  
  if (surveyId && surveyId.toString() === TARGET_SURVEY_ID) {
    // Find phone number from responses
    let phoneNumber = null;
    
    // Search for the phone number question in responses
    const phoneResponse = responses.find(r => {
      const questionText = r.questionText || r.question?.text || '';
      return questionText.includes('mobile number') || 
             questionText.includes('phone number') ||
             questionText.toLowerCase().includes('share your mobile') ||
             questionText === PHONE_QUESTION_TEXT;
    });
    
    if (phoneResponse && phoneResponse.response) {
      // Extract phone number from response
      // Response could be a string, array, or object
      let phoneValue = phoneResponse.response;
      
      if (Array.isArray(phoneValue)) {
        phoneValue = phoneValue[0];
      } else if (typeof phoneValue === 'object' && phoneValue !== null) {
        // Try to extract phone from object
        phoneValue = phoneValue.phone || phoneValue.value || phoneValue.text || phoneValue;
      }
      
      // Clean phone number (remove spaces, dashes, etc.)
      if (typeof phoneValue === 'string') {
        phoneNumber = phoneValue.replace(/\s+/g, '').replace(/-/g, '').replace(/\(/g, '').replace(/\)/g, '').trim();
      } else if (typeof phoneValue === 'number') {
        phoneNumber = phoneValue.toString().trim();
      }
    }
    
    // If phone number found, check for duplicates
    if (phoneNumber && phoneNumber.length > 0) {
      try {
        // Find all other responses for this survey
        const otherResponses = await SurveyResponse.find({
          survey: surveyId,
          _id: { $ne: surveyResponse._id }, // Exclude current response
          status: { $in: ['Pending_Approval', 'Approved', 'Rejected'] } // Check all statuses
        }).select('responses');
        
        // Check each response for matching phone number
        for (const otherResponse of otherResponses) {
          if (!otherResponse.responses || !Array.isArray(otherResponse.responses)) {
            continue;
          }
          
          // Search through responses for phone number question
          for (const resp of otherResponse.responses) {
            const questionText = resp.questionText || resp.question?.text || '';
            const isPhoneQuestion = questionText.includes('mobile number') || 
                                   questionText.includes('phone number') ||
                                   questionText.toLowerCase().includes('share your mobile') ||
                                   questionText === PHONE_QUESTION_TEXT;
            
            if (isPhoneQuestion && resp.response) {
              // Extract phone from other response
              let otherPhoneValue = resp.response;
              
              if (Array.isArray(otherPhoneValue)) {
                otherPhoneValue = otherPhoneValue[0];
              } else if (typeof otherPhoneValue === 'object' && otherPhoneValue !== null) {
                otherPhoneValue = otherPhoneValue.phone || otherPhoneValue.value || otherPhoneValue.text || otherPhoneValue;
              }
              
              // Clean other phone number
              let otherPhoneNumber = null;
              if (typeof otherPhoneValue === 'string') {
                otherPhoneNumber = otherPhoneValue.replace(/\s+/g, '').replace(/-/g, '').replace(/\(/g, '').replace(/\)/g, '').trim();
              } else if (typeof otherPhoneValue === 'number') {
                otherPhoneNumber = otherPhoneValue.toString().trim();
              }
              
              // Compare cleaned phone numbers (case-insensitive)
              if (otherPhoneNumber && otherPhoneNumber.toLowerCase() === phoneNumber.toLowerCase()) {
                rejectionReasons.push({
                  reason: 'Duplicate Phone Number',
                  condition: 'duplicate_phone'
                });
                break; // Found duplicate, no need to check further
              }
            }
          }
          
          // If we found a duplicate, break out of outer loop
          if (rejectionReasons.some(r => r.condition === 'duplicate_phone')) {
            break;
          }
        }
      } catch (error) {
        console.error('Error checking for duplicate phone number:', error);
        // Don't reject if there's an error checking duplicates
      }
    }
  }
  
  // Return rejection info if any conditions are met
  if (rejectionReasons.length > 0) {
    // Combine all reasons into one feedback message
    const feedback = rejectionReasons.map(r => r.reason).join('; ');
    
    return {
      shouldReject: true,
      feedback,
      reasons: rejectionReasons
    };
  }
  
  return null;
};

/**
 * Apply auto-rejection to a survey response
 * @param {Object} surveyResponse - The survey response document
 * @param {Object} rejectionInfo - The rejection information from checkAutoRejection
 */
const applyAutoRejection = async (surveyResponse, rejectionInfo) => {
  if (!rejectionInfo || !rejectionInfo.shouldReject) {
    return;
  }
  
  // Update response status to Rejected
  surveyResponse.status = 'Rejected';
  
  // Set verification data with auto-rejection info
  surveyResponse.verificationData = {
    reviewer: null, // Auto-rejected, no reviewer
    reviewedAt: new Date(),
    criteria: {},
    feedback: rejectionInfo.feedback,
    autoRejected: true,
    autoRejectionReasons: rejectionInfo.reasons.map(r => r.condition)
  };
  
  await surveyResponse.save();
  console.log(`✅ Auto-rejected survey response ${surveyResponse.responseId}: ${rejectionInfo.feedback}`);
};

module.exports = {
  checkAutoRejection,
  applyAutoRejection
};

