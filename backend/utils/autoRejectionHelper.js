const SurveyResponse = require('../models/SurveyResponse');

/**
 * Helper function to get main text (strip translations)
 * @param {String} text - Text that may contain translations in format "Main Text {Translation}"
 * @returns {String} - Main text without translation
 */
const getMainText = (text) => {
  if (!text || typeof text !== 'string') return text || '';
  // Match pattern: "Main Text {Translation}"
  const translationRegex = /^(.+?)\s*\{([^}]+)\}\s*$/;
  const match = text.match(translationRegex);
  return match ? match[1].trim() : text.trim();
};

/**
 * Helper function to normalize response value for comparison
 * @param {Any} response - Response value (can be string, array, object, etc.)
 * @returns {String} - Normalized string value for comparison
 */
const normalizeResponseValue = (response) => {
  if (!response) return '';
  
  // Handle arrays
  if (Array.isArray(response)) {
    response = response[0] || '';
  }
  
  // Handle objects
  if (typeof response === 'object' && response !== null) {
    response = response.value || response.text || response.phone || response;
  }
  
  // Convert to string and normalize
  const responseStr = String(response).toLowerCase().trim();
  return getMainText(responseStr).toLowerCase().trim();
};

/**
 * Check if a survey response should be automatically rejected
 * @param {Object} surveyResponse - The survey response object
 * @param {Array} responses - Array of response objects from the interview
 * @param {String} surveyId - The survey ID
 * @returns {Object|null} - Returns rejection info if should be rejected, null otherwise
 */
