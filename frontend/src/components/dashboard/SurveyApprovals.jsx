import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Search,
  Filter,
  Eye,
  Play,
  Pause,
  Volume2,
  Calendar,
  Clock,
  User,
  Users,
  CheckCircle,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Headphones,
  Download,
  RefreshCw,
  BarChart3,
  Target,
  Award,
  Zap,
  TrendingUp,
  Shield,
  CheckSquare,
  MapPin
} from 'lucide-react';
import { surveyResponseAPI, surveyAPI } from '../../services/api';

const SurveyApprovals = () => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [allResponses, setAllResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [ageRange, setAgeRange] = useState({ min: '', max: '' });
  const [sortBy, setSortBy] = useState('endTime');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [showResponseDetails, setShowResponseDetails] = useState(false);
  const [fullSurveyData, setFullSurveyData] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(null);
  const [audioElement, setAudioElement] = useState(null);
  const [verificationForm, setVerificationForm] = useState({
    audioQuality: '',
    questionAccuracy: '',
    dataAccuracy: '',
    locationMatch: '',
    customFeedback: ''
  });
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);
  const { showSuccess, showError } = useToast();

  // Helper function to get target audience from survey object
  const getTargetAudience = (interview) => {
    // First try to get from full survey data if available
    if (fullSurveyData && fullSurveyData._id === interview?.survey?._id) {
      return fullSurveyData.targetAudience;
    }
    // Fallback to interview survey data
    return interview?.survey?.targetAudience || interview?.survey?.survey?.targetAudience;
  };

  // Fetch full survey data when modal opens
  // For quality agents, use the survey data already populated in the interview object
  // For company admins, try to fetch additional details if needed
  const fetchFullSurveyData = async (surveyId, interviewSurveyData) => {
    try {
      // If we already have survey data from the interview, use it (especially for quality agents)
      if (interviewSurveyData && interviewSurveyData._id === surveyId) {
        setFullSurveyData(interviewSurveyData);
        return;
      }
      
      // For company admins, try to fetch additional details if needed
      if (user?.userType !== 'quality_agent') {
        // Try the direct survey endpoint first
        try {
          const response = await surveyAPI.getSurvey(surveyId);
          
          if (response.success) {
            setFullSurveyData(response.data.survey); // Use the nested survey object
            return;
          }
        } catch (directError) {
          console.log('Direct API failed, trying available surveys endpoint:', directError);
        }
        
        // Fallback: Try to get from available surveys (like AvailableSurveys does)
        try {
          const availableResponse = await surveyAPI.getAvailableSurveys();
          
          if (availableResponse.success) {
            const survey = availableResponse.data.surveys?.find(s => s._id === surveyId);
            if (survey) {
              setFullSurveyData(survey);
              return;
            }
          }
        } catch (availableError) {
          console.log('Available surveys API also failed:', availableError);
        }
      }
      
      // If all else fails, use the interview survey data if available
      if (interviewSurveyData) {
        setFullSurveyData(interviewSurveyData);
      } else {
        console.error('All methods failed to fetch survey data');
      }
    } catch (error) {
      console.error('Error fetching full survey data:', error);
      // Fallback to interview survey data if available
      if (interviewSurveyData) {
        setFullSurveyData(interviewSurveyData);
      }
    }
  };

  // Fetch all responses for stats
  const fetchAllResponses = async () => {
    try {
      // For quality agents, we don't need to fetch all company responses
      // Stats will be calculated from the filtered interviews array
      if (user?.userType === 'quality_agent') {
        return;
      }
      const response = await surveyResponseAPI.getDebugResponses();
      setAllResponses(response.data.responses || []);
    } catch (error) {
      console.error('Error fetching all responses:', error);
    }
  };

  // Fetch pending approval interviews for the company
  useEffect(() => {
    fetchPendingApprovals();
    fetchAllResponses(); // Also fetch all responses for stats
  }, [searchTerm, filterGender, filterMode, ageRange, sortBy, sortOrder]);

  const fetchPendingApprovals = async () => {
    try {
      setLoading(true);
      const params = {
        search: searchTerm,
        gender: filterGender,
        mode: filterMode,
        ageMin: ageRange.min,
        ageMax: ageRange.max,
        sortBy,
        sortOrder
      };
      
      const response = await surveyResponseAPI.getPendingApprovals(params);
      
      setInterviews(response.data.interviews || []);
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      showError('Failed to fetch pending approvals');
    } finally {
      setLoading(false);
    }
  };

  // Handle verification form input changes
  const handleVerificationFormChange = (field, value) => {
    setVerificationForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Reset verification form when modal opens/closes
  const resetVerificationForm = () => {
    setVerificationForm({
      audioQuality: '',
      questionAccuracy: '',
      dataAccuracy: '',
      locationMatch: '',
      customFeedback: ''
    });
  };

  // Cleanup audio when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup: stop all audio and remove dynamically created audio elements
      const allAudioElements = document.querySelectorAll('audio[data-interview-id]');
      allAudioElements.forEach(el => {
        el.pause();
        el.currentTime = 0;
        // Only remove dynamically created elements (not the one in modal)
        if (!el.closest('.bg-gray-50')) {
          el.remove();
        }
      });
      setAudioPlaying(null);
    };
  }, []);

  // Cleanup audio when modal closes
  const handleCloseModal = () => {
    // Stop any playing audio
    const allAudioElements = document.querySelectorAll('audio[data-interview-id]');
    allAudioElements.forEach(el => {
      el.pause();
      el.currentTime = 0;
    });
    if (audioElement) {
      audioElement.pause();
      setAudioElement(null);
    }
    setAudioPlaying(null);
    setShowResponseDetails(false);
    setSelectedInterview(null);
    setFullSurveyData(null); // Clear full survey data
  };

  // Check if form is complete and valid
  const isVerificationFormValid = () => {
    return verificationForm.audioQuality !== '' &&
           verificationForm.questionAccuracy !== '' &&
           verificationForm.dataAccuracy !== '' &&
           verificationForm.locationMatch !== '';
  };

  // Determine approval status based on form responses
  const getApprovalStatus = () => {
    // Audio quality below 3 = reject
    if (parseInt(verificationForm.audioQuality) < 3) {
      return 'rejected';
    }
    
    // Any "No" answers = reject
    if (verificationForm.questionAccuracy === 'No' ||
        verificationForm.dataAccuracy === 'No' ||
        verificationForm.locationMatch === 'No') {
      return 'rejected';
    }
    
    // All criteria met = approve
    return 'approved';
  };

  // Submit verification form
  const handleSubmitVerification = async () => {
    if (!isVerificationFormValid()) {
      showError('Please answer all required questions before submitting');
      return;
    }

    try {
      setIsSubmittingVerification(true);
      
      const approvalStatus = getApprovalStatus();
      const verificationData = {
        responseId: selectedInterview.responseId,
        status: approvalStatus,
        verificationCriteria: {
          audioQuality: parseInt(verificationForm.audioQuality),
          questionAccuracy: verificationForm.questionAccuracy,
          dataAccuracy: verificationForm.dataAccuracy,
          locationMatch: verificationForm.locationMatch
        },
        feedback: verificationForm.customFeedback || ''
      };

      // Submit verification to backend
      const response = await surveyResponseAPI.submitVerification(verificationData);
      
      if (!response.success) {
        throw new Error(response.message || 'Verification submission failed');
      }
      
      if (approvalStatus === 'approved') {
        showSuccess('Survey response approved successfully!');
      } else {
        showSuccess('Survey response has been rejected with feedback provided to interviewer.');
      }
      
      handleCloseModal();
      
      // Force refresh the data
      await fetchPendingApprovals();
      await fetchAllResponses();
      
    } catch (error) {
      console.error('Error submitting verification:', error);
      showError('Failed to submit verification. Please try again.');
    } finally {
      setIsSubmittingVerification(false);
    }
  };

  // Helper function to get respondent info from responses
  const getRespondentInfo = (responses) => {
    const nameResponse = responses.find(r => 
      r.questionText.toLowerCase().includes('name') || 
      r.questionText.toLowerCase().includes('respondent')
    );
    const genderResponse = responses.find(r => 
      r.questionText.toLowerCase().includes('gender') || 
      r.questionText.toLowerCase().includes('sex')
    );
    const ageResponse = responses.find(r => 
      r.questionText.toLowerCase().includes('age') || 
      r.questionText.toLowerCase().includes('year')
    );

    return {
      name: nameResponse?.response || 'Not Available',
      gender: genderResponse?.response || 'Not Available',
      age: ageResponse?.response || 'Not Available'
    };
  };

  // Helper function to parse age from response
  const parseAge = (ageResponse) => {
    if (!ageResponse || ageResponse === 'Not Available') return null;
    
    // Try to extract number from the response
    const ageMatch = ageResponse.toString().match(/\d+/);
    return ageMatch ? parseInt(ageMatch[0]) : null;
  };

  // Helper function to check if age is in range
  const isAgeInRange = (age, min, max) => {
    if (!age) return false;
    if (min && age < parseInt(min)) return false;
    if (max && age > parseInt(max)) return false;
    return true;
  };

  // Helper function to format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Helper function to format date
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper function to get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending_Approval':
        return 'bg-yellow-100 text-yellow-800';
      case 'Approved':
        return 'bg-green-100 text-green-800';
      case 'Rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper function to get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'Pending_Approval':
        return <AlertCircle className="w-4 h-4" />;
      case 'Approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'Rejected':
        return <X className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm('');
    setFilterGender('');
    setFilterMode('');
    setAgeRange({ min: '', max: '' });
  };

  // Helper function to get active filter count
  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (filterGender) count++;
    if (filterMode) count++;
    if (ageRange.min || ageRange.max) count++;
    return count;
  };

  // Helper function to get operator description for conditional logic
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
    if (survey?.sections) {
      for (const section of survey.sections) {
        if (section.questions) {
          for (const question of section.questions) {
            if (question.id === questionId) {
              return question;
            }
          }
        }
      }
    }
    return null;
  };

  // Helper function to find question by text in survey data
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

  // Helper function to calculate effective questions (only questions that were actually shown)
  const calculateEffectiveQuestions = (responses, survey) => {
    return responses?.filter(r => {
      // If not skipped, it was shown and answered
      if (!r.isSkipped) return true;
      
      // If skipped, check if it was due to unmet conditions
      const surveyQuestion = findQuestionByText(r.questionText, survey);
      const hasConditions = surveyQuestion?.conditions && surveyQuestion.conditions.length > 0;
      
      if (hasConditions) {
        // Check if conditions were met
        const conditionsMet = areConditionsMet(surveyQuestion.conditions, responses);
        
        // If conditions were not met, this question was never shown
        if (!conditionsMet) {
          return false;
        }
      }
      
      // If no conditions or conditions were met, user saw it and chose to skip
      return true;
    }).length || 0;
  };

  // Helper function to format conditional logic
  const formatConditionalLogic = (conditions, survey) => {
    if (!conditions || conditions.length === 0) return null;
    
    const formattedConditions = conditions
      .filter(condition => condition.questionId && condition.operator && condition.value !== undefined && condition.value !== '__NOVALUE__')
      .map((condition, index) => {
        const targetQuestion = findQuestionById(condition.questionId, survey);
        const targetQuestionText = targetQuestion ? targetQuestion.text : `Question ${condition.questionId}`;
        const operator = getOperatorDescription(condition.operator);
        const value = condition.value;
        
        return `${targetQuestionText} ${operator} "${value}"`;
      });

    if (formattedConditions.length === 0) return null;
    
    return formattedConditions.join(' AND ');
  };

  // Helper function to format response display text
  const formatResponseDisplay = (response, surveyQuestion) => {
    if (!response || response === null || response === undefined) {
      return 'No response';
    }

    // If it's an array (multiple selections)
    if (Array.isArray(response)) {
      if (response.length === 0) return 'No selections';
      
      // Map each value to its display text using the question options
      const displayTexts = response.map(value => {
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
      // Map to display text using question options
      if (surveyQuestion && surveyQuestion.options) {
        const option = surveyQuestion.options.find(opt => opt.value === response);
        return option ? option.text : response.toString();
      }
      return response.toString();
    }

    return JSON.stringify(response);
  };

  const filteredInterviews = interviews.filter(interview => {
    const respondentInfo = getRespondentInfo(interview.responses);
    
    // Search filter - now includes respondent name
    const matchesSearch = !searchTerm || 
      interview.survey?.surveyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interview.responseId?.toString().includes(searchTerm) ||
      interview.sessionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      respondentInfo.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Gender filter
    const matchesGender = !filterGender || respondentInfo.gender.toLowerCase() === filterGender.toLowerCase();
    
    // Mode filter
    const matchesMode = !filterMode || interview.interviewMode?.toLowerCase() === filterMode.toLowerCase();
    
    // Age filter
    const age = parseAge(respondentInfo.age);
    const matchesAge = isAgeInRange(age, ageRange.min, ageRange.max);
    
    return matchesSearch && matchesGender && matchesMode && matchesAge;
  });

  const sortedInterviews = [...filteredInterviews].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    
    if (sortBy === 'endTime') {
      return sortOrder === 'asc' ? new Date(aValue) - new Date(bValue) : new Date(bValue) - new Date(aValue);
    }
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    return aValue < bValue ? 1 : -1;
  });

  // Audio playback functions - now controls the HTML audio element
  const handlePlayAudio = (audioUrl, interviewId) => {
    if (audioPlaying === interviewId) {
      // Pause current audio
      const audioEl = document.querySelector(`audio[data-interview-id="${interviewId}"]`);
      if (audioEl) {
        audioEl.pause();
        setAudioPlaying(null);
      }
    } else {
      // Stop any currently playing audio
      const allAudioElements = document.querySelectorAll('audio[data-interview-id]');
      allAudioElements.forEach(el => {
        if (el.getAttribute('data-interview-id') !== interviewId) {
          el.pause();
          el.currentTime = 0;
        }
      });
      
      // Find or create the audio element for this interview
      let audioEl = document.querySelector(`audio[data-interview-id="${interviewId}"]`);
      
      // If audio element doesn't exist, create it dynamically
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.setAttribute('data-interview-id', interviewId);
        
        // Construct the audio URL
        let audioSrc = '';
        if (!audioUrl) {
          audioSrc = '';
        } else if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
          if (audioUrl.includes('localhost') && window.location.protocol === 'https:') {
            const urlPath = audioUrl.replace(/^https?:\/\/[^\/]+/, '');
            audioSrc = `${window.location.origin}${urlPath}`;
          } else {
            audioSrc = audioUrl;
          }
        } else {
          const isProduction = window.location.protocol === 'https:' || window.location.hostname !== 'localhost';
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (isProduction ? '' : 'http://localhost:5000');
          audioSrc = `${API_BASE_URL}${audioUrl}`;
        }
        
        audioEl.src = audioSrc;
        audioEl.style.display = 'none';
        audioEl.onended = () => setAudioPlaying(null);
        audioEl.onpause = () => {
          // Only clear if not manually paused by user clicking pause
          if (audioPlaying === interviewId) {
            setAudioPlaying(null);
          }
        };
        audioEl.onerror = (e) => {
          console.error('Audio element error:', e);
          showError('Failed to load audio file');
          setAudioPlaying(null);
        };
        
        document.body.appendChild(audioEl);
      }
      
      // Play the audio
      if (audioEl) {
        audioEl.play().catch(error => {
          console.error('Audio play error:', error);
          showError('Failed to play audio');
          setAudioPlaying(null);
        });
        setAudioPlaying(interviewId);
      }
    }
  };

  // Calculate statistics
  // For quality agents, use the filtered interviews array (already filtered by backend)
  // For company admins, use allResponses for overall company stats
  const stats = user?.userType === 'quality_agent' ? {
    // Quality agent stats - calculated from their assigned interviews only
    // Note: interviews array only contains pending approvals (filtered by backend)
    // Approved/Rejected counts would require fetching all responses for quality agent
    total: interviews.length, // Total pending interviews assigned to this quality agent
    pending: interviews.length, // All interviews in the array are pending
    withAudio: interviews.filter(i => i.audioRecording?.hasAudio).length,
    completed: 0, // Approved responses are not in pending list - would need separate API call
    rejected: 0 // Rejected responses are not in pending list - would need separate API call
  } : {
    // Company admin stats - calculated from all company responses
    total: allResponses.filter(i => i.status === 'Pending_Approval').length,
    pending: allResponses.filter(i => i.status === 'Pending_Approval').length,
    withAudio: allResponses.filter(i => i.audioRecording?.hasAudio).length,
    completed: allResponses.filter(i => i.status === 'Approved').length,
    rejected: allResponses.filter(i => i.status === 'Rejected').length
  };


  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Survey Approvals</h1>
          <p className="text-gray-600">Review and verify pending survey responses for quality assurance</p>
        </div>
        <button
          onClick={fetchPendingApprovals}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h3 className="text-2xl font-bold text-gray-900">{stats.total}</h3>
              <p className="text-sm text-gray-600">Total Pending</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-red-50 text-red-600">
              <X className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h3 className="text-2xl font-bold text-gray-900">{stats.rejected}</h3>
              <p className="text-sm text-gray-600">Rejected</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-green-50 text-green-600">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h3 className="text-2xl font-bold text-gray-900">{stats.completed}</h3>
              <p className="text-sm text-gray-600">Approved</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-purple-50 text-purple-600">
              <Headphones className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h3 className="text-2xl font-bold text-gray-900">{stats.withAudio}</h3>
              <p className="text-sm text-gray-600">With Audio</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-600 mb-1 invisible">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by survey title, respondent name, response ID, or session ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>
          
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 mb-1">Gender</label>
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">All Genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 mb-1">Interview Mode</label>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">All Modes</option>
              <option value="capi">CAPI</option>
              <option value="cati">CATI</option>
              <option value="online">Online</option>
            </select>
          </div>
          
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 mb-1">Age Range</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                value={ageRange.min}
                onChange={(e) => setAgeRange(prev => ({ ...prev, min: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              <span className="flex items-center text-gray-500">-</span>
              <input
                type="number"
                placeholder="Max"
                value={ageRange.max}
                onChange={(e) => setAgeRange(prev => ({ ...prev, max: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
          
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="endTime">Latest First</option>
              <option value="startTime">Earliest First</option>
              <option value="totalTimeSpent">Duration</option>
              <option value="responseId">Response ID</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={clearAllFilters}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200"
            >
              Clear All
            </button>
          </div>
        </div>
        
        {/* Active Filters Display */}
        {getActiveFilterCount() > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">Active filters:</span>
              {searchTerm && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Search: {searchTerm}
                  <button
                    onClick={() => setSearchTerm('')}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filterGender && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Gender: {filterGender}
                  <button
                    onClick={() => setFilterGender('')}
                    className="ml-1 text-green-600 hover:text-green-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filterMode && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  Mode: {filterMode.toUpperCase()}
                  <button
                    onClick={() => setFilterMode('')}
                    className="ml-1 text-purple-600 hover:text-purple-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {(ageRange.min || ageRange.max) && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  Age: {ageRange.min || '0'} - {ageRange.max || '∞'}
                  <button
                    onClick={() => setAgeRange({ min: '', max: '' })}
                    className="ml-1 text-purple-600 hover:text-purple-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading pending approvals...</span>
        </div>
      ) : sortedInterviews.length === 0 ? (
        <div className="text-center py-12">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Approvals</h3>
          <p className="text-gray-600">All survey responses have been reviewed and approved.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{width: '240px'}}>
                  Interview Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Respondent Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Audio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedInterviews.map((interview) => {
                const respondentInfo = getRespondentInfo(interview.responses);
                return (
                  <tr key={interview._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4" style={{width: '240px'}}>
                      <div className="max-w-none">
                        <div 
                          className="text-sm font-medium text-gray-900 cursor-help"
                          style={{width: '200px', wordWrap: 'break-word'}}
                          title={interview.survey?.surveyName || 'Unknown Survey'}
                        >
                          {interview.survey?.surveyName 
                            ? (interview.survey.surveyName.length > 60 
                                ? `${interview.survey.surveyName.substring(0, 60)}...` 
                                : interview.survey.surveyName)
                            : 'Unknown Survey'
                          }
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {interview.responseId}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatDate(interview.endTime)}
                        </div>
                        {interview.interviewMode && (
                          <div className="text-xs mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              interview.interviewMode === 'capi' 
                                ? 'bg-blue-100 text-blue-800' 
                                : interview.interviewMode === 'cati' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-purple-100 text-purple-800'
                            }`}>
                              {interview.interviewMode.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div className="flex items-center mb-1">
                          <User className="w-4 h-4 mr-1 text-gray-400" />
                          <span className="font-medium">{respondentInfo.name}</span>
                        </div>
                        <div className="flex items-center mb-1">
                          <Users className="w-4 h-4 mr-1 text-gray-400" />
                          <span className="capitalize">{respondentInfo.gender}</span>
                        </div>
                        <div className="flex items-center mb-1">
                          <Calendar className="w-4 h-4 mr-1 text-gray-400" />
                          <span>{respondentInfo.age}</span>
                        </div>
                        {interview.selectedAC && (
                          <div className="flex items-center mb-1">
                            <Target className="w-4 h-4 mr-1 text-blue-400" />
                            <span className="text-blue-600 font-medium">{interview.selectedAC}</span>
                          </div>
                        )}
                        {interview.location && (
                          <div className="flex items-center">
                            <MapPin className="w-4 h-4 mr-1 text-green-400" />
                            <span className="text-green-600 font-medium text-xs">
                              {interview.location.city}, {interview.location.state}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div className="flex items-center mb-1">
                          <BarChart3 className="w-4 h-4 mr-1 text-gray-400" />
                          <span>{interview.answeredQuestions}/{calculateEffectiveQuestions(interview.responses, interview.survey)}</span>
                        </div>
                        <div className="flex items-center">
                          <Target className="w-4 h-4 mr-1 text-gray-400" />
                          <span>{interview.completionPercentage}% complete</span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Clock className="w-4 h-4 mr-1 text-gray-400" />
                        <span>{formatDuration(interview.totalTimeSpent)}</span>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(interview.status)}`}>
                        {getStatusIcon(interview.status)}
                        <span className="ml-1">{interview.status}</span>
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      {interview.audioRecording?.hasAudio ? (
                        <button
                          onClick={() => handlePlayAudio(interview.audioRecording.audioUrl, interview._id)}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          {audioPlaying === interview._id ? (
                            <Pause className="w-4 h-4 mr-1" />
                          ) : (
                            <Play className="w-4 h-4 mr-1" />
                          )}
                          {audioPlaying === interview._id ? 'Pause' : 'Play'}
                        </button>
                      ) : (
                        <span className="text-sm text-gray-400">No Audio</span>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedInterview(interview);
                          resetVerificationForm();
                          setShowResponseDetails(true);
                          // Fetch full survey data to get target audience
                          // Pass the survey data already in the interview object
                          if (interview?.survey?._id) {
                            fetchFullSurveyData(interview.survey._id, interview.survey);
                          }
                        }}
                        className="inline-flex items-center px-3 py-1 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Verify Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* Response Details Modal */}
    {showResponseDetails && selectedInterview && (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-7xl h-[90vh] flex flex-col">
          {/* Modal Header */}
          <div className="flex justify-between items-center p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex-1 min-w-0 pr-4">
              <h3 className="text-lg font-medium text-gray-900">
                Survey Response Verification
              </h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p>Response ID: {selectedInterview.responseId}</p>
                <p className="break-words max-w-4xl">
                  Survey: {selectedInterview.survey?.surveyName || 'Unknown Survey'}
                </p>
                {selectedInterview.interviewMode && (
                  <p className="flex items-center">
                    <span className="mr-2">Mode:</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedInterview.interviewMode === 'capi' 
                        ? 'bg-blue-100 text-blue-800' 
                        : selectedInterview.interviewMode === 'cati' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {selectedInterview.interviewMode.toUpperCase()}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleCloseModal}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Interview Info */}
            <div className="lg:col-span-2">
              <div className="bg-gray-50 p-4 rounded-lg flex-shrink-0">
                <h4 className="font-medium text-gray-900 mb-3">Interview Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Duration:</span>
                    <span className="ml-2 font-medium">{formatDuration(selectedInterview.totalTimeSpent)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Completion:</span>
                    <span className="ml-2 font-medium">
                      {(() => {
                        const effectiveTotal = calculateEffectiveQuestions(selectedInterview.responses, selectedInterview.survey);
                        return effectiveTotal > 0 ? Math.round((selectedInterview.answeredQuestions / effectiveTotal) * 100) : 0;
                      })()}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Questions:</span>
                    <span className="ml-2 font-medium">{selectedInterview.answeredQuestions}/{calculateEffectiveQuestions(selectedInterview.responses, selectedInterview.survey)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedInterview.status)}`}>
                      {selectedInterview.status}
                    </span>
                  </div>
                  {selectedInterview.location && (
                    <>
                      <div>
                        <span className="text-gray-600">Location:</span>
                        <span className="ml-2 font-medium">
                          {selectedInterview.location.city}, {selectedInterview.location.state}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Coordinates:</span>
                        <span className="ml-2 font-medium text-xs">
                          {selectedInterview.location.latitude.toFixed(6)}, {selectedInterview.location.longitude.toFixed(6)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Target Audience Requirements */}
              {(() => {
                const targetAudience = getTargetAudience(selectedInterview);
                return targetAudience;
              })() && (
                <div className="mt-6">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                    <Target className="w-5 h-5 mr-2" />
                    Target Audience Requirements
                  </h4>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="space-y-4">
                      {(() => {
                        const targetAudience = getTargetAudience(selectedInterview);
                        if (!targetAudience) return null;

                        return (
                          <>
                            {/* Demographics */}
                            {targetAudience.demographics && Object.keys(targetAudience.demographics).some(key => 
                              targetAudience.demographics[key] && typeof targetAudience.demographics[key] === 'boolean'
                            ) && (
                              <div>
                                <h5 className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
                                  <Users className="w-4 h-4 mr-2" />
                                  Demographics
                                </h5>
                                <div className="space-y-3">
                                  
                                  {/* Age Group */}
                                  {targetAudience.demographics['Age Group'] && targetAudience.demographics.ageRange && (
                                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                      <h6 className="text-xs font-medium text-blue-900 mb-1">Age Range</h6>
                                      <span className="text-xs text-blue-700">
                                        {targetAudience.demographics.ageRange.min || 'Not specified'} - {targetAudience.demographics.ageRange.max || 'Not specified'} years
                                      </span>
                                    </div>
                                  )}

                                  {/* Gender Requirements */}
                                  {targetAudience.demographics['Gender'] && targetAudience.demographics.genderRequirements && (
                                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                      <h6 className="text-xs font-medium text-purple-900 mb-2">Gender Distribution</h6>
                                      <div className="space-y-1">
                                        {(() => {
                                          const requirements = targetAudience.demographics.genderRequirements;
                                          const selectedGenders = Object.keys(requirements).filter(g => requirements[g] && !g.includes('Percentage'));
                                          
                                          return selectedGenders.map(gender => {
                                            const percentage = requirements[`${gender}Percentage`];
                                            const displayPercentage = selectedGenders.length === 1 && !percentage ? 100 : (percentage || 0);
                                            return (
                                              <div key={gender} className="flex items-center justify-between">
                                                <span className="text-xs text-purple-700">{gender}</span>
                                                <span className="text-xs font-semibold text-purple-900">{displayPercentage}%</span>
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    </div>
                                  )}

                                  {/* Income Level */}
                                  {targetAudience.demographics['Income Level'] && targetAudience.demographics.incomeRange && (
                                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                                      <h6 className="text-xs font-medium text-green-900 mb-1">Income Range</h6>
                                      <span className="text-xs text-green-700">
                                        ₹{targetAudience.demographics.incomeRange.min?.toLocaleString() || 'Not specified'} - ₹{targetAudience.demographics.incomeRange.max?.toLocaleString() || 'Not specified'}
                                      </span>
                                    </div>
                                  )}

                                  {/* Education */}
                                  {targetAudience.demographics['Education'] && targetAudience.demographics.educationRequirements && (
                                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                      <h6 className="text-xs font-medium text-yellow-900 mb-2">Education Level</h6>
                                      <div className="flex flex-wrap gap-1">
                                        {Object.keys(targetAudience.demographics.educationRequirements)
                                          .filter(edu => targetAudience.demographics.educationRequirements[edu])
                                          .map(education => (
                                            <span key={education} className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                                              {education}
                                            </span>
                                          ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Occupation */}
                                  {targetAudience.demographics['Occupation'] && targetAudience.demographics.occupationRequirements && (
                                    <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                                      <h6 className="text-xs font-medium text-indigo-900 mb-1">Occupation Requirements</h6>
                                      <p className="text-xs text-indigo-700">{targetAudience.demographics.occupationRequirements}</p>
                                    </div>
                                  )}

                                  {/* Marital Status */}
                                  {targetAudience.demographics['Marital Status'] && targetAudience.demographics.maritalStatusRequirements && (
                                    <div className="p-3 bg-pink-50 rounded-lg border border-pink-200">
                                      <h6 className="text-xs font-medium text-pink-900 mb-2">Marital Status</h6>
                                      <div className="flex flex-wrap gap-1">
                                        {Object.keys(targetAudience.demographics.maritalStatusRequirements)
                                          .filter(status => targetAudience.demographics.maritalStatusRequirements[status])
                                          .map(status => (
                                            <span key={status} className="px-2 py-1 bg-pink-100 text-pink-800 text-xs rounded-full">
                                              {status}
                                            </span>
                                          ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Family Size */}
                                  {targetAudience.demographics['Family Size'] && targetAudience.demographics.familySizeRange && (
                                    <div className="p-3 bg-teal-50 rounded-lg border border-teal-200">
                                      <h6 className="text-xs font-medium text-teal-900 mb-1">Family Size Range</h6>
                                      <span className="text-xs text-teal-700">
                                        {targetAudience.demographics.familySizeRange.min || 'Not specified'} - {targetAudience.demographics.familySizeRange.max || 'Not specified'} members
                                      </span>
                                    </div>
                                  )}

                                </div>
                              </div>
                            )}

                            {/* Geographic */}
                            {targetAudience.geographic && Object.keys(targetAudience.geographic).some(key => 
                              targetAudience.geographic[key] && typeof targetAudience.geographic[key] === 'boolean'
                            ) && (
                              <div>
                                <h5 className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
                                  <MapPin className="w-4 h-4 mr-2" />
                                  Geographic Targeting
                                </h5>
                                <div className="space-y-3">
                                  
                                  {/* Country */}
                                  {targetAudience.geographic['Country'] && targetAudience.geographic.countryRequirements && (
                                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                                      <h6 className="text-xs font-medium text-green-900 mb-1">Target Countries</h6>
                                      <p className="text-xs text-green-700">{targetAudience.geographic.countryRequirements}</p>
                                    </div>
                                  )}

                                  {/* State/Province */}
                                  {targetAudience.geographic['State/Province'] && targetAudience.geographic.stateRequirements && (
                                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                      <h6 className="text-xs font-medium text-blue-900 mb-1">Target States/Provinces</h6>
                                      <p className="text-xs text-blue-700">{targetAudience.geographic.stateRequirements}</p>
                                    </div>
                                  )}

                                  {/* City */}
                                  {targetAudience.geographic['City'] && targetAudience.geographic.cityRequirements && (
                                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                      <h6 className="text-xs font-medium text-purple-900 mb-1">Target Cities</h6>
                                      <p className="text-xs text-purple-700">{targetAudience.geographic.cityRequirements}</p>
                                    </div>
                                  )}

                                  {/* Urban/Rural */}
                                  {targetAudience.geographic['Urban/Rural'] && targetAudience.geographic.areaTypeRequirements && (
                                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                                      <h6 className="text-xs font-medium text-orange-900 mb-2">Area Type</h6>
                                      <div className="flex flex-wrap gap-1">
                                        {Object.keys(targetAudience.geographic.areaTypeRequirements)
                                          .filter(area => targetAudience.geographic.areaTypeRequirements[area])
                                          .map(area => (
                                            <span key={area} className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                                              {area}
                                            </span>
                                          ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Postal Code */}
                                  {targetAudience.geographic['Postal Code'] && targetAudience.geographic.postalCodeRequirements && (
                                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                      <h6 className="text-xs font-medium text-gray-900 mb-1">Postal Code Requirements</h6>
                                      <p className="text-xs text-gray-700">{targetAudience.geographic.postalCodeRequirements}</p>
                                    </div>
                                  )}

                                  {/* Timezone */}
                                  {targetAudience.geographic['Timezone'] && targetAudience.geographic.timezoneRequirements && (
                                    <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-200">
                                      <h6 className="text-xs font-medium text-cyan-900 mb-2">Timezone Requirements</h6>
                                      <div className="flex flex-wrap gap-1">
                                        {Object.keys(targetAudience.geographic.timezoneRequirements)
                                          .filter(tz => targetAudience.geographic.timezoneRequirements[tz])
                                          .map(timezone => (
                                            <span key={timezone} className="px-2 py-1 bg-cyan-100 text-cyan-800 text-xs rounded-full">
                                              {timezone}
                                            </span>
                                          ))}
                                      </div>
                                    </div>
                                  )}

                                </div>
                              </div>
                            )}

                            {/* Custom Specifications */}
                            {targetAudience.custom && targetAudience.custom.trim() && (
                              <div>
                                <h5 className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
                                  <AlertCircle className="w-4 h-4 mr-2" />
                                  Custom Specifications
                                </h5>
                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                  <p className="text-xs text-gray-700">{targetAudience.custom}</p>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Location Map */}
              {selectedInterview.location && (
                <div className="mt-6">
                  <h4 className="font-medium text-gray-900 mb-3">Interview Location</h4>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="mb-3">
                      <p className="text-sm text-gray-600 mb-1">
                        <strong>Address:</strong> {selectedInterview.location.address}
                      </p>
                      <p className="text-sm text-gray-600">
                        <strong>Accuracy:</strong> ±{Math.round(selectedInterview.location.accuracy)} meters
                      </p>
                    </div>
                    <div className="w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                      <iframe
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedInterview.location.longitude-0.01},${selectedInterview.location.latitude-0.01},${selectedInterview.location.longitude+0.01},${selectedInterview.location.latitude+0.01}&layer=mapnik&marker=${selectedInterview.location.latitude},${selectedInterview.location.longitude}`}
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        title="Interview Location"
                      />
                    </div>
                    <div className="mt-2 text-center">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${selectedInterview.location.latitude}&mlon=${selectedInterview.location.longitude}&zoom=15`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm underline"
                      >
                        View on OpenStreetMap
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Responses */}
              <div className="mt-6">
                <h4 className="font-medium text-gray-900 mb-3">Question Responses</h4>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  {selectedInterview.responses?.map((response, index) => {
                    // Find the corresponding question in the survey to get conditional logic
                    const surveyQuestion = findQuestionByText(response.questionText, selectedInterview.survey);
                    const hasConditions = surveyQuestion?.conditions && surveyQuestion.conditions.length > 0;
                    const conditionsMet = hasConditions ? areConditionsMet(surveyQuestion.conditions, selectedInterview.responses) : true;
                    
                    return (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-medium text-gray-900 text-sm">
                            Q{index + 1}: {response.questionText}
                          </h5>
                          <div className="flex items-center space-x-2">
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
                            {response.isSkipped && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Skipped
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {response.questionDescription && (
                          <p className="text-xs text-gray-600 mb-2">{response.questionDescription}</p>
                        )}
                        
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
                                ? `This question appeared because: ${formatConditionalLogic(surveyQuestion.conditions, selectedInterview.survey)}`
                                : `This question was skipped because: ${formatConditionalLogic(surveyQuestion.conditions, selectedInterview.survey)} (condition not met)`
                              }
                            </p>
                          </div>
                        )}
                        
                        <div className="bg-gray-50 p-3 rounded-md">
                          <p className="text-sm text-gray-800">
                            <strong>Answer:</strong> {formatResponseDisplay(response.response, surveyQuestion)}
                          </p>
                        </div>
                        {response.responseTime > 0 && (
                          <p className="text-xs text-gray-500 mt-2">
                            Response time: {response.responseTime}s
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Audio Player & Quality Metrics & Actions */}
            <div className="space-y-6">
              {selectedInterview.audioRecording?.hasAudio ? (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                    <Headphones className="w-5 h-5 mr-2" />
                    Audio Recording
                  </h4>
                  <div className="space-y-3">
                    <div className="text-sm text-gray-600">
                      <div>Duration: {formatDuration(selectedInterview.audioRecording.recordingDuration)}</div>
                      <div>Format: {selectedInterview.audioRecording.format?.toUpperCase()}</div>
                      <div>Size: {(selectedInterview.audioRecording.fileSize / 1024).toFixed(1)} KB</div>
                    </div>
                    <button
                      onClick={() => handlePlayAudio(selectedInterview.audioRecording.audioUrl, selectedInterview._id)}
                      className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      {audioPlaying === selectedInterview._id ? (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Pause Audio
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Play Audio
                        </>
                      )}
                    </button>
                    <audio
                      data-interview-id={selectedInterview._id}
                      src={(() => {
                        const audioUrl = selectedInterview.audioRecording.audioUrl;
                        if (!audioUrl) return '';
                        
                        // If it's already a full URL (including S3 URLs), use it as is
                        if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
                          // Replace localhost URLs with the current origin in production
                          if (audioUrl.includes('localhost') && window.location.protocol === 'https:') {
                            // Extract the path from the URL and use current origin
                            const urlPath = audioUrl.replace(/^https?:\/\/[^\/]+/, '');
                            return `${window.location.origin}${urlPath}`;
                          }
                          // S3 URLs or other external URLs - use as is
                          return audioUrl;
                        }
                        // Otherwise, construct the full URL using the same logic as the API service
                        const isProduction = window.location.protocol === 'https:' || window.location.hostname !== 'localhost';
                        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (isProduction ? '' : 'http://localhost:5000');
                        return `${API_BASE_URL}${audioUrl}`;
                      })()}
                      onEnded={() => setAudioPlaying(null)}
                      onPause={() => setAudioPlaying(null)}
                      onError={(e) => {
                        console.error('Audio element error:', e);
                        const audioEl = e.target;
                        const src = audioEl?.src || selectedInterview.audioRecording.audioUrl;
                        console.error('Failed to load audio from:', src);
                        showError('Audio file not found. The file may have been deleted or moved.');
                        setAudioPlaying(null);
                        // Hide the audio element on error
                        if (audioEl) {
                          audioEl.style.display = 'none';
                        }
                      }}
                      className="w-full"
                      controls
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <Headphones className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">No audio recording available</p>
                </div>
              )}

              {/* Quality Metrics */}
              {selectedInterview.qualityMetrics && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-3">Quality Metrics</h4>
                  <div className="space-y-2 text-sm">
                    {Object.entries(selectedInterview.qualityMetrics).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-600 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Survey Response Verification Form */}
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-4">Survey Response Verification</h4>
                <div className="space-y-6">
                  
                  {/* Question 1: Audio Quality */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      1. On a scale of 1-5, how clearly audible and understandable is the entire conversation, with minimal background noise or distortion?
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <div className="flex space-x-4">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <label key={rating} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="audioQuality"
                            value={rating}
                            checked={verificationForm.audioQuality === rating.toString()}
                            onChange={(e) => handleVerificationFormChange('audioQuality', e.target.value)}
                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{rating}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Poor Quality</span>
                      <span>Excellent Quality</span>
                    </div>
                  </div>

                  {/* Question 2: Question Accuracy */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      2. Did the interviewer ask all the survey questions exactly as written, without leading the respondent or adding unsolicited commentary?
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <div className="flex space-x-6">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="questionAccuracy"
                          value="Yes"
                          checked={verificationForm.questionAccuracy === 'Yes'}
                          onChange={(e) => handleVerificationFormChange('questionAccuracy', e.target.value)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Yes</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="questionAccuracy"
                          value="No"
                          checked={verificationForm.questionAccuracy === 'No'}
                          onChange={(e) => handleVerificationFormChange('questionAccuracy', e.target.value)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">No</span>
                      </label>
                    </div>
                  </div>

                  {/* Question 3: Data Accuracy */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      3. Does the transcribed data perfectly match the audio recording for all questions, with no missing answers?
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <div className="flex space-x-6">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="dataAccuracy"
                          value="Yes"
                          checked={verificationForm.dataAccuracy === 'Yes'}
                          onChange={(e) => handleVerificationFormChange('dataAccuracy', e.target.value)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Yes</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="dataAccuracy"
                          value="No"
                          checked={verificationForm.dataAccuracy === 'No'}
                          onChange={(e) => handleVerificationFormChange('dataAccuracy', e.target.value)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">No</span>
                      </label>
                    </div>
                  </div>

                  {/* Question 4: Location Match */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      4. Does the Location of Interviewer Match the Assigned Area?
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <div className="flex space-x-6">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="locationMatch"
                          value="Yes"
                          checked={verificationForm.locationMatch === 'Yes'}
                          onChange={(e) => handleVerificationFormChange('locationMatch', e.target.value)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Yes</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="locationMatch"
                          value="No"
                          checked={verificationForm.locationMatch === 'No'}
                          onChange={(e) => handleVerificationFormChange('locationMatch', e.target.value)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">No</span>
                      </label>
                    </div>
                  </div>

                  {/* Custom Feedback */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Additional Feedback (Optional)
                    </label>
                    <textarea
                      value={verificationForm.customFeedback}
                      onChange={(e) => handleVerificationFormChange('customFeedback', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Provide any additional feedback or notes for the interviewer..."
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4 border-t border-gray-200">
                    <button
                      onClick={handleSubmitVerification}
                      disabled={!isVerificationFormValid() || isSubmittingVerification}
                      className={`w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        isVerificationFormValid() && !isSubmittingVerification
                          ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                          : 'bg-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {isSubmittingVerification ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-4 h-4 mr-2" />
                          Submit Verification
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default SurveyApprovals;











