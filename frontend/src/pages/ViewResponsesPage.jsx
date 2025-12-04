import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Filter, 
  Download, 
  Eye, 
  ChevronLeft, 
  ChevronRight,
  Search,
  Calendar,
  User,
  MapPin,
  BarChart3
} from 'lucide-react';
import { surveyResponseAPI, surveyAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import ResponseDetailsModal from '../components/dashboard/ResponseDetailsModal';
import { getMainText } from '../utils/translations';

const ViewResponsesPage = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState(null);
  const [responses, setResponses] = useState([]);
  const [originalResponses, setOriginalResponses] = useState([]); // Store original unfiltered responses
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalResponses: 0,
    hasNext: false,
    hasPrev: false
  });
  const [filterOptions, setFilterOptions] = useState({
    gender: [],
    age: [],
    ac: [],
    city: [],
    district: [],
    lokSabha: [],
    interviewMode: []
  });
  
  // Filter states
  const [filters, setFilters] = useState({
    search: '',
    status: 'all', // 'all', 'Approved', 'Rejected'
    gender: '',
    ageMin: '',
    ageMax: '',
    ac: '',
    city: '',
    district: '',
    lokSabha: '',
    state: '',
    interviewMode: ''
  });
  
  const [showFilters, setShowFilters] = useState(true);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [showResponseDetails, setShowResponseDetails] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const { showError, showSuccess } = useToast();

  // Table pagination state
  const [tablePagination, setTablePagination] = useState({
    currentPage: 1,
    pageSize: 10
  });

  // Load assembly constituencies data
  const [assemblyConstituencies, setAssemblyConstituencies] = useState({});
  
  useEffect(() => {
    // Load assembly constituencies data
    const loadAssemblyData = async () => {
      try {
        const response = await fetch('/src/data/assemblyConstituencies.json');
        const data = await response.json();
        setAssemblyConstituencies(data);
      } catch (error) {
        console.error('Error loading assembly constituencies:', error);
      }
    };
    loadAssemblyData();
  }, []);

  // Fetch survey details and responses
  const fetchSurveyAndResponses = async () => {
    try {
      setLoading(true);
      
      // First, fetch survey details
      const surveyResponse = await surveyAPI.getSurvey(surveyId);
      if (surveyResponse.success) {
        setSurvey(surveyResponse.data);
      }
      
      // Then fetch responses - always fetch all (Approved + Rejected) for client-side filtering
      const params = {
        page: 1,
        limit: 1000, // Get all responses for client-side filtering
        status: 'all' // Always fetch all (Approved + Rejected) for comprehensive filtering
      };
      
      const response = await surveyResponseAPI.getSurveyResponses(surveyId, params);
      
      if (response.success) {
        setOriginalResponses(response.data.responses); // Store original unfiltered data
        setResponses(response.data.responses); // Set current responses
        setPagination(response.data.pagination);
        setFilterOptions(response.data.filterOptions);
      }
    } catch (error) {
      console.error('Error fetching survey and responses:', error);
      showError('Failed to load survey responses', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (surveyId) {
      fetchSurveyAndResponses();
    }
  }, [surveyId]);

  // Add CSS to ensure full width
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .view-responses-page {
        width: 100vw !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .view-responses-page * {
        max-width: none !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);


  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all', // Default to all (Approved + Rejected)
      gender: '',
      ageMin: '',
      ageMax: '',
      ac: '',
      city: '',
      district: '',
      lokSabha: '',
      state: '',
      interviewMode: ''
    });
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

  // Helper function to check if an option is "Others" (same as InterviewInterface)
  const isOthersOption = (optText) => {
    if (!optText) return false;
    const normalized = optText.toLowerCase().trim();
    return normalized === 'other' || 
           normalized === 'others' || 
           normalized === 'others (specify)';
  };

  // Helper function to extract "Others" text from response
  const extractOthersText = (responseValue) => {
    if (!responseValue) return null;
    const responseStr = String(responseValue);
    if (responseStr.startsWith('Others: ')) {
      return responseStr.substring(8); // Remove "Others: " prefix
    }
    return null;
  };

  // Helper function to check if response contains "Others"
  const responseContainsOthers = (responseValue) => {
    if (!responseValue) return false;
    if (Array.isArray(responseValue)) {
      return responseValue.some(val => {
        const str = String(val);
        return str.startsWith('Others: ') || isOthersOption(str);
      });
    }
    const str = String(responseValue);
    return str.startsWith('Others: ') || isOthersOption(str);
  };

  // Helper function to format response display text (same as ResponseDetailsModal)
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
          return option ? getMainText(option.text || option.value || value) : value;
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
        return option ? getMainText(option.text || option.value || response.toString()) : response.toString();
      }
      return response.toString();
    }

    return JSON.stringify(response);
  };

  // Helper function to get hardcoded option mappings for common political survey questions
  const getHardcodedOptionMapping = (questionText, responseValue) => {
    const mappings = {
      'What is your gender?': {
        'male': 'Male',
        'female': 'Female',
        'non_binary': 'Non-Binary'
      },
      'Are you a registered voter in this assembly Constituency?': {
        'yes': 'Yes',
        'no': 'No'
      },
      'How do you primarily gather information about political parties and candidates?': {
        'social_media_platforms_(facebook,_twitter,_etc.)': 'Social media platforms (Facebook, Twitter, etc.)',
        'print_media_(newspapers,_magazines)': 'Print media (Newspapers, Magazines)',
        'television_news': 'Television news',
        'radio': 'Radio',
        'word_of_mouth': 'Word of mouth',
        'political_rallies': 'Political rallies',
        'other': 'Other'
      },
      'Which party did you vote for in the last assembly elections (MLA) in 2021?': {
        'bjp': 'BJP',
        'aitc_(trinamool_congress)': 'AITC (Trinamool Congress)',
        'inc(congress)': 'INC (Congress)',
        'cpi(m)': 'CPI(M)',
        'aap': 'AAP',
        'other': 'Other',
        'did_not_vote': 'Did not vote'
      },
      'Which party did you vote for in the last Lok Sabha elections (MP) in 2024?': {
        'bjp': 'BJP',
        'aitc_(trinamool_congress)': 'AITC (Trinamool Congress)',
        'inc(congress)': 'INC (Congress)',
        'cpi(m)': 'CPI(M)',
        'aap': 'AAP',
        'other': 'Other',
        'did_not_vote': 'Did not vote'
      },
      'Which party did you vote for in the by- elections held in your assembly constituency (MLA) after 2021?': {
        'bjp': 'BJP',
        'aitc_(trinamool_congress)': 'AITC (Trinamool Congress)',
        'inc(congress)': 'INC (Congress)',
        'cpi(m)': 'CPI(M)',
        'aap': 'AAP',
        'other': 'Other',
        'did_not_vote': 'Did not vote'
      },
      'If assembly elections (MLA) were to be held tomorrow, then which party would you vote for?': {
        'bjp': 'BJP',
        'aitc_(trinamool_congress)': 'AITC (Trinamool Congress)',
        'inc(congress)': 'INC (Congress)',
        'cpi(m)': 'CPI(M)',
        'aap': 'AAP',
        'other': 'Other',
        'undecided': 'Undecided'
      }
    };

    const questionMapping = mappings[questionText];
    if (questionMapping && questionMapping[responseValue]) {
      return questionMapping[responseValue];
    }
    
    return responseValue; // Return original value if no mapping found
  };

  // Helper function to find question by text in survey structure
  const findQuestionByText = (questionText, survey) => {
    if (!survey || !questionText) return null;
    
    // Handle nested survey structure
    const actualSurvey = survey.survey || survey;
    
    // Try different possible structures
    let questions = [];
    
    // Structure 1: Direct questions array
    if (actualSurvey.questions && Array.isArray(actualSurvey.questions)) {
      questions = actualSurvey.questions;
    }
    // Structure 2: Questions in sections
    else if (actualSurvey.sections && Array.isArray(actualSurvey.sections)) {
      questions = actualSurvey.sections.flatMap(section => section.questions || []);
    }
    // Structure 3: Nested survey object
    else if (actualSurvey.survey && actualSurvey.survey.questions) {
      questions = actualSurvey.survey.questions;
    }
    // Structure 4: Nested survey with sections
    else if (actualSurvey.survey && actualSurvey.survey.sections) {
      questions = actualSurvey.survey.sections.flatMap(section => section.questions || []);
    }
    
    // Find the question by text
    const foundQuestion = questions.find(q => q.text === questionText);
    
    // Debug logging
    if (!foundQuestion) {
      console.log('Question not found:', questionText);
      console.log('Available questions:', questions.map(q => q.text));
      console.log('Survey structure keys:', Object.keys(actualSurvey));
      console.log('Full survey structure:', actualSurvey);
    }
    
    return foundQuestion;
  };

  // Helper function to get state from GPS location
  const getStateFromGPS = (location) => {
    if (location?.state) return location.state;
    if (location?.address?.state) return location.address.state;
    if (location?.administrative_area_level_1) return location.administrative_area_level_1;
    return 'N/A';
  };

  // Helper function to capitalize name
  const capitalizeName = (name) => {
    if (!name || name === 'N/A') return 'N/A';
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Helper function to get all questions from survey (handles both sections and direct questions)
  const getAllSurveyQuestions = (survey) => {
    if (!survey) return [];
    const actualSurvey = survey.survey || survey;
    let allQuestions = [];
    
    // Get questions from sections
    if (actualSurvey?.sections && Array.isArray(actualSurvey.sections)) {
      actualSurvey.sections.forEach(section => {
        if (section.questions && Array.isArray(section.questions)) {
          allQuestions.push(...section.questions);
        }
      });
    }
    
    // Get direct questions if they exist
    if (actualSurvey?.questions && Array.isArray(actualSurvey.questions)) {
      allQuestions.push(...actualSurvey.questions);
    }
    
    // Sort by order if available
    allQuestions.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    return allQuestions;
  };

  // Helper function to get option text from value (removes translation part)
  const getOptionTextFromValue = (value, question) => {
    if (!question || !question.options || !value) {
      // If value is a string with translation format like "male_{পুরুষ}", extract main part
      if (typeof value === 'string' && value.includes('_{')) {
        return value.split('_{')[0];
      }
      return value;
    }
    
    // Handle array values
    if (Array.isArray(value)) {
      value = value[0];
    }
    
    // Find the option that matches the value
    const option = question.options.find(opt => 
      opt.value === value || 
      opt.value?.toString() === value?.toString() ||
      opt.code === value ||
      opt.code?.toString() === value?.toString()
    );
    
    if (option) {
      // Return main text without translation
      return getMainText(option.text || option.value || value);
    }
    
    // If not found, check if value has translation format
    if (typeof value === 'string' && value.includes('_{')) {
      return value.split('_{')[0];
    }
    
    // If not found, return the value as is
    return value;
  };

  // Helper function to find question by questionNumber
  const findQuestionByNumber = (questionNumber, survey) => {
    if (!survey || !questionNumber) return null;
    const allQuestions = getAllSurveyQuestions(survey);
    return allQuestions.find(q => {
      const qNum = q.questionNumber || '';
      return qNum === questionNumber || 
             qNum.includes(questionNumber) || 
             questionNumber.includes(qNum);
    });
  };

  // Helper function to extract respondent info from responses array
  const getRespondentInfo = (responses, responseData) => {
    if (!responses || !Array.isArray(responses)) {
      return { name: 'N/A', gender: 'N/A', age: 'N/A', city: 'N/A', district: 'N/A', ac: 'N/A', lokSabha: 'N/A', state: 'N/A' };
    }

    // Use getMainText from translations (already imported at top)
    
    // Helper to find response by question text (ignoring translations)
    const findResponseByQuestionText = (responses, searchTexts) => {
      return responses.find(r => {
        if (!r.questionText) return false;
        const mainText = getMainText(r.questionText).toLowerCase();
        return searchTexts.some(text => mainText.includes(text.toLowerCase()));
      });
    };

    // Helper to find response by questionNumber
    const findResponseByQuestionNumber = (responses, questionNumber) => {
      return responses.find(r => {
        if (!r.questionNumber) return false;
        return r.questionNumber === questionNumber || 
               r.questionNumber.includes(questionNumber) ||
               questionNumber.includes(r.questionNumber);
      });
    };

    // Get survey ID
    const surveyId = responseData?.survey?._id || responseData?.survey?._id || null;

    // Special handling for survey "68fd1915d41841da463f0d46"
    if (surveyId === '68fd1915d41841da463f0d46') {
      // Find name from Q28 - "Would You like to share your name with us?"
      let nameResponse = findResponseByQuestionNumber(responses, 'Q28') || 
                         findResponseByQuestionNumber(responses, '28');
      
      // Fallback to question text search
      if (!nameResponse) {
        nameResponse = findResponseByQuestionText(responses, [
          'would you like to share your name',
          'share your name',
          'name with us'
        ]);
      }
      
      // Fallback to general name search
      if (!nameResponse) {
        nameResponse = findResponseByQuestionText(responses, [
          'what is your full name',
          'full name',
          'name'
        ]);
      }
      
      // Get name and capitalize it
      let name = nameResponse?.response || 'N/A';
      if (name !== 'N/A') {
        name = capitalizeName(String(name));
      }
      
      // Find gender from "Please note the respondent's gender"
      let genderResponse = findResponseByQuestionText(responses, [
        'please note the respondent\'s gender',
        'note the respondent\'s gender',
        'respondent\'s gender',
        'respondent gender',
        'note the gender'
      ]);
      
      // If not found, try broader search
      if (!genderResponse) {
        genderResponse = findResponseByQuestionText(responses, ['gender']);
      }
      
      // If still not found, try to find by question ID
      if (!genderResponse) {
        const genderResponseById = responses.find(r => 
          r.questionId?.includes('gender') || 
          r.questionId?.includes('respondent_gender')
        );
        if (genderResponseById) {
          genderResponse = genderResponseById;
        }
      }
      
      // Get gender option text (without translation)
      let gender = 'N/A';
      if (genderResponse?.response) {
        // Try to find the gender question in survey
        const genderQuestion = survey ? getAllSurveyQuestions(survey).find(q => {
          const qText = getMainText(q.text || '').toLowerCase();
          return qText.includes('gender') || qText.includes('respondent');
        }) : null;
        
        gender = getOptionTextFromValue(genderResponse.response, genderQuestion);
      }
      
      // Find age from age question
      const ageResponse = findResponseByQuestionText(responses, [
        'could you please tell me your age',
        'your age in complete years',
        'age in complete years',
        'age'
      ]);

      const acResponse = responses.find(r => 
        getMainText(r.questionText || '').toLowerCase().includes('assembly') ||
        getMainText(r.questionText || '').toLowerCase().includes('constituency')
      );

      // Get city from GPS location if available, otherwise from responses
      let city = 'N/A';
      if (responseData?.location?.city) {
        city = responseData.location.city;
      } else {
        const cityResponse = findResponseByQuestionText(responses, [
          'city',
          'location'
        ]);
        city = cityResponse?.response || 'N/A';
      }

      // Get district from AC using assemblyConstituencies.json
      const acName = acResponse?.response || 'N/A';
      const district = getDistrictFromAC(acName);

      // Get Lok Sabha from AC using assemblyConstituencies.json
      const lokSabha = getLokSabhaFromAC(acName);

      // Get state from GPS location
      const state = getStateFromGPS(responseData?.location);

      return {
        name: name,
        gender: gender,
        age: ageResponse?.response || 'N/A',
        city: city,
        district: district,
        ac: acName,
        lokSabha: lokSabha,
        state: state
      };
    }

    // Default behavior for other surveys
    const nameResponse = responses.find(r => 
      getMainText(r.questionText || '').toLowerCase().includes('name') || 
      getMainText(r.questionText || '').toLowerCase().includes('respondent') ||
      getMainText(r.questionText || '').toLowerCase().includes('full name')
    );
    
    const genderResponse = responses.find(r => 
      getMainText(r.questionText || '').toLowerCase().includes('gender') || 
      getMainText(r.questionText || '').toLowerCase().includes('sex')
    );
    
    // Get gender option text (without translation)
    let gender = 'N/A';
    if (genderResponse?.response) {
      const genderQuestion = survey ? getAllSurveyQuestions(survey).find(q => {
        const qText = getMainText(q.text || '').toLowerCase();
        return qText.includes('gender') || qText.includes('sex');
      }) : null;
      
      gender = getOptionTextFromValue(genderResponse.response, genderQuestion);
    }
    
    const ageResponse = responses.find(r => 
      getMainText(r.questionText || '').toLowerCase().includes('age') || 
      getMainText(r.questionText || '').toLowerCase().includes('year')
    );

    const acResponse = responses.find(r => 
      r.questionText.toLowerCase().includes('assembly') ||
      r.questionText.toLowerCase().includes('constituency')
    );

    // Get city from GPS location if available, otherwise from responses
    let city = 'N/A';
    if (responseData?.location?.city) {
      city = responseData.location.city;
    } else {
      const cityResponse = responses.find(r => 
        r.questionText.toLowerCase().includes('city') || 
        r.questionText.toLowerCase().includes('location')
      );
      city = cityResponse?.response || 'N/A';
    }

    // Get district from AC using assemblyConstituencies.json
    const acName = acResponse?.response || 'N/A';
    const district = getDistrictFromAC(acName);

    // Get Lok Sabha from AC using assemblyConstituencies.json
    const lokSabha = getLokSabhaFromAC(acName);

    // Get state from GPS location
    const state = getStateFromGPS(responseData?.location);

    // Get name and capitalize it
    let name = nameResponse?.response || 'N/A';
    if (name !== 'N/A') {
      name = capitalizeName(String(name));
    }

    return {
      name: name,
      gender: gender,
      age: ageResponse?.response || 'N/A',
      city: city,
      district: district,
      ac: acName,
      lokSabha: lokSabha,
      state: state
    };
  };

  // Get unique filter options from original unfiltered responses
  const getFilterOptions = useMemo(() => {
    if (!originalResponses || originalResponses.length === 0) {
      return {
        gender: [],
        age: [],
        ac: [],
        city: [],
        district: [],
        lokSabha: [],
        state: []
      };
    }

    const options = {
      gender: new Set(),
      age: new Set(),
      ac: new Set(),
      city: new Set(),
      district: new Set(),
      lokSabha: new Set(),
      state: new Set(),
      interviewMode: new Set()
    };

    originalResponses.forEach(response => {
      const respondentInfo = getRespondentInfo(response.responses, response);
      const state = getStateFromGPS(response.location);
      const lokSabha = getLokSabhaFromAC(respondentInfo.ac);

      if (respondentInfo.gender && respondentInfo.gender !== 'N/A') {
        options.gender.add(respondentInfo.gender);
      }
      if (respondentInfo.age && respondentInfo.age !== 'N/A') {
        options.age.add(parseInt(respondentInfo.age));
      }
      if (respondentInfo.ac && respondentInfo.ac !== 'N/A') {
        options.ac.add(respondentInfo.ac);
      }
      if (respondentInfo.city && respondentInfo.city !== 'N/A') {
        options.city.add(respondentInfo.city);
      }
      if (respondentInfo.district && respondentInfo.district !== 'N/A') {
        options.district.add(respondentInfo.district);
      }
      if (lokSabha && lokSabha !== 'N/A') {
        options.lokSabha.add(lokSabha);
      }
      if (state && state !== 'N/A') {
        options.state.add(state);
      }
      if (response.interviewMode && response.interviewMode !== 'N/A') {
        options.interviewMode.add(response.interviewMode.toUpperCase());
      }
    });

    const result = {
      gender: Array.from(options.gender).sort(),
      age: Array.from(options.age).sort((a, b) => a - b),
      ac: Array.from(options.ac).sort(),
      city: Array.from(options.city).sort(),
      district: Array.from(options.district).sort(),
      lokSabha: Array.from(options.lokSabha).sort(),
      state: Array.from(options.state).sort(),
      interviewMode: Array.from(options.interviewMode).sort()
    };
    
    return result;
  }, [originalResponses]);

  // Filter responses based on current filters
  const filteredResponses = useMemo(() => {
    if (!originalResponses || originalResponses.length === 0) return [];

    return originalResponses.filter(response => {
      const respondentInfo = getRespondentInfo(response.responses, response);
      const state = getStateFromGPS(response.location);
      const lokSabha = getLokSabhaFromAC(respondentInfo.ac);

      // Search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase().trim();
        const respondentName = respondentInfo.name.toLowerCase();
        const interviewerName = response.interviewer 
          ? `${response.interviewer.firstName} ${response.interviewer.lastName}`.toLowerCase()
          : '';
        
        if (!respondentName.includes(searchTerm) && !interviewerName.includes(searchTerm)) {
          return false;
        }
      }

      // Gender filter - case insensitive
      if (filters.gender && respondentInfo.gender.toLowerCase() !== filters.gender.toLowerCase()) {
        return false;
      }

      // Age filter
      if (filters.ageMin && parseInt(respondentInfo.age) < parseInt(filters.ageMin)) {
        return false;
      }
      if (filters.ageMax && parseInt(respondentInfo.age) > parseInt(filters.ageMax)) {
        return false;
      }

      // AC filter - case insensitive
      if (filters.ac && respondentInfo.ac.toLowerCase() !== filters.ac.toLowerCase()) {
        return false;
      }

      // City filter - case insensitive
      if (filters.city && respondentInfo.city.toLowerCase() !== filters.city.toLowerCase()) {
        return false;
      }

      // District filter - case insensitive
      if (filters.district && respondentInfo.district.toLowerCase() !== filters.district.toLowerCase()) {
        return false;
      }

      // Lok Sabha filter - case insensitive
      if (filters.lokSabha && lokSabha.toLowerCase() !== filters.lokSabha.toLowerCase()) {
        return false;
      }

      // State filter - case insensitive
      if (filters.state && state.toLowerCase() !== filters.state.toLowerCase()) {
        return false;
      }

      // Interview Mode filter
      if (filters.interviewMode && response.interviewMode?.toUpperCase() !== filters.interviewMode.toUpperCase()) {
        return false;
      }

      // Status filter
      if (filters.status && filters.status !== 'all') {
        // Filter by specific status
        if (response.status !== filters.status) {
          return false;
        }
      } else {
        // Default (status === 'all' or undefined): Show both Approved and Rejected
        if (response.status !== 'Approved' && response.status !== 'Rejected') {
          return false;
        }
      }

      return true;
    });
  }, [originalResponses, filters]);

  // Paginated responses for table
  const paginatedResponses = useMemo(() => {
    const startIndex = (tablePagination.currentPage - 1) * tablePagination.pageSize;
    const endIndex = startIndex + tablePagination.pageSize;
    return filteredResponses.slice(startIndex, endIndex);
  }, [filteredResponses, tablePagination]);

  // Calculate total pages for table
  const totalTablePages = Math.ceil(filteredResponses.length / tablePagination.pageSize);

  // Handle table pagination
  const handleTablePageChange = (newPage) => {
    setTablePagination(prev => ({
      ...prev,
      currentPage: newPage
    }));
    // Scroll to top of table
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  // Helper function to check if a question is AC selection or polling station
  const isACOrPollingStationQuestion = (question) => {
    // Check by questionId
    if (question.id === 'ac-selection') return true;
    // Check by question type
    if (question.type === 'polling_station') return true;
    // Check by question text (fallback)
    const questionText = question.text || question.questionText || '';
    if (questionText.toLowerCase().includes('select assembly constituency') || 
        questionText.toLowerCase().includes('select polling station')) {
      return true;
    }
    return false;
  };

  // Handle CSV download with raw survey question-answer data
  const handleCSVDownload = () => {
    if (filteredResponses.length === 0) {
      showError('No responses to download');
      return;
    }

    if (!survey) {
      showError('Survey data not available');
      return;
    }

    // Show modal to choose download mode
    setShowDownloadModal(true);
  };

  // Generate CSV with selected mode
  const generateCSV = (downloadMode) => {
    setShowDownloadModal(false);

    if (filteredResponses.length === 0) {
      showError('No responses to download');
      return;
    }

    if (!survey) {
      showError('Survey data not available');
      return;
    }

    // Get ALL questions from the survey itself (not from responses)
    // This ensures we have a complete template that works for both CAPI and CATI
    const allSurveyQuestions = getAllSurveyQuestions(survey);
    
    if (allSurveyQuestions.length === 0) {
      showError('No survey questions found');
      return;
    }

    // Filter out AC selection and polling station questions
    const regularQuestions = allSurveyQuestions.filter(q => !isACOrPollingStationQuestion(q));
    
    if (regularQuestions.length === 0) {
      showError('No regular survey questions found (only AC/polling station questions)');
      return;
    }

    // Detect questions with "Others" option and create headers with "Others" columns
    const questionHeaders = [];
    const questionOthersMap = new Map(); // Map question index to whether it has "Others"
    
    regularQuestions.forEach((question, index) => {
      const questionText = question.text || question.questionText || `Question ${index + 1}`;
      const questionHeader = `Q${index + 1}: ${getMainText(questionText)}`;
      questionHeaders.push(questionHeader);
      
      // Check if question has "Others" option (for MCQ questions)
      if ((question.type === 'multiple_choice' || question.type === 'single_choice') && question.options) {
        const hasOthersOption = question.options.some(opt => {
          const optText = typeof opt === 'object' ? opt.text : opt;
          return isOthersOption(optText);
        });
        
        if (hasOthersOption) {
          questionOthersMap.set(index, true);
          // Add "Others" column header right after the question
          questionHeaders.push(`Q${index + 1}: ${questionText} - Other`);
        } else {
          questionOthersMap.set(index, false);
        }
      } else {
        questionOthersMap.set(index, false);
      }
    });
    
    // Add metadata headers (common columns for both CAPI and CATI)
    const metadataHeaders = [
      'Response ID',
      'Interview Mode',
      'Interviewer Name',
      'Interviewer Email',
      'Response Date',
      'Status',
      'Assembly Constituency (AC)',
      'Parliamentary Constituency (PC)',
      'District',
      'Polling Station Code',
      'Polling Station Name',
      'GPS Coordinates',
      'Call ID' // For CATI interviews
    ];

    const allHeaders = [...metadataHeaders, ...questionHeaders];

    // Helper function to extract AC and polling station from responses
    const getACAndPollingStationFromResponses = (responses) => {
      if (!responses || !Array.isArray(responses)) {
        return { ac: null, pollingStation: null, groupName: null };
      }
      
      let ac = null;
      let pollingStation = null;
      let groupName = null;
      
      responses.forEach((responseItem) => {
        // Check if this is AC selection question
        if (responseItem.questionId === 'ac-selection') {
          ac = responseItem.response || null;
        }
        
        // Check if this is polling station question
        if (responseItem.questionText?.toLowerCase().includes('select polling station') ||
            responseItem.questionType === 'polling_station') {
          const stationResponse = responseItem.response;
          if (stationResponse) {
            if (typeof stationResponse === 'string' && stationResponse.includes(' - ')) {
              const parts = stationResponse.split(' - ');
              if (parts.length >= 3 && parts[0].toLowerCase().startsWith('group')) {
                groupName = parts[0] || null;
                pollingStation = parts.slice(1).join(' - ');
              } else if (parts.length === 2 && parts[0].toLowerCase().startsWith('group')) {
                groupName = parts[0] || null;
                pollingStation = parts[1] || stationResponse;
              } else {
                pollingStation = stationResponse;
              }
            } else {
              pollingStation = stationResponse;
            }
          }
        }
        
        // Check for polling station group selection
        if (responseItem.questionId === 'polling-station-group' ||
            responseItem.questionText?.toLowerCase().includes('select group')) {
          groupName = responseItem.response || null;
        }
      });
      
      return { ac, pollingStation, groupName };
    };

    // Helper function to extract polling station code and name
    const extractPollingStationCodeAndName = (stationValue, selectedPollingStation) => {
      let stationCode = 'N/A';
      let stationName = 'N/A';
      
      // Priority: Use selectedPollingStation.stationName (should have "Code - Name" format)
      const fullStationValue = selectedPollingStation?.stationName || stationValue;
      
      if (fullStationValue) {
        if (typeof fullStationValue === 'string' && fullStationValue.includes(' - ')) {
          const parts = fullStationValue.split(' - ');
          if (parts.length >= 2) {
            stationCode = parts[0].trim();
            stationName = parts.slice(1).join(' - ').trim();
          } else {
            stationCode = fullStationValue;
            stationName = fullStationValue;
          }
        } else {
          // If it's just a code or name, use as code
          stationCode = fullStationValue;
          stationName = fullStationValue;
        }
      }
      
      return { stationCode, stationName };
    };

    // Create CSV data rows
    const csvData = filteredResponses.map(response => {
      // Extract AC and polling station from responses
      const { ac: acFromResponse, pollingStation: pollingStationFromResponse } = getACAndPollingStationFromResponses(response.responses);
      
      // Get AC, PC, and District
      const displayAC = acFromResponse || response.selectedPollingStation?.acName || response.selectedAC || 'N/A';
      
      // Get PC: Priority 1 - selectedPollingStation.pcName, Priority 2 - getLokSabhaFromAC
      let displayPC = response.selectedPollingStation?.pcName || 'N/A';
      if (displayPC === 'N/A' && displayAC !== 'N/A') {
        displayPC = getLokSabhaFromAC(displayAC);
      }
      
      // Get District: Priority 1 - selectedPollingStation.district, Priority 2 - getDistrictFromAC
      let displayDistrict = response.selectedPollingStation?.district || 'N/A';
      if (displayDistrict === 'N/A' && displayAC !== 'N/A') {
        displayDistrict = getDistrictFromAC(displayAC);
      }
      
      // Extract polling station code and name
      const pollingStationValue = pollingStationFromResponse || response.selectedPollingStation?.stationName;
      const { stationCode, stationName } = extractPollingStationCodeAndName(pollingStationValue, response.selectedPollingStation);
      
      // Extract metadata (common columns)
      const metadata = [
        response.responseId || response._id?.slice(-8) || 'N/A',
        response.interviewMode?.toUpperCase() || 'N/A',
        response.interviewer ? `${response.interviewer.firstName || ''} ${response.interviewer.lastName || ''}`.trim() : 'N/A',
        response.interviewer?.email || 'N/A',
        new Date(response.createdAt || response.endTime || response.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        response.status || 'N/A',
        displayAC,
        displayPC,
        displayDistrict,
        stationCode,
        stationName,
        response.location ? `(${response.location.latitude?.toFixed(4)}, ${response.location.longitude?.toFixed(4)})` : 'N/A',
        response.call_id || 'N/A' // CATI call ID
      ];

      // Extract answers for each question in the survey
      // Match by questionId first (most reliable), then by questionText
      const answers = [];
      
      regularQuestions.forEach((surveyQuestion, questionIndex) => {
        // Try to find matching answer by questionId first
        let matchingAnswer = null;
        
        if (surveyQuestion.id) {
          matchingAnswer = response.responses?.find(r => 
            r.questionId === surveyQuestion.id
          );
        }
        
        // If not found by ID, try by questionText
        if (!matchingAnswer && surveyQuestion.text) {
          matchingAnswer = response.responses?.find(r => 
            r.questionText === surveyQuestion.text || 
            r.questionText === surveyQuestion.questionText
          );
        }
        
        let questionResponse = '';
        let othersText = '';
        
        if (matchingAnswer) {
          // Check if the question was actually skipped
          if (matchingAnswer.isSkipped) {
            questionResponse = 'Skipped';
          } else {
            // Check if response has content
            const hasResponseContent = (responseValue) => {
              if (!responseValue && responseValue !== 0) return false;
              if (Array.isArray(responseValue)) return responseValue.length > 0;
              if (typeof responseValue === 'object') return Object.keys(responseValue).length > 0;
              return responseValue !== '' && responseValue !== null && responseValue !== undefined;
            };
            
            if (!hasResponseContent(matchingAnswer.response)) {
              questionResponse = 'No response';
            } else {
              const responseValue = matchingAnswer.response;
              
              // Check if this question has "Others" option
              const hasOthersOption = questionOthersMap.get(questionIndex);
              
              if (hasOthersOption && (surveyQuestion.type === 'multiple_choice' || surveyQuestion.type === 'single_choice')) {
                // Extract "Others" text if present
                if (Array.isArray(responseValue)) {
                  // Multiple selection - check each value for "Others" text
                  let foundOthersText = '';
                  const processedValues = responseValue.map(val => {
                    const othersTextValue = extractOthersText(val);
                    if (othersTextValue) {
                      foundOthersText = othersTextValue; // Store the "Others" text
                      // Return "Others" or the option code/text
                      if (downloadMode === 'codes') {
                        // Find the "Others" option code
                        const othersOpt = surveyQuestion.options.find(opt => {
                          const optText = typeof opt === 'object' ? opt.text : opt;
                          return isOthersOption(optText);
                        });
                        return typeof othersOpt === 'object' ? (othersOpt.code || othersOpt.value || 'Others') : 'Others';
                      } else {
                        return 'Others';
                      }
                    }
                    // Check if value itself is "Others" option
                    const othersOpt = surveyQuestion.options.find(opt => {
                      const optText = typeof opt === 'object' ? opt.text : opt;
                      const optValue = typeof opt === 'object' ? (opt.value || opt.text) : opt;
                      return isOthersOption(optText) && (optValue === val || String(optValue) === String(val));
                    });
                    if (othersOpt) {
                      if (downloadMode === 'codes') {
                        return typeof othersOpt === 'object' ? (othersOpt.code || othersOpt.value || 'Others') : 'Others';
                      } else {
                        return 'Others';
                      }
                    }
                    return val;
                  });
                  othersText = foundOthersText;
                  
                  // Format the response based on mode
                  if (downloadMode === 'codes') {
                    // Convert to option codes
                    questionResponse = processedValues.map(val => {
                      if (val === 'Others' || isOthersOption(String(val))) {
                        const othersOpt = surveyQuestion.options.find(opt => {
                          const optText = typeof opt === 'object' ? opt.text : opt;
                          return isOthersOption(optText);
                        });
                        return typeof othersOpt === 'object' ? (othersOpt.code || othersOpt.value || 'Others') : 'Others';
                      }
                      // Find option code
                      const option = surveyQuestion.options.find(opt => {
                        const optValue = typeof opt === 'object' ? (opt.value || opt.text) : opt;
                        return optValue === val || String(optValue) === String(val);
                      });
                      return typeof option === 'object' ? (option.code || option.value || val) : val;
                    }).join(', ');
                  } else {
                    // Use text format
                    questionResponse = formatResponseDisplay(processedValues, surveyQuestion);
                  }
                } else {
                  // Single selection
                  const othersTextValue = extractOthersText(responseValue);
                  if (othersTextValue) {
                    othersText = othersTextValue;
                    if (downloadMode === 'codes') {
                      const othersOpt = surveyQuestion.options.find(opt => {
                        const optText = typeof opt === 'object' ? opt.text : opt;
                        return isOthersOption(optText);
                      });
                      questionResponse = typeof othersOpt === 'object' ? (othersOpt.code || othersOpt.value || 'Others') : 'Others';
                    } else {
                      questionResponse = 'Others';
                    }
                  } else {
                    // Format the response based on mode
                    if (downloadMode === 'codes' && (surveyQuestion.type === 'multiple_choice' || surveyQuestion.type === 'single_choice')) {
                      // Find option code
                      const option = surveyQuestion.options.find(opt => {
                        const optValue = typeof opt === 'object' ? (opt.value || opt.text) : opt;
                        return optValue === responseValue || String(optValue) === String(responseValue);
                      });
                      questionResponse = typeof option === 'object' ? (option.code || option.value || responseValue) : responseValue;
                    } else {
                      // Use text format
                      if (surveyQuestion.options) {
                        questionResponse = formatResponseDisplay(responseValue, surveyQuestion);
                      } else {
                        questionResponse = getHardcodedOptionMapping(
                          surveyQuestion.text || surveyQuestion.questionText, 
                          responseValue
                        );
                      }
                    }
                  }
                }
              } else {
                // No "Others" option - format normally
                if (downloadMode === 'codes' && (surveyQuestion.type === 'multiple_choice' || surveyQuestion.type === 'single_choice') && surveyQuestion.options) {
                  // Convert to option codes
                  if (Array.isArray(responseValue)) {
                    questionResponse = responseValue.map(val => {
                      const option = surveyQuestion.options.find(opt => {
                        const optValue = typeof opt === 'object' ? (opt.value || opt.text) : opt;
                        return optValue === val || String(optValue) === String(val);
                      });
                      return typeof option === 'object' ? (option.code || option.value || val) : val;
                    }).join(', ');
                  } else {
                    const option = surveyQuestion.options.find(opt => {
                      const optValue = typeof opt === 'object' ? (opt.value || opt.text) : opt;
                      return optValue === responseValue || String(optValue) === String(responseValue);
                    });
                    questionResponse = typeof option === 'object' ? (option.code || option.value || responseValue) : responseValue;
                  }
                } else {
                  // Use text format
                  if (surveyQuestion.options) {
                    questionResponse = formatResponseDisplay(responseValue, surveyQuestion);
                  } else {
                    questionResponse = getHardcodedOptionMapping(
                      surveyQuestion.text || surveyQuestion.questionText, 
                      responseValue
                    );
                  }
                }
              }
            }
          }
        } else {
          // Question not found in this response - could be due to conditional logic
          // Return empty string instead of 'Skipped' to distinguish from actually skipped questions
          questionResponse = '';
        }
        
        // Add question response
        answers.push(questionResponse);
        
        // Add "Others" text column if this question has "Others" option
        if (questionOthersMap.get(questionIndex)) {
          answers.push(othersText || '');
        }
      });

      return [...metadata, ...answers];
    });

    const csvContent = [allHeaders, ...csvData]
      .map(row => row.map(field => {
        const fieldStr = String(field || '');
        // Escape quotes and wrap in quotes
        return `"${fieldStr.replace(/"/g, '""')}"`;
      }).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const modeSuffix = downloadMode === 'codes' ? '_codes' : '_responses';
    link.download = `${survey?.surveyName || survey?.title || 'survey'}${modeSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    showSuccess('CSV downloaded successfully');
  };

  // Handle view response details
  const handleViewResponse = (response) => {
    setSelectedResponse(response);
    setShowResponseDetails(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading responses...</p>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Survey Not Found</h2>
          <button
            onClick={() => navigate('/company/surveys')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Surveys
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 w-full view-responses-page">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4 flex-1 min-w-0">
                <button
                  onClick={() => navigate('/company/surveys')}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="hidden sm:inline">Back to Surveys</span>
                </button>
                <div className="h-6 w-px bg-gray-300 flex-shrink-0 hidden sm:block"></div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                    {survey.title}
                  </h1>
                  <p className="text-sm text-gray-600">
                    {filteredResponses.length} responses
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Filters</span>
                </button>
                
                <button
                  onClick={handleCSVDownload}
                  className="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Download CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white border-b border-gray-200 w-full">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All (Approved + Rejected)</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>

                {/* Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={filters.search}
                      onChange={(e) => handleFilterChange('search', e.target.value)}
                      placeholder="Search by name..."
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={filters.gender}
                    onChange={(e) => handleFilterChange('gender', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Genders</option>
                    {getFilterOptions.gender.map(gender => (
                      <option key={gender} value={gender}>{gender}</option>
                    ))}
                  </select>
                </div>

                {/* Age Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Age Range
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      value={filters.ageMin}
                      onChange={(e) => handleFilterChange('ageMin', e.target.value)}
                      placeholder="Min"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <input
                      type="number"
                      value={filters.ageMax}
                      onChange={(e) => handleFilterChange('ageMax', e.target.value)}
                      placeholder="Max"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Assembly Constituency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assembly Constituency
                  </label>
                  <select
                    value={filters.ac}
                    onChange={(e) => handleFilterChange('ac', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All ACs</option>
                    {getFilterOptions.ac.map(ac => (
                      <option key={ac} value={ac}>{ac}</option>
                    ))}
                  </select>
                </div>

                {/* City */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <select
                    value={filters.city}
                    onChange={(e) => handleFilterChange('city', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Cities</option>
                    {getFilterOptions.city.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>

                {/* District */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    District
                  </label>
                  <select
                    value={filters.district}
                    onChange={(e) => handleFilterChange('district', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Districts</option>
                    {getFilterOptions.district.map(district => (
                      <option key={district} value={district}>{district}</option>
                    ))}
                  </select>
                </div>

                {/* Lok Sabha */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lok Sabha
                  </label>
                  <select
                    value={filters.lokSabha}
                    onChange={(e) => handleFilterChange('lokSabha', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Lok Sabha</option>
                    {getFilterOptions.lokSabha.map(lokSabha => (
                      <option key={lokSabha} value={lokSabha}>{lokSabha}</option>
                    ))}
                  </select>
                </div>

                    {/* State */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State
                      </label>
                      <select
                        value={filters.state}
                        onChange={(e) => handleFilterChange('state', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">All States</option>
                        {getFilterOptions.state.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>

                    {/* Interview Mode */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Interview Mode
                      </label>
                      <select
                        value={filters.interviewMode}
                        onChange={(e) => handleFilterChange('interviewMode', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">All Modes</option>
                        {getFilterOptions.interviewMode.map(mode => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                    </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Clear All Filters
                </button>
                
                <div className="text-sm text-gray-600">
                  Showing {filteredResponses.length} of {originalResponses.length} responses
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="w-full py-6 px-4 sm:px-6 lg:px-8">
          {filteredResponses.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No responses found</h3>
              <p className="text-gray-600">
                {originalResponses.length === 0 
                  ? 'This survey has no responses yet.'
                  : 'Try adjusting your filters to see more results.'
                }
              </p>
            </div>
          ) : (
            <div className="bg-white shadow-sm border border-gray-200 overflow-hidden w-full">
              {/* Table Header */}
              <div className="bg-gray-50 px-4 sm:px-6 py-3 border-b border-gray-200 w-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
                  <h3 className="text-lg font-semibold text-gray-900">Survey Responses</h3>
                  <div className="text-sm text-gray-600">
                    {filteredResponses.length} of {originalResponses.length} responses
                    {totalTablePages > 1 && (
                      <span className="ml-2 text-gray-500">
                        (Page {tablePagination.currentPage} of {totalTablePages})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto w-full">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-16">
                        S.No
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-48">
                        Respondent
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden sm:table-cell w-32">
                        Demographics
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell w-48">
                        Location
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">
                        Interviewer
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden xl:table-cell">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden xl:table-cell">
                        GPS
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">
                        Mode
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedResponses.map((response, index) => {
                      const respondentInfo = getRespondentInfo(response.responses, response);
                      const actualIndex = (tablePagination.currentPage - 1) * tablePagination.pageSize + index + 1;
                      return (
                        <tr key={response._id} className="hover:bg-gray-50 transition-colors">
                          {/* S.No */}
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {actualIndex}
                          </td>
                          
                          {/* Respondent */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10">
                                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                  <User className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                                </div>
                              </div>
                              <div className="ml-2 sm:ml-4">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {respondentInfo.name}
                                </div>
                                <div className="text-xs sm:text-sm text-gray-500">
                                  ID: {response.responseId || response._id?.slice(-8)}
                                </div>
                                {/* Show demographics on mobile */}
                                <div className="sm:hidden mt-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      {respondentInfo.gender}
                                    </span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      Age: {respondentInfo.age}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                          
                          {/* Demographics - Hidden on mobile */}
                          <td className="px-4 py-4 hidden sm:table-cell">
                            <div className="text-sm text-gray-900">
                              <div className="flex flex-col space-y-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 w-fit">
                                  {respondentInfo.gender}
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 w-fit">
                                  Age: {respondentInfo.age}
                                </span>
                              </div>
                            </div>
                          </td>
                          
                          {/* Location - Hidden on small screens */}
                          <td className="px-4 py-4 hidden md:table-cell">
                            <div className="text-sm text-gray-900">
                              {response.selectedPollingStation ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center space-x-1">
                                    <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                    <span className="font-medium truncate">{response.selectedPollingStation.acName || response.selectedAC || respondentInfo.ac}</span>
                                  </div>
                                  {response.selectedPollingStation.district && (
                                    <div className="text-xs text-gray-500 truncate">
                                      {response.selectedPollingStation.district}
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-500 truncate">
                                    {response.selectedPollingStation.state || getStateFromGPS(response.location)}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="flex items-center space-x-1">
                                    <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                    <span className="font-medium truncate">{response.selectedAC || respondentInfo.ac}</span>
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">
                                    {response.location?.city || respondentInfo.city}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">
                                    {respondentInfo.district}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          
                          {/* Interviewer - Hidden on small/medium screens */}
                          <td className="px-4 py-4 hidden lg:table-cell">
                            <div className="text-sm text-gray-900">
                              <div className="font-medium truncate">
                                {response.interviewer ? `${response.interviewer.firstName} ${response.interviewer.lastName}` : 'N/A'}
                              </div>
                              {response.interviewer?.email && (
                                <div className="text-xs text-gray-500 truncate">
                                  {response.interviewer.email}
                                </div>
                              )}
                            </div>
                          </td>
                          
                          {/* Date - Hidden on small/medium/large screens */}
                          <td className="px-4 py-4 hidden xl:table-cell">
                            <div className="text-sm text-gray-900">
                              <div className="flex items-center space-x-1">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                <span>{new Date(response.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(response.createdAt).toLocaleTimeString()}
                              </div>
                            </div>
                          </td>
                          
                          {/* GPS - Hidden on small/medium/large screens */}
                          <td className="px-4 py-4 hidden xl:table-cell">
                            {response.location ? (
                              <div className="text-sm text-gray-900">
                                <div className="font-mono text-xs">
                                  {response.location.latitude?.toFixed(4)}, {response.location.longitude?.toFixed(4)}
                                </div>
                                <div className="text-xs text-green-600">
                                  ✓ GPS
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400">
                                <div className="text-xs">No GPS</div>
                              </div>
                            )}
                          </td>
                          
                          {/* Interview Mode - Hidden on small/medium/large screens */}
                          <td className="px-4 py-4 hidden lg:table-cell">
                            <div className="text-sm text-gray-900">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                response.interviewMode?.toUpperCase() === 'CAPI' 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : response.interviewMode?.toUpperCase() === 'CATI'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {response.interviewMode?.toUpperCase() || 'N/A'}
                              </span>
                            </div>
                          </td>
                          
                          {/* Actions */}
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleViewResponse(response)}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                            >
                              <Eye className="h-4 w-4" />
                              <span className="hidden sm:inline">View</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalTablePages > 1 && (
                <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => handleTablePageChange(tablePagination.currentPage - 1)}
                        disabled={tablePagination.currentPage === 1}
                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => handleTablePageChange(tablePagination.currentPage + 1)}
                        disabled={tablePagination.currentPage === totalTablePages}
                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Showing{' '}
                          <span className="font-medium">
                            {(tablePagination.currentPage - 1) * tablePagination.pageSize + 1}
                          </span>{' '}
                          to{' '}
                          <span className="font-medium">
                            {Math.min(tablePagination.currentPage * tablePagination.pageSize, filteredResponses.length)}
                          </span>{' '}
                          of{' '}
                          <span className="font-medium">{filteredResponses.length}</span> results
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                          <button
                            onClick={() => handleTablePageChange(tablePagination.currentPage - 1)}
                            disabled={tablePagination.currentPage === 1}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          {[...Array(totalTablePages)].map((_, i) => {
                            const page = i + 1;
                            // Show first page, last page, current page, and pages around current
                            if (
                              page === 1 ||
                              page === totalTablePages ||
                              (page >= tablePagination.currentPage - 1 && page <= tablePagination.currentPage + 1)
                            ) {
                              return (
                                <button
                                  key={page}
                                  onClick={() => handleTablePageChange(page)}
                                  className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                    page === tablePagination.currentPage
                                      ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                      : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                  }`}
                                >
                                  {page}
                                </button>
                              );
                            } else if (page === tablePagination.currentPage - 2 || page === tablePagination.currentPage + 2) {
                              return (
                                <span key={page} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                  ...
                                </span>
                              );
                            }
                            return null;
                          })}
                          <button
                            onClick={() => handleTablePageChange(tablePagination.currentPage + 1)}
                            disabled={tablePagination.currentPage === totalTablePages}
                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Response Details Modal */}
      {showResponseDetails && selectedResponse && (
        <ResponseDetailsModal
          response={selectedResponse}
          survey={survey}
          onClose={() => {
            setShowResponseDetails(false);
            setSelectedResponse(null);
          }}
        />
      )}

      {/* Download Mode Selection Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Choose Download Format</h3>
            <p className="text-sm text-gray-600 mb-6">
              Select how you want to download the responses:
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => generateCSV('responses')}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-left"
              >
                <div className="font-medium">Download Responses</div>
                <div className="text-sm text-blue-100 mt-1">
                  Download with full response text (e.g., "Male", "Female", "Others")
                </div>
              </button>
              
              <button
                onClick={() => generateCSV('codes')}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-left"
              >
                <div className="font-medium">Download Response Codes</div>
                <div className="text-sm text-green-100 mt-1">
                  Download with option codes for MCQ questions (e.g., "1", "2", "3")
                </div>
              </button>
            </div>
            
            <button
              onClick={() => setShowDownloadModal(false)}
              className="mt-4 w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ViewResponsesPage;