const checkAutoRejection = async (surveyResponse, responses, surveyId) => {
  const rejectionReasons = [];
  
  // EXCEPTION FOR CATI RESPONSES:
  // Skip auto-rejection for CATI responses that are:
  // 1. Already marked as "abandoned" status
  // 2. Have call status other than "call_connected" or "success" (abandoned calls)
  // 3. Have metadata.abandoned = true
  const isCatiAbandoned = surveyResponse.interviewMode === 'cati' && (
    surveyResponse.status === 'abandoned' ||
    surveyResponse.metadata?.abandoned === true ||
    surveyResponse.metadata?.callStatus !== 'call_connected' && 
    surveyResponse.metadata?.callStatus !== 'success' &&
    surveyResponse.metadata?.callStatus !== null &&
    surveyResponse.metadata?.callStatus !== undefined ||
    surveyResponse.knownCallStatus !== 'call_connected' && 
    surveyResponse.knownCallStatus !== 'success' &&
    surveyResponse.knownCallStatus !== null &&
    surveyResponse.knownCallStatus !== undefined
  );
  
  if (isCatiAbandoned) {
    console.log(`⏭️  Skipping auto-rejection for CATI abandoned response: ${surveyResponse._id}`);
    return null; // Don't auto-reject abandoned CATI interviews
  }
  
  // Condition 1: Duration check - must be more than 3 minutes (180 seconds)
  // Apply to all interview modes (CAPI and CATI) for completed interviews
  // Note: Abandoned CATI interviews are already filtered out above (isCatiAbandoned check)
  if (surveyResponse.totalTimeSpent && 
      surveyResponse.totalTimeSpent < 180) {
    rejectionReasons.push({
      reason: 'Interview Too Short',
      condition: 'duration'
    });
  }
  
  // Condition 2: Voter check - reject if respondent is not a registered voter
  const VOTER_QUESTION_KEYWORDS = [
    'registered voter',
    'assembly constituency',
    'assembly Constituency',
    'নিবন্ধিত ভোটার',
    'বিধানসভা কেন্দ্র'
  ];
  
  // Find the voter question in responses
  const voterResponse = responses.find(r => {
    const questionText = getMainText(r.questionText || r.question?.text || '').toLowerCase();
    // Check if question contains voter-related keywords
    return VOTER_QUESTION_KEYWORDS.some(keyword => 
      questionText.includes(keyword.toLowerCase())
    );
  });
  
  if (voterResponse && voterResponse.response !== null && voterResponse.response !== undefined) {
    // Normalize the response value
    const normalizedResponse = normalizeResponseValue(voterResponse.response);
    
    // Check if response is "no" (case-insensitive, ignoring translations)
    // Common variations: "no", "না", "no.", "না।", etc.
    const noVariations = ['no', 'না', 'non', 'nein', 'нет'];
    const isNo = noVariations.some(noWord => {
      // Check if normalized response starts with or equals "no" (ignoring punctuation)
      const cleanedResponse = normalizedResponse.replace(/[।.,!?]/g, '').trim();
      return cleanedResponse === noWord || cleanedResponse.startsWith(noWord + ' ');
    });
    
    if (isNo) {
      rejectionReasons.push({
        reason: 'Not Voter',
        condition: 'not_voter'
      });
    }
  }
  
  // Condition 3: GPS distance check for CAPI interviews with booster enabled
  // Only apply if interview mode is CAPI and booster is enabled
  if (surveyResponse.interviewMode === 'capi' && surveyResponse.metadata?.locationControlBooster) {
    const pollingStation = surveyResponse.selectedPollingStation;
    // GPS location can be in gpsLocation or location field
    const gpsLocation = surveyResponse.gpsLocation || surveyResponse.location;
    const distanceRadius = surveyResponse.metadata?.distanceRadius || 100; // Default 100 meters
    
    // Check if both GPS location and polling station coordinates are available
    if (gpsLocation && pollingStation) {
      // Extract coordinates - handle different formats
      let gpsLat = null, gpsLon = null;
      let psLat = null, psLon = null;
      
      // Get GPS coordinates
      if (gpsLocation.latitude && gpsLocation.longitude) {
        gpsLat = gpsLocation.latitude;
        gpsLon = gpsLocation.longitude;
      } else if (gpsLocation.coordinates && gpsLocation.coordinates.latitude && gpsLocation.coordinates.longitude) {
        gpsLat = gpsLocation.coordinates.latitude;
        gpsLon = gpsLocation.coordinates.longitude;
      } else if (typeof gpsLocation === 'string' && gpsLocation.includes(',')) {
        // Handle "lat,lng" format
        const parts = gpsLocation.split(',');
        gpsLat = parseFloat(parts[0]);
        gpsLon = parseFloat(parts[1]);
      }
      
      // Get polling station coordinates
      if (pollingStation.latitude && pollingStation.longitude) {
        psLat = pollingStation.latitude;
        psLon = pollingStation.longitude;
      } else if (pollingStation.gpsLocation && typeof pollingStation.gpsLocation === 'string' && pollingStation.gpsLocation.includes(',')) {
        // Handle "lat,lng" format
        const parts = pollingStation.gpsLocation.split(',');
        psLat = parseFloat(parts[0]);
        psLon = parseFloat(parts[1]);
      }
      
      // Calculate distance if we have valid coordinates
      if (gpsLat !== null && gpsLon !== null && psLat !== null && psLon !== null &&
          !isNaN(gpsLat) && !isNaN(gpsLon) && !isNaN(psLat) && !isNaN(psLon)) {
        
        // Calculate distance using Haversine formula
        const R = 6371000; // Earth's radius in meters
        const lat1 = gpsLat * Math.PI / 180;
        const lat2 = psLat * Math.PI / 180;
        const deltaLat = (psLat - gpsLat) * Math.PI / 180;
        const deltaLon = (psLon - gpsLon) * Math.PI / 180;
        
        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // Distance in meters
        
        // Reject if distance exceeds the radius limit
        if (distance > distanceRadius) {
          rejectionReasons.push({
            reason: 'GPS Location too far from polling station',
            condition: 'gps_distance'
          });
        }
      }
    }
  }
  
  // Condition 4: Duplicate phone number check (only for specific survey)
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
    // Skip if phone number is "0" (indicates "Did not Answer")
    if (phoneNumber && phoneNumber.length > 0 && phoneNumber !== '0') {
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
  
  // CRITICAL: Preserve setNumber before modifying the response
  const preservedSetNumber = surveyResponse.setNumber;
  console.log(`💾 Preserving setNumber in applyAutoRejection: ${preservedSetNumber}`);
  
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
  
  // CRITICAL: Re-apply setNumber before saving
  if (preservedSetNumber !== null && preservedSetNumber !== undefined) {
    surveyResponse.setNumber = preservedSetNumber;
    surveyResponse.markModified('setNumber');
  }
  
  await surveyResponse.save();
  console.log(`✅ Auto-rejected survey response ${surveyResponse.responseId}: ${rejectionInfo.feedback}, setNumber preserved: ${surveyResponse.setNumber}`);
};

module.exports = {
  checkAutoRejection,
  applyAutoRejection
};

