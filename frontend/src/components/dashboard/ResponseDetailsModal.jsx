import React, { useState, useEffect } from 'react';
import { X, User, Calendar, MapPin, Clock, CheckCircle, AlertCircle, SkipForward, Eye, EyeOff, ThumbsDown, ThumbsUp, Zap, Play, Pause, Headphones, PhoneCall, Download } from 'lucide-react';
import { surveyResponseAPI, catiAPI } from '../../services/api';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import assemblyConstituencies from '../../data/assemblyConstituencies.json';

const ResponseDetailsModal = ({ response, survey, onClose, hideActions = false }) => {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [catiCallDetails, setCatiCallDetails] = useState(null);
  const [catiRecordingBlobUrl, setCatiRecordingBlobUrl] = useState(null);
  const { showSuccess, showError } = useToast();

  // Fetch CATI call details when modal opens for CATI responses
  useEffect(() => {
    // Reset state when response changes
    setCatiCallDetails(null);
    if (catiRecordingBlobUrl) {
      URL.revokeObjectURL(catiRecordingBlobUrl);
      setCatiRecordingBlobUrl(null);
    }
    
    if (response?.interviewMode === 'cati') {
      const callId = response.call_id;
      if (callId) {
        const fetchCallDetails = async () => {
          try {
            const callResponse = await catiAPI.getCallById(callId);
            if (callResponse.success && callResponse.data) {
              setCatiCallDetails(callResponse.data);
              
              // Fetch recording if available
              if (callResponse.data.recordingUrl) {
                try {
                  const recordingResponse = await api.get(
                    `/api/cati/recording/${callResponse.data._id}`,
                    { responseType: 'blob' }
                  );
                  if (recordingResponse.data) {
                    const blob = new Blob([recordingResponse.data], { type: 'audio/mpeg' });
                    const blobUrl = URL.createObjectURL(blob);
                    setCatiRecordingBlobUrl(blobUrl);
                  }
                } catch (recordingError) {
                  console.error('Error fetching CATI recording:', recordingError);
                  // Don't show error for recording - it's optional
                }
              }
            }
          } catch (error) {
            console.error('Error fetching CATI call details:', error);
            // Don't show error - call details are optional
          }
        };
        fetchCallDetails();
      }
    }
    
    // Cleanup blob URL on unmount
    return () => {
      if (catiRecordingBlobUrl) {
        URL.revokeObjectURL(catiRecordingBlobUrl);
      }
    };
  }, [response?._id, response?.interviewMode, response?.call_id]);

  // Helper function to format duration
  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Helper function to get district from AC using assemblyConstituencies.json
  const getDistrictFromAC = (acName) => {
    if (!acName || acName === 'N/A' || !assemblyConstituencies.states) return 'N/A';
    
    for (const state of Object.values(assemblyConstituencies.states)) {
      if (state.assemblyConstituencies) {
        const constituency = state.assemblyConstituencies.find(ac => 
          ac.acName === acName || ac.acName.toLowerCase() === acName.toLowerCase()
        );
        if (constituency && constituency.district) {
          return constituency.district;
        }
      }
    }
    return 'N/A';
  };

  // Helper function to get Lok Sabha from AC
  const getLokSabhaFromAC = (acName) => {
    if (!acName || acName === 'N/A' || !assemblyConstituencies.states) return 'N/A';
    
    for (const state of Object.values(assemblyConstituencies.states)) {
      if (state.assemblyConstituencies) {
        const constituency = state.assemblyConstituencies.find(ac => 
          ac.acName === acName || ac.acName.toLowerCase() === acName.toLowerCase()
        );
        if (constituency && constituency.lokSabha) {
          return constituency.lokSabha;
        }
      }
    }
    return 'N/A';
  };

  // Helper function to get state from GPS location
  const getStateFromGPS = (location) => {
    if (location?.state) return location.state;
    if (location?.address?.state) return location.address.state;
    if (location?.administrative_area_level_1) return location.administrative_area_level_1;
    return 'N/A';
  };

  // Helper function to check if a question is AC selection or polling station
  const isACOrPollingStationQuestion = (responseItem, surveyQuestion) => {
    // Check by questionId
    if (responseItem.questionId === 'ac-selection') return true;
    // Check by question type
    if (surveyQuestion?.type === 'polling_station') return true;
    // Check by question text (fallback)
    const questionText = responseItem.questionText || surveyQuestion?.text || '';
    if (questionText.toLowerCase().includes('select assembly constituency') || 
        questionText.toLowerCase().includes('select polling station')) {
      return true;
    }
    return false;
  };

  // Helper function to separate AC/polling station questions from regular questions
  const separateQuestions = (responses, survey) => {
    if (!responses || !Array.isArray(responses)) {
      return { interviewInfoQuestions: [], regularQuestions: [] };
    }
    
    const actualSurvey = survey?.survey || survey;
    const interviewInfoQuestions = [];
    const regularQuestions = [];
    
    responses.forEach((responseItem) => {
      const surveyQuestion = findQuestionByText(responseItem.questionText, actualSurvey);
      if (isACOrPollingStationQuestion(responseItem, surveyQuestion)) {
        interviewInfoQuestions.push(responseItem);
      } else {
        regularQuestions.push(responseItem);
      }
    });
    
    return { interviewInfoQuestions, regularQuestions };
  };

  // Helper function to extract AC and polling station info from responses
  const getACAndPollingStationFromResponses = (responses, survey) => {
    if (!responses || !Array.isArray(responses)) {
      return { ac: null, pollingStation: null, groupName: null };
    }
    
    const actualSurvey = survey?.survey || survey;
    let ac = null;
    let pollingStation = null;
    let groupName = null;
    
    responses.forEach((responseItem) => {
      const surveyQuestion = findQuestionByText(responseItem.questionText, actualSurvey);
      
      // Check if this is AC selection question
      if (responseItem.questionId === 'ac-selection' || 
          (surveyQuestion && surveyQuestion.id === 'ac-selection')) {
        ac = responseItem.response || null;
      }
      
      // Check if this is polling station question
      if (surveyQuestion?.type === 'polling_station' || 
          responseItem.questionText?.toLowerCase().includes('select polling station')) {
        // Polling station response should be in format "Code - Name" (e.g., "40 - Station Name")
        // or might be stored as "Group - Code - Name" in polling-station-selection
        const stationResponse = responseItem.response;
        if (stationResponse) {
          if (typeof stationResponse === 'string' && stationResponse.includes(' - ')) {
            const parts = stationResponse.split(' - ');
            // Check if it's "Group - Station" format (where Station is "Code - Name")
            if (parts.length >= 3 && parts[0].toLowerCase().startsWith('group')) {
              // Format: "Group X - Code - Name"
              groupName = parts[0] || null;
              pollingStation = parts.slice(1).join(' - '); // Join "Code - Name"
            } else if (parts.length === 2 && parts[0].toLowerCase().startsWith('group')) {
              // Format: "Group X - Code" (missing name, but use what we have)
              groupName = parts[0] || null;
              pollingStation = parts[1] || stationResponse;
            } else {
              // It's already in "Code - Name" format
              pollingStation = stationResponse;
            }
          } else {
            // Just code or name - use as is, will be formatted in display
            pollingStation = stationResponse;
          }
        }
      }
      
      // Also check for polling station group selection
      if (responseItem.questionId === 'polling-station-group' ||
          responseItem.questionText?.toLowerCase().includes('select group')) {
        groupName = responseItem.response || null;
      }
    });
    
    return { ac, pollingStation, groupName };
  };

  // Helper function to format polling station display with code and name
  const formatPollingStationDisplay = (stationValue, selectedPollingStation) => {
    // Priority 1: Use selectedPollingStation.stationName (should have full "Code - Name" format)
    if (selectedPollingStation?.stationName) {
      // If it already includes " - ", it's in the correct format "Code - Name"
      if (selectedPollingStation.stationName.includes(' - ')) {
        return selectedPollingStation.stationName;
      }
      // If it's just a code, check if stationValue has the full format
      if (stationValue && typeof stationValue === 'string' && stationValue.includes(' - ')) {
        return stationValue;
      }
      // If selectedPollingStation.stationName is just a code, return it as is
      // (In a full implementation, we'd look up the name, but for now show the code)
      return selectedPollingStation.stationName;
    }
    
    // Priority 2: Use stationValue from response
    if (stationValue) {
      // If it already includes " - ", it's in the correct format "Code - Name"
      if (typeof stationValue === 'string' && stationValue.includes(' - ')) {
        return stationValue;
      }
      // If stationValue is in format "Group - Code", extract just the code part
      if (typeof stationValue === 'string' && stationValue.includes(' - ')) {
        const parts = stationValue.split(' - ');
        // If first part is "Group X", the second part might be the code
        if (parts[0].toLowerCase().startsWith('group')) {
          // Return the code (second part)
          return parts[1] || stationValue;
        }
        // Otherwise it's already "Code - Name" format
        return stationValue;
      }
      // If it's just a code (numeric), return as is
      return stationValue;
    }
    
    return null;
  };

  // Helper function to extract respondent info from responses array
  const getRespondentInfo = (responses, responseData) => {
    if (!responses || !Array.isArray(responses)) {
      return { name: 'N/A', gender: 'N/A', age: 'N/A', city: 'N/A', district: 'N/A', ac: 'N/A', lokSabha: 'N/A', state: 'N/A' };
    }

    // Helper to extract value from response (handle arrays)
    const extractValue = (response) => {
      if (!response || response === null || response === undefined) return null;
      if (Array.isArray(response)) {
        // For arrays, return the first value (or join if needed)
        return response.length > 0 ? response[0] : null;
      }
      return response;
    };

    const nameResponse = responses.find(r => 
      r.questionText?.toLowerCase().includes('name') || 
      r.questionText?.toLowerCase().includes('respondent') ||
      r.questionText?.toLowerCase().includes('full name')
    );
    
    const genderResponse = responses.find(r => 
      r.questionText?.toLowerCase().includes('gender') || 
      r.questionText?.toLowerCase().includes('sex')
    );
    
    const ageResponse = responses.find(r => 
      r.questionText?.toLowerCase().includes('age') || 
      r.questionText?.toLowerCase().includes('year')
    );

    const acResponse = responses.find(r => 
      r.questionText?.toLowerCase().includes('assembly') ||
      r.questionText?.toLowerCase().includes('constituency')
    );

    // Get city from GPS location if available, otherwise from responses
    let city = 'N/A';
    if (responseData?.location?.city) {
      city = responseData.location.city;
    } else {
      const cityResponse = responses.find(r => 
        r.questionText?.toLowerCase().includes('city') || 
        r.questionText?.toLowerCase().includes('location')
      );
      city = extractValue(cityResponse?.response) || 'N/A';
    }

    // Get district from AC using assemblyConstituencies.json
    const acName = extractValue(acResponse?.response) || 'N/A';
    const district = getDistrictFromAC(acName);

    // Get Lok Sabha from AC using assemblyConstituencies.json
    const lokSabha = getLokSabhaFromAC(acName);

    // Get state from GPS location
    const state = getStateFromGPS(responseData?.location);

    return {
      name: extractValue(nameResponse?.response) || 'N/A',
      gender: extractValue(genderResponse?.response) || 'N/A',
      age: extractValue(ageResponse?.response) || 'N/A',
      city: city,
      district: district,
      ac: acName,
      lokSabha: lokSabha,
      state: state
    };
  };

  // Helper function to format response display text (same as SurveyApprovals)
  const formatResponseDisplay = (response, surveyQuestion) => {
    if (!response || response === null || response === undefined) {
      return 'No response';
    }

    // If it's an array (multiple selections)
    if (Array.isArray(response)) {
      if (response.length === 0) return 'No selections';
      
      // Map each value to its display text using the question options
      const displayTexts = response.map(value => {
        // Check if this is an "Others: [specified text]" response
        if (typeof value === 'string' && value.startsWith('Others: ')) {
          return value; // Return as-is (e.g., "Others: Custom text")
        }
        
        if (surveyQuestion && surveyQuestion.options) {
          const option = surveyQuestion.options.find(opt => opt.value === value);
          return option ? option.text : value;
        }
        return value;
      });
      
      return displayTexts.join(', ');
    }

    // If it's a string or single value
    if (typeof response === 'string' || typeof response === 'number') {
      // Check if this is an "Others: [specified text]" response
      if (typeof response === 'string' && response.startsWith('Others: ')) {
        return response; // Return as-is (e.g., "Others: Custom text")
      }
      
      // Handle rating responses with labels
      if (surveyQuestion && surveyQuestion.type === 'rating' && typeof response === 'number') {
        const scale = surveyQuestion.scale || {};
        const labels = scale.labels || [];
        const min = scale.min || 1;
        const label = labels[response - min];
        if (label) {
          return `${response} (${label})`;
        }
        return response.toString();
      }
      
      // Map to display text using question options
      if (surveyQuestion && surveyQuestion.options) {
        const option = surveyQuestion.options.find(opt => opt.value === response);
        return option ? option.text : response.toString();
      }
      return response.toString();
    }

    return JSON.stringify(response);
  };

  // Helper function to find question by text (same as SurveyApprovals)
  const findQuestionByText = (questionText, survey) => {
    if (!survey || !questionText) return null;
    
    // Search in sections
    if (survey.sections) {
      for (const section of survey.sections) {
        if (section.questions) {
          for (const question of section.questions) {
            if (question.text === questionText || question.questionText === questionText) {
              return question;
            }
          }
        }
      }
    }
    
    // Search in direct questions
    if (survey.questions) {
      for (const question of survey.questions) {
        if (question.text === questionText || question.questionText === questionText) {
          return question;
        }
      }
    }
    
    return null;
  };

  // Helper function to get operator description
  const getOperatorDescription = (operator) => {
    switch (operator) {
      case 'equals': return 'is exactly';
      case 'not_equals': return 'is not';
      case 'contains': return 'contains';
      case 'not_contains': return 'does not contain';
      case 'greater_than': return 'is greater than';
      case 'less_than': return 'is less than';
      case 'is_empty': return 'is empty';
      case 'is_not_empty': return 'is not empty';
      case 'is_selected': return 'is selected';
      case 'is_not_selected': return 'is not selected';
      default: return operator;
    }
  };

  // Helper function to find question by ID in survey data
  const findQuestionById = (questionId, survey) => {
    if (!survey || !questionId) return null;
    
    // Handle nested survey structure
    const actualSurvey = survey.survey || survey;
    
    // Search in sections
    if (actualSurvey?.sections) {
      for (const section of actualSurvey.sections) {
        if (section.questions) {
          for (const question of section.questions) {
            if (question.id === questionId) {
              return question;
            }
          }
        }
      }
    }
    
    // Search in direct questions
    if (actualSurvey?.questions) {
      for (const question of actualSurvey.questions) {
        if (question.id === questionId) {
          return question;
        }
      }
    }
    
    return null;
  };

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
        return responseValue.toString().toLowerCase() === conditionValue.toString().toLowerCase();
      case 'not_equals':
        return responseValue.toString().toLowerCase() !== conditionValue.toString().toLowerCase();
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

  // Helper function to format conditional logic (same as SurveyApprovals)
  const formatConditionalLogic = (conditions, survey) => {
    if (!conditions || conditions.length === 0) return null;
    
    // Handle nested survey structure
    const actualSurvey = survey?.survey || survey;
    
    const formattedConditions = conditions
      .filter(condition => condition.questionId && condition.operator && condition.value !== undefined && condition.value !== '__NOVALUE__')
      .map((condition, index) => {
        const targetQuestion = findQuestionById(condition.questionId, actualSurvey);
        const targetQuestionText = targetQuestion ? (targetQuestion.text || targetQuestion.questionText) : `Question ${condition.questionId}`;
        const operator = getOperatorDescription(condition.operator);
        const value = condition.value;
        
        return `${targetQuestionText} ${operator} "${value}"`;
      });

    if (formattedConditions.length === 0) return null;
    
    return formattedConditions.join(' AND ');
  };

  // Get all questions from survey
  const getAllQuestions = () => {
    const questions = [];
    
    if (!survey) {
      return questions;
    }
    
    // Handle nested survey structure
    const actualSurvey = survey.survey || survey;
    
    if (actualSurvey.sections) {
      actualSurvey.sections.forEach(section => {
        if (section.questions) {
          questions.push(...section.questions);
        }
      });
    }
    
    if (actualSurvey.questions) {
      questions.push(...actualSurvey.questions);
    }
    
    return questions;
  };

  const questions = getAllQuestions();
  const respondentInfo = getRespondentInfo(response.responses, response);

  // Handle response rejection
  const handleRejectResponse = async () => {
    if (!rejectReason.trim()) {
      showError('Please provide a reason for rejection');
      return;
    }

    setIsSubmitting(true);
    try {
      await surveyResponseAPI.rejectResponse(response._id, {
        reason: rejectReason,
        feedback: rejectReason
      });
      showSuccess('Response rejected successfully');
      onClose();
    } catch (error) {
      console.error('Error rejecting response:', error);
      showError('Failed to reject response. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle response approval
  const handleApproveResponse = async () => {
    setIsSubmitting(true);
    try {
      await surveyResponseAPI.approveResponse(response._id);
      showSuccess('Response approved successfully');
      onClose();
    } catch (error) {
      console.error('Error approving response:', error);
      showError('Failed to approve response. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Response Details
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Response ID: {response.responseId || response._id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Response Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Response Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Interviewer</p>
                    <p className="text-sm text-gray-600">
                      {response.interviewer 
                        ? `${response.interviewer.firstName} ${response.interviewer.lastName}${response.interviewer.email ? ` (${response.interviewer.email})` : ''}`
                        : 'Unknown'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Date</p>
                    <p className="text-sm text-gray-600">
                      {new Date(response.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Status</p>
                    <p className="text-sm text-gray-600">{response.status}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Duration</p>
                    <p className="text-sm text-gray-600">
                      {response.totalTimeSpent ? 
                        `${Math.round(response.totalTimeSpent / 60)} minutes` : 
                        'N/A'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Review Information - Only show if response has been reviewed */}
            {response.verificationData?.reviewer && (
              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Reviewed By</p>
                      <p className="text-sm text-gray-600">
                        {response.verificationData.reviewer?.firstName && response.verificationData.reviewer?.lastName
                          ? `${response.verificationData.reviewer.firstName} ${response.verificationData.reviewer.lastName}${response.verificationData.reviewer?.email ? ` (${response.verificationData.reviewer.email})` : ''}`
                          : response.verificationData.reviewer?.email || 'Unknown Reviewer'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Reviewed At</p>
                      <p className="text-sm text-gray-600">
                        {response.verificationData.reviewedAt
                          ? new Date(response.verificationData.reviewedAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <CheckCircle className={`w-5 h-5 ${
                      response.status === 'Approved' ? 'text-green-600' : 
                      response.status === 'Rejected' ? 'text-red-600' : 
                      'text-gray-400'
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Review Decision</p>
                      <p className={`text-sm font-semibold ${
                        response.status === 'Approved' ? 'text-green-600' : 
                        response.status === 'Rejected' ? 'text-red-600' : 
                        'text-gray-600'
                      }`}>
                        {response.status === 'Approved' ? 'Approved' : 
                         response.status === 'Rejected' ? 'Rejected' : 
                         response.status}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Demographics */}
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Demographics</h3>
              {(() => {
                // Extract AC and polling station from responses
                const { ac: acFromResponse, pollingStation: pollingStationFromResponse, groupName: groupNameFromResponse } = getACAndPollingStationFromResponses(response.responses, survey);
                const displayAC = acFromResponse || response.selectedPollingStation?.acName || response.selectedAC || respondentInfo.ac;
                // Format polling station to show both code and name
                const pollingStationValue = pollingStationFromResponse || response.selectedPollingStation?.stationName;
                const displayPollingStation = formatPollingStationDisplay(pollingStationValue, response.selectedPollingStation);
                const displayGroupName = groupNameFromResponse || response.selectedPollingStation?.groupName;
                const displayPC = response.selectedPollingStation?.pcName;
                const displayDistrict = response.selectedPollingStation?.district || respondentInfo.district;
                
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Name</p>
                      <p className="text-sm text-gray-600">{respondentInfo.name}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700">Gender</p>
                      <p className="text-sm text-gray-600">{respondentInfo.gender}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700">Age</p>
                      <p className="text-sm text-gray-600">{respondentInfo.age}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700">City</p>
                      <p className="text-sm text-gray-600">{respondentInfo.city}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700">District</p>
                      <p className="text-sm text-gray-600">{displayDistrict}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700">State</p>
                      <p className="text-sm text-gray-600">{respondentInfo.state}</p>
                    </div>
                    
                    {displayAC && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Assembly Constituency (AC)</p>
                        <p className="text-sm text-gray-600">{displayAC}</p>
                      </div>
                    )}
                    
                    {displayPC && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Parliamentary Constituency (PC)</p>
                        <p className="text-sm text-gray-600">{displayPC} {response.selectedPollingStation?.pcNo ? `(${response.selectedPollingStation.pcNo})` : ''}</p>
                      </div>
                    )}
                    
                    {displayPollingStation && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Polling Station</p>
                        <p className="text-sm text-gray-600">{displayPollingStation}</p>
                      </div>
                    )}
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700">Lok Sabha</p>
                      <p className="text-sm text-gray-600">{displayPC || respondentInfo.lokSabha}</p>
                    </div>
                    
                    {response.location && (
                      <div className="md:col-span-2 lg:col-span-3">
                        <p className="text-sm font-medium text-gray-700">GPS Coordinates</p>
                        <p className="text-sm text-gray-600 font-mono">
                          ({response.location.latitude?.toFixed(4)}, {response.location.longitude?.toFixed(4)})
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Call Information - Only for CATI interviews */}
            {response.interviewMode === 'cati' && catiCallDetails && (
              <div className="mt-6 bg-white border border-gray-200 rounded-lg p-6 mb-6">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center text-lg">
                  <PhoneCall className="w-5 h-5 mr-2 text-blue-600" />
                  Call Information
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 font-medium">Call Status:</span>
                    <div className="mt-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        catiCallDetails.callStatus === 'completed' || catiCallDetails.callStatus === 'answered' 
                          ? 'bg-green-100 text-green-800' 
                          : catiCallDetails.callStatus === 'failed' || catiCallDetails.callStatus === 'busy'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {catiCallDetails.callStatusDescription || catiCallDetails.statusDescription || catiCallDetails.callStatus}
                      </span>
                    </div>
                  </div>
                  {(catiCallDetails.callStatusCode || catiCallDetails.originalStatusCode) && (
                    <div>
                      <span className="text-gray-600 font-medium">Status Code:</span>
                      <span className="ml-2 font-medium">{catiCallDetails.callStatusCode || catiCallDetails.originalStatusCode}</span>
                    </div>
                  )}
                  {catiCallDetails.callId && (
                    <div className="col-span-2">
                      <span className="text-gray-600 font-medium">Call ID:</span>
                      <span className="ml-2 font-medium text-xs font-mono break-all">{catiCallDetails.callId}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600 font-medium">From Number:</span>
                    <span className="ml-2 font-medium">{catiCallDetails.fromNumber || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">To Number:</span>
                    <span className="ml-2 font-medium">{catiCallDetails.toNumber || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Call Duration:</span>
                    <span className="ml-2 font-medium">
                      {catiCallDetails.callDuration ? formatDuration(catiCallDetails.callDuration) : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Talk Duration:</span>
                    <span className="ml-2 font-medium">
                      {catiCallDetails.talkDuration ? formatDuration(catiCallDetails.talkDuration) : 'N/A'}
                    </span>
                  </div>
                  {(catiCallDetails.startTime || catiCallDetails.callStartTime) && (
                    <div>
                      <span className="text-gray-600 font-medium">Call Start Time:</span>
                      <span className="ml-2 font-medium">
                        {new Date(catiCallDetails.startTime || catiCallDetails.callStartTime).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {(catiCallDetails.endTime || catiCallDetails.callEndTime) && (
                    <div>
                      <span className="text-gray-600 font-medium">Call End Time:</span>
                      <span className="ml-2 font-medium">
                        {new Date(catiCallDetails.endTime || catiCallDetails.callEndTime).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {catiCallDetails.ringDuration && catiCallDetails.ringDuration > 0 && (
                    <div>
                      <span className="text-gray-600 font-medium">Ring Duration:</span>
                      <span className="ml-2 font-medium">
                        {formatDuration(catiCallDetails.ringDuration)}
                      </span>
                    </div>
                  )}
                  {catiCallDetails.hangupCause && (
                    <div>
                      <span className="text-gray-600 font-medium">Hangup Cause:</span>
                      <span className="ml-2 font-medium">{catiCallDetails.hangupCause}</span>
                    </div>
                  )}
                  {catiCallDetails.hangupBySource && (
                    <div>
                      <span className="text-gray-600 font-medium">Hangup By:</span>
                      <span className="ml-2 font-medium">{catiCallDetails.hangupBySource}</span>
                    </div>
                  )}
                  {catiCallDetails.recordingUrl && (
                    <div className="col-span-2">
                      <span className="text-gray-600 font-medium">Recording Available:</span>
                      <span className="ml-2 font-medium text-green-600">Yes</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {response.interviewMode === 'cati' && !catiCallDetails && (
              <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" />
                  <div>
                    <h4 className="font-medium text-yellow-900">Call Information Not Available</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Call details could not be loaded. This may be because the call record was not found or the interview was completed before the call was made.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* GPS Location Map - Only for CAPI interviews */}
            {response.location && response.interviewMode !== 'cati' && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Interview Location</h3>
                <div className="mb-3">
                  <p className="text-sm text-gray-600 mb-1">
                    <strong>Address:</strong> {response.location.address || 'Address not available'}
                  </p>
                  {response.location.accuracy && (
                    <p className="text-sm text-gray-600">
                      <strong>Accuracy:</strong> ±{Math.round(response.location.accuracy)} meters
                    </p>
                  )}
                </div>
                <div className="w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                  <iframe
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${response.location.longitude-0.01},${response.location.latitude-0.01},${response.location.longitude+0.01},${response.location.latitude+0.01}&layer=mapnik&marker=${response.location.latitude},${response.location.longitude}`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    title="Interview Location"
                  />
                </div>
                <div className="mt-2 text-center">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${response.location.latitude}&mlon=${response.location.longitude}&zoom=15`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm underline"
                  >
                    View on OpenStreetMap
                  </a>
                </div>
              </div>
            )}

            {/* Audio Recording / Call Recording */}
            {response.interviewMode === 'cati' && catiCallDetails?.recordingUrl ? (
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Headphones className="w-5 h-5 mr-2" />
                  Call Recording
                </h3>
                <div className="space-y-3">
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Call Duration: {catiCallDetails?.callDuration ? formatDuration(catiCallDetails.callDuration) : 'N/A'}</div>
                    <div>Talk Duration: {catiCallDetails?.talkDuration ? formatDuration(catiCallDetails.talkDuration) : 'N/A'}</div>
                    <div>Format: MP3</div>
                    <div>Status: {catiCallDetails?.callStatusDescription || catiCallDetails?.callStatus || 'N/A'}</div>
                  </div>
                  {catiRecordingBlobUrl ? (
                    <>
                      <audio
                        src={catiRecordingBlobUrl}
                        onEnded={() => setAudioPlaying(false)}
                        onPause={() => setAudioPlaying(false)}
                        onPlay={() => setAudioPlaying(true)}
                        className="w-full"
                        controls
                      />
                      <a
                        href={catiRecordingBlobUrl}
                        download={`cati_recording_${catiCallDetails?.callId || catiCallDetails?._id || 'recording'}.mp3`}
                        className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Recording
                      </a>
                    </>
                  ) : (
                    <div className="text-sm text-gray-500">Loading recording...</div>
                  )}
                </div>
              </div>
            ) : response.interviewMode === 'cati' && !catiCallDetails?.recordingUrl ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <PhoneCall className="w-5 h-5 mr-2" />
                  Call Recording
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <Headphones className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">No call recording available</p>
                </div>
              </div>
            ) : response.audioRecording?.audioUrl ? (
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Headphones className="w-5 h-5 mr-2" />
                  Audio Recording (CAPI)
                </h3>
                <div className="space-y-3">
                  <div className="text-sm text-gray-600 space-y-1">
                    {response.audioRecording.recordingDuration && (
                      <div>Duration: {formatDuration(response.audioRecording.recordingDuration)}</div>
                    )}
                    {response.audioRecording.format && (
                      <div>Format: {response.audioRecording.format.toUpperCase()}</div>
                    )}
                    {response.audioRecording.fileSize && (
                      <div>File Size: {(response.audioRecording.fileSize / 1024 / 1024).toFixed(2)} MB</div>
                    )}
                  </div>
                    <audio
                    data-response-id={response._id || response.responseId}
                      src={(() => {
                        let audioUrl = response.audioRecording.audioUrl || '';
                        if (!audioUrl) return '';
                        
                        // Handle localhost URLs in production - replace with current origin
                        if (audioUrl.includes('localhost')) {
                          // Extract the path from the localhost URL
                          const urlMatch = audioUrl.match(/https?:\/\/localhost:\d+(.+)/);
                          if (urlMatch && urlMatch[1]) {
                            // Use current origin (which is https://opine.exypnossolutions.com in production)
                            audioUrl = `${window.location.origin}${urlMatch[1]}`;
                          } else {
                            // If no path found, try to replace the entire localhost URL
                            audioUrl = audioUrl.replace(/https?:\/\/localhost:\d+/, window.location.origin);
                          }
                        }
                        // Handle relative paths (starting with /)
                        else if (audioUrl.startsWith('/')) {
                          // In production, use current origin; in dev, use API base URL
                          if (window.location.origin.includes('https://')) {
                            audioUrl = `${window.location.origin}${audioUrl}`;
                          } else {
                            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
                            audioUrl = `${apiBaseUrl}${audioUrl}`;
                          }
                        }
                        // If it's already a full HTTPS URL, use it as is
                        else if (audioUrl.startsWith('https://')) {
                          return audioUrl;
                        }
                        // If it's HTTP URL in production, convert to HTTPS
                        else if (audioUrl.startsWith('http://') && window.location.origin.includes('https://')) {
                          audioUrl = audioUrl.replace('http://', 'https://');
                        }
                        
                        return audioUrl;
                      })()}
                      onEnded={() => setAudioPlaying(false)}
                      onPause={() => setAudioPlaying(false)}
                    onPlay={() => setAudioPlaying(true)}
                      onError={(e) => {
                        console.error('Audio element error:', e);
                        showError('Failed to load audio file. The file may have been deleted or moved.');
                        setAudioPlaying(false);
                      }}
                      className="w-full"
                      controls
                    />
                  {response.audioRecording.audioUrl && (
                    <a
                      href={(() => {
                        let audioUrl = response.audioRecording.audioUrl || '';
                        if (audioUrl.startsWith('/')) {
                          return `${window.location.origin}${audioUrl}`;
                        }
                        return audioUrl;
                      })()}
                      download={`capi_recording_${response.responseId || response._id || 'recording'}.${response.audioRecording.format || 'webm'}`}
                      className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Recording
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Audio Recording</h3>
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <Headphones className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">No audio recording available</p>
                </div>
              </div>
            )}

            {/* Survey Responses */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Survey Responses</h3>
              <div className="space-y-4">
                {(() => {
                  const { regularQuestions } = separateQuestions(response.responses, survey);
                  return regularQuestions.map((responseItem, index) => {
                    try {
                      // Find the corresponding question in the survey to get conditional logic
                      // The survey object has a nested structure: {survey: {...}}
                      const actualSurvey = survey.survey || survey;
                      const surveyQuestion = findQuestionByText(responseItem.questionText, actualSurvey);
                      const hasConditions = surveyQuestion?.conditions && surveyQuestion.conditions.length > 0;
                      const conditionsMet = hasConditions ? areConditionsMet(surveyQuestion.conditions, response.responses) : true;
                      
                      return (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 mb-1">
                                Q{index + 1}: {responseItem.questionText || 'Question'}
                              </h4>
                            {responseItem.questionDescription && (
                              <p className="text-sm text-gray-600 mb-2">
                                {responseItem.questionDescription}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            {hasConditions && conditionsMet && (
                              <div className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-800 rounded-md">
                                <Zap className="w-3 h-3" />
                                <span className="text-xs font-medium">Condition Met</span>
                              </div>
                            )}
                            {hasConditions && !conditionsMet && (
                              <div className="flex items-center space-x-1 px-2 py-1 bg-red-100 text-red-800 rounded-md">
                                <Zap className="w-3 h-3" />
                                <span className="text-xs font-medium">Condition Not Met</span>
                              </div>
                            )}
                            {responseItem.isSkipped ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                <SkipForward className="w-3 h-3 mr-1" />
                                Skipped
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Answered
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Conditional Logic Display */}
                        {hasConditions && (
                          <div className={`mb-3 p-3 border rounded-lg ${
                            conditionsMet 
                              ? 'bg-green-50 border-green-200' 
                              : 'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center space-x-2 mb-2">
                              <Zap className={`w-4 h-4 ${conditionsMet ? 'text-green-600' : 'text-red-600'}`} />
                              <span className={`text-sm font-medium ${conditionsMet ? 'text-green-800' : 'text-red-800'}`}>
                                Conditional Logic:
                              </span>
                            </div>
                            <p className={`text-sm leading-relaxed ${conditionsMet ? 'text-green-700' : 'text-red-700'}`}>
                              {conditionsMet 
                                ? `This question appeared because: ${formatConditionalLogic(surveyQuestion.conditions, actualSurvey)}`
                                : `This question was skipped because: ${formatConditionalLogic(surveyQuestion.conditions, actualSurvey)} (condition not met)`
                              }
                            </p>
                          </div>
                        )}
                        
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">Answer:</span>{' '}
                            {responseItem.isSkipped ? (
                              <span className="text-yellow-600 italic">Question was skipped</span>
                            ) : (
                              formatResponseDisplay(responseItem.response, surveyQuestion)
                            )}
                          </p>
                          {responseItem.responseTime > 0 && (
                            <p className="text-xs text-gray-500 mt-2">
                              Response time: {responseItem.responseTime}s
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  } catch (error) {
                    console.error('Error rendering response item:', error, responseItem);
                    return (
                      <div key={index} className="border border-red-200 rounded-lg p-4 bg-red-50">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-red-900 mb-1">
                              {responseItem.questionText || 'Question (Error)'}
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Error
                            </span>
                          </div>
                        </div>
                        <div className="bg-red-100 rounded-lg p-3">
                          <p className="text-sm text-red-700">
                            <span className="font-medium">Error:</span> Failed to render this response item
                          </p>
                        </div>
                      </div>
                    );
                  }
                });
                })()}
              </div>
            </div>

            {/* Response Status */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Response Status</h3>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      response.status === 'Approved' 
                        ? 'bg-green-100 text-green-800' 
                        : response.status === 'Rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {response.status === 'Pending_Approval' ? 'Pending Approval' : response.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {!hideActions && (
              <div className="flex items-center justify-end space-x-4">
                {response.status !== 'Rejected' && (
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    <span>Reject Response</span>
                  </button>
                )}
                {response.status === 'Pending_Approval' && (
                  <button
                    onClick={handleApproveResponse}
                    disabled={isSubmitting}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>{isSubmitting ? 'Approving...' : 'Approve Response'}</span>
                  </button>
                )}
              </div>
            )}

            {/* Reject Form */}
            {showRejectForm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Reject Response
                    </h3>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Reason for rejection
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        rows={4}
                        placeholder="Please provide a reason for rejecting this response..."
                      />
                    </div>
                    <div className="flex items-center justify-end space-x-3">
                      <button
                        onClick={() => setShowRejectForm(false)}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRejectResponse}
                        disabled={isSubmitting || !rejectReason.trim()}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {isSubmitting ? 'Rejecting...' : 'Reject Response'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResponseDetailsModal;