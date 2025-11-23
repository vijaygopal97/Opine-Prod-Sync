import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Download, 
  Filter,
  Calendar,
  MapPin,
  Users,
  BarChart3,
  TrendingUp,
  Target,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  FileText,
  PieChart,
  Activity,
  Award,
  Zap,
  X
} from 'lucide-react';
import { surveyResponseAPI, surveyAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const SurveyReportsPage = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showACModal, setShowACModal] = useState(false);
  const [showInterviewerModal, setShowInterviewerModal] = useState(false);
  const [showDailyTrendsModal, setShowDailyTrendsModal] = useState(false);
  const [catiStats, setCatiStats] = useState(null);
  const [showCallRecords, setShowCallRecords] = useState(false);
  const { showError } = useToast();

  // Filter states
  const [filters, setFilters] = useState({
    dateRange: 'all', // 'today', 'week', 'month', 'all'
    startDate: '',
    endDate: '',
    status: 'all', // 'all', 'Approved', 'Rejected'
    interviewMode: '', // 'CAPI', 'CATI', ''
    ac: '',
    district: '',
    lokSabha: '',
    interviewer: ''
  });

  // Load assembly constituencies data
  const [assemblyConstituencies, setAssemblyConstituencies] = useState({});
  
  useEffect(() => {
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

  // Get all ACs for the survey's target state
  const getAllACsForState = () => {
    console.log('🔍 getAllACsForState - survey object:', survey);
    console.log('🔍 getAllACsForState - survey.acAssignmentState:', survey?.acAssignmentState);
    console.log('🔍 getAllACsForState - assemblyConstituencies loaded:', !!assemblyConstituencies.states);
    console.log('🔍 getAllACsForState - available states:', Object.keys(assemblyConstituencies.states || {}));
    
    // Try to get state from survey.acAssignmentState first
    let targetState = survey?.acAssignmentState;
    
    // If no state found, try to infer from responses
    if (!targetState && responses.length > 0) {
      // Look for state in response data
      const responseWithState = responses.find(r => r.state);
      if (responseWithState?.state) {
        targetState = responseWithState.state;
        console.log('🔍 Inferred state from responses:', targetState);
      }
    }
    
    // If still no state found, try to infer from AC names in responses
    if (!targetState && responses.length > 0) {
      console.log('🔍 Full response structure:', responses[0]);
      
      // Try different possible field names for AC
      const responseACs = responses.map(r => {
        return r.assemblyConstituency || r.assemblyConstituencyName || r.ac || r.acName || r.constituency;
      }).filter(Boolean);
      
      console.log('🔍 Response ACs:', responseACs);
      
      // If still no ACs found, try to extract from response data
      if (responseACs.length === 0) {
        console.log('🔍 Trying to extract ACs from response data...');
        const allResponseACs = [];
        
        responses.forEach(response => {
          // Check if AC is in the response data directly
          if (response.data) {
            Object.values(response.data).forEach(value => {
              if (typeof value === 'string' && ['Natabari', 'Tufanganj', 'Kumargram'].includes(value)) {
                allResponseACs.push(value);
              }
            });
          }
        });
        
        console.log('🔍 Extracted ACs from response data:', allResponseACs);
        responseACs.push(...allResponseACs);
      }
      
      // Check each state to see if any of the response ACs match
      for (const [stateName, stateData] of Object.entries(assemblyConstituencies.states || {})) {
        const stateACNames = stateData.assemblyConstituencies?.map(ac => ac.acName) || [];
        const matchingACs = responseACs.filter(ac => stateACNames.includes(ac));
        
        if (matchingACs.length > 0) {
          targetState = stateName;
          console.log('🔍 Inferred state from AC names:', targetState, 'with matching ACs:', matchingACs);
          break;
        }
      }
    }
    
    // Final fallback: if we still can't detect state, try West Bengal since we know the ACs
    if (!targetState && responses.length > 0) {
      console.log('🔍 Final fallback: trying West Bengal');
      const westBengalACs = assemblyConstituencies.states?.['West Bengal']?.assemblyConstituencies?.map(ac => ac.acName) || [];
      const responseACs = ['Natabari', 'Tufanganj', 'Kumargram']; // Known ACs from responses
      const matchingACs = responseACs.filter(ac => westBengalACs.includes(ac));
      
      if (matchingACs.length > 0) {
        targetState = 'West Bengal';
        console.log('🔍 Fallback: Using West Bengal with matching ACs:', matchingACs);
      }
    }
    
    if (!targetState || !assemblyConstituencies.states) {
      console.log('❌ Missing targetState or assemblyConstituencies.states');
      console.log('❌ targetState:', targetState);
      console.log('❌ assemblyConstituencies.states:', !!assemblyConstituencies.states);
      return [];
    }
    
    const stateACs = assemblyConstituencies.states[targetState]?.assemblyConstituencies || [];
    console.log('🔍 Found state ACs:', stateACs.length, 'ACs for state:', targetState);
    console.log('🔍 First few ACs:', stateACs.slice(0, 3));
    
    const acNames = stateACs.map(ac => ac.acName);
    console.log('🔍 AC Names:', acNames.slice(0, 5), '... (showing first 5)');
    
    return acNames;
  };

  // Add CSS to ensure full width
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .survey-reports-page {
        width: 100vw !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .survey-reports-page * {
        max-width: none !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Fetch survey and responses data
  const fetchSurveyData = async () => {
    try {
      setLoading(true);
      
      // Fetch survey details
      const surveyResponse = await surveyAPI.getSurvey(surveyId);
      if (surveyResponse.success) {
        console.log('Survey object:', surveyResponse.data);
        console.log('Sample size fields:', {
          sampleSize: surveyResponse.data?.sampleSize,
          targetSampleSize: surveyResponse.data?.targetSampleSize,
          specifications: surveyResponse.data?.specifications
        });
        // Survey data might be nested under 'survey' property
        const surveyData = surveyResponse.data?.survey || surveyResponse.data;
        console.log('🔍🔍🔍 Extracted surveyData:', surveyData);
        console.log('🔍🔍🔍 surveyData.mode:', surveyData?.mode);
        console.log('🔍🔍🔍 surveyData.modes:', surveyData?.modes);
        setSurvey(surveyData);
        
        // Fetch all responses for analytics - always fetch all (Approved + Rejected) for comprehensive analytics
        // Client-side filtering will handle status filtering
        const params = {
          page: 1,
          limit: 10000, // Get all responses for comprehensive analytics
          status: 'all' // Always fetch all (Approved + Rejected) for comprehensive analytics
        };
        
        const response = await surveyResponseAPI.getSurveyResponses(surveyId, params);
        console.log('🔍 SurveyReportsPage - API Response:', response);
        console.log('🔍 SurveyReportsPage - Responses count:', response.data?.responses?.length);
        console.log('🔍 SurveyReportsPage - Response statuses:', response.data?.responses?.map(r => r.status));
        
        if (response.success) {
          setResponses(response.data.responses);
        }

        // Fetch CATI stats if survey has CATI mode
        // Check both nested and direct structure
        const surveyMode = surveyData?.mode || surveyResponse.data?.mode;
        const surveyModes = surveyData?.modes || surveyResponse.data?.modes;
        
        // Also check if there are any CATI responses (fallback if mode field is missing)
        const hasCatiResponses = response.success && response.data?.responses?.some(r => 
          r.interviewMode?.toUpperCase() === 'CATI'
        );
        
        const isCatiSurvey = surveyMode === 'cati' || 
                            surveyMode === 'multi_mode' ||
                            (surveyModes && Array.isArray(surveyModes) && surveyModes.includes('cati')) ||
                            hasCatiResponses; // Fallback: if there are CATI responses, fetch stats
        
        console.log('🔍🔍🔍 Survey mode check:', {
          surveyData: surveyData,
          mode: surveyMode,
          modes: surveyModes,
          hasCatiResponses: hasCatiResponses,
          isCatiSurvey: isCatiSurvey,
          surveyId: surveyId
        });
        
        if (isCatiSurvey) {
          try {
            console.log('🔍🔍🔍 Fetching CATI stats for survey:', surveyId);
            const catiStatsResponse = await surveyAPI.getCatiStats(surveyId);
            console.log('🔍🔍🔍 CATI stats response:', catiStatsResponse);
            console.log('🔍🔍🔍 CATI stats response success:', catiStatsResponse?.success);
            console.log('🔍🔍🔍 CATI stats response data:', catiStatsResponse?.data);
            if (catiStatsResponse && catiStatsResponse.success) {
              console.log('🔍🔍🔍 Setting CATI stats:', catiStatsResponse.data);
              console.log('🔍🔍🔍 Calls made in response:', catiStatsResponse.data?.callerPerformance?.callsMade);
              setCatiStats(catiStatsResponse.data);
            } else {
              console.warn('⚠️⚠️⚠️ CATI stats response not successful:', catiStatsResponse);
            }
          } catch (catiError) {
            console.error('❌❌❌ Error fetching CATI stats:', catiError);
            console.error('❌❌❌ Error details:', catiError.response?.data || catiError.message);
            console.error('❌❌❌ Error status:', catiError.response?.status);
            // Don't show error, just log it - CATI stats are optional
          }
        } else {
          console.log('⚠️⚠️⚠️ Survey is not CATI, skipping CATI stats fetch');
        }
      }
    } catch (error) {
      console.error('Error fetching survey data:', error);
      showError('Failed to load survey reports', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (surveyId) {
      fetchSurveyData();
    }
  }, [surveyId, filters.status]);

  // Helper functions
  const getStateFromGPS = (location) => {
    if (location?.state) return location.state;
    if (location?.address?.state) return location.address.state;
    if (location?.administrative_area_level_1) return location.administrative_area_level_1;
    return 'N/A';
  };

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

  const getRespondentInfo = (responses, responseData) => {
    if (!responses || !Array.isArray(responses)) {
      return { name: 'N/A', gender: 'N/A', age: 'N/A', city: 'N/A', district: 'N/A', ac: 'N/A', lokSabha: 'N/A', state: 'N/A' };
    }

    const nameResponse = responses.find(r => 
      r.questionText.toLowerCase().includes('name') || 
      r.questionText.toLowerCase().includes('respondent') ||
      r.questionText.toLowerCase().includes('full name')
    );
    
    const genderResponse = responses.find(r => 
      r.questionText.toLowerCase().includes('gender') || 
      r.questionText.toLowerCase().includes('sex')
    );
    
    const ageResponse = responses.find(r => 
      r.questionText.toLowerCase().includes('age') || 
      r.questionText.toLowerCase().includes('year')
    );

    const acResponse = responses.find(r => 
      r.questionText.toLowerCase().includes('assembly') ||
      r.questionText.toLowerCase().includes('constituency')
    );

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

    const acName = acResponse?.response || 'N/A';
    const district = getDistrictFromAC(acName);
    const lokSabha = getLokSabhaFromAC(acName);
    const state = getStateFromGPS(responseData?.location);

    return {
      name: nameResponse?.response || 'N/A',
      gender: genderResponse?.response || 'N/A',
      age: ageResponse?.response || 'N/A',
      city: city,
      district: district,
      ac: acName,
      lokSabha: lokSabha,
      state: state
    };
  };

  // Filter responses based on current filters
  const filteredResponses = useMemo(() => {
    if (!responses || responses.length === 0) return [];

    return responses.filter(response => {
      // Date range filter
      if (filters.dateRange !== 'all') {
        const responseDate = new Date(response.createdAt);
        const now = new Date();
        
        switch (filters.dateRange) {
          case 'today':
            if (responseDate.toDateString() !== now.toDateString()) return false;
            break;
          case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            if (responseDate < weekAgo) return false;
            break;
          case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            if (responseDate < monthAgo) return false;
            break;
        }
      }

      // Custom date range filter
      if (filters.startDate && filters.endDate) {
        const responseDate = new Date(response.createdAt);
        const startDate = new Date(filters.startDate);
        const endDate = new Date(filters.endDate);
        if (responseDate < startDate || responseDate > endDate) return false;
      }

      // Interview mode filter
      if (filters.interviewMode && response.interviewMode?.toUpperCase() !== filters.interviewMode.toUpperCase()) {
        return false;
      }

      // Geographic filters
      const respondentInfo = getRespondentInfo(response.responses, response);
      
      if (filters.ac && respondentInfo.ac.toLowerCase() !== filters.ac.toLowerCase()) {
        return false;
      }

      if (filters.district && respondentInfo.district.toLowerCase() !== filters.district.toLowerCase()) {
        return false;
      }

      if (filters.lokSabha && respondentInfo.lokSabha.toLowerCase() !== filters.lokSabha.toLowerCase()) {
        return false;
      }

      // Interviewer filter
      if (filters.interviewer) {
        const interviewerName = response.interviewer 
          ? `${response.interviewer.firstName} ${response.interviewer.lastName}`.toLowerCase()
          : '';
        if (!interviewerName.includes(filters.interviewer.toLowerCase())) return false;
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
  }, [responses, filters]);

  // Prepare chart data for response trends over time
  const prepareChartData = () => {
    if (!analytics.dailyStats || analytics.dailyStats.length === 0) {
      return null;
    }

    const dailyData = analytics.dailyStats;
    
    // Sort data by date
    const sortedData = dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const labels = sortedData.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    });

    const totalResponsesData = sortedData.map(item => item.count);
    
    // Calculate CAPI and CATI data from daily stats
    const capiData = sortedData.map(item => {
      // This would need to be calculated from actual response data
      // For now, we'll estimate based on total responses
      return Math.round(item.count * (analytics.capiResponses / analytics.totalResponses));
    });
    
    const catiData = sortedData.map(item => {
      // This would need to be calculated from actual response data
      // For now, we'll estimate based on total responses
      return Math.round(item.count * (analytics.catiResponses / analytics.totalResponses));
    });

    return {
      labels,
      datasets: [
        {
          label: 'Total Responses',
          data: totalResponsesData,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          yAxisID: 'y'
        },
        {
          label: 'CAPI Responses',
          data: capiData,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.4,
          yAxisID: 'y'
        },
        {
          label: 'CATI Responses',
          data: catiData,
          borderColor: 'rgb(249, 115, 22)',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.4,
          yAxisID: 'y'
        }
      ]
    };
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: '500'
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: function(context) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Date',
          font: {
            size: 12,
            weight: '600'
          }
        },
        grid: {
          display: false
        },
        ticks: {
          maxTicksLimit: 8,
          font: {
            size: 11
          }
        }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Number of Responses',
          font: {
            size: 12,
            weight: '600'
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: {
            size: 11
          },
          stepSize: 1,
          callback: function(value) {
            return Number.isInteger(value) ? value : null;
          }
        }
      }
    }
  };

  // Analytics calculations
  const analytics = useMemo(() => {
    if (!filteredResponses || filteredResponses.length === 0) {
      return {
        totalResponses: 0,
        capiResponses: 0,
        catiResponses: 0,
        completionRate: 0,
        averageResponseTime: 0,
        acStats: [],
        districtStats: [],
        lokSabhaStats: [],
        interviewerStats: [],
        genderStats: {},
        ageStats: {},
        dailyStats: [],
        capiPerformance: {
          approved: 0,
          rejected: 0,
          total: 0
        },
        catiPerformance: {
          callerPerformance: {
            callsMade: 0,
            callsAttended: 0,
            dialsAttempted: 0,
            callsConnected: 0,
            totalTalkDuration: '0:00:00'
          },
          numberStats: {
            callNotReceived: 0,
            ringing: 0,
            notRinging: 0,
            noResponseByTelecaller: 0
          },
          callNotRingStatus: {
            switchOff: 0,
            numberNotReachable: 0,
            numberDoesNotExist: 0,
            noResponseByTelecaller: 0
          },
          callRingStatus: {
            callsConnected: 0,
            callsNotConnected: 0,
            noResponseByTelecaller: 0
          }
        }
      };
    }

    // Basic stats
    const totalResponses = filteredResponses.length;
    const capiResponses = filteredResponses.filter(r => r.interviewMode?.toUpperCase() === 'CAPI').length;
    const catiResponses = filteredResponses.filter(r => r.interviewMode?.toUpperCase() === 'CATI').length;
    
    // Calculate completion rate (assuming all approved responses are complete)
    const completionRate = survey?.sampleSize ? (totalResponses / survey.sampleSize) * 100 : 0;
    
    // Calculate average response time
    const totalResponseTime = filteredResponses.reduce((sum, r) => {
      return sum + (r.responses?.reduce((responseSum, resp) => responseSum + (resp.responseTime || 0), 0) || 0);
    }, 0);
    const averageResponseTime = totalResponseTime / totalResponses;

    // AC-wise stats
    const acMap = new Map();
    const districtMap = new Map();
    const lokSabhaMap = new Map();
    const interviewerMap = new Map();
    const genderMap = new Map();
    const ageMap = new Map();
    const dailyMap = new Map();

    filteredResponses.forEach(response => {
      const respondentInfo = getRespondentInfo(response.responses, response);
      
      // AC stats
      const ac = respondentInfo.ac;
      if (ac && ac !== 'N/A') {
        const currentCount = acMap.get(ac) || { total: 0, capi: 0, cati: 0 };
        currentCount.total += 1;
        
        // Check interview mode
        const interviewMode = response.interviewMode?.toUpperCase();
        if (interviewMode === 'CAPI') {
          currentCount.capi += 1;
        } else if (interviewMode === 'CATI') {
          currentCount.cati += 1;
        }
        
        acMap.set(ac, currentCount);
      }

      // District stats
      const district = respondentInfo.district;
      if (district && district !== 'N/A') {
        districtMap.set(district, (districtMap.get(district) || 0) + 1);
      }

      // Lok Sabha stats
      const lokSabha = respondentInfo.lokSabha;
      if (lokSabha && lokSabha !== 'N/A') {
        lokSabhaMap.set(lokSabha, (lokSabhaMap.get(lokSabha) || 0) + 1);
      }

      // Interviewer stats
      if (response.interviewer) {
        const interviewerName = `${response.interviewer.firstName} ${response.interviewer.lastName}`;
        interviewerMap.set(interviewerName, (interviewerMap.get(interviewerName) || 0) + 1);
      }

      // Gender stats
      const gender = respondentInfo.gender;
      if (gender && gender !== 'N/A') {
        genderMap.set(gender, (genderMap.get(gender) || 0) + 1);
      }

      // Age stats
      const age = parseInt(respondentInfo.age);
      if (!isNaN(age)) {
        const ageGroup = Math.floor(age / 10) * 10;
        ageMap.set(ageGroup, (ageMap.get(ageGroup) || 0) + 1);
      }

      // Daily stats
      const date = new Date(response.createdAt).toDateString();
      dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
    });

    // Convert maps to sorted arrays - First get ACs with responses
    const acStatsWithResponses = Array.from(acMap.entries())
      .map(([ac, data]) => ({ 
        ac, 
        count: data.total, 
        capi: data.capi, 
        cati: data.cati, 
        percentage: (data.total / totalResponses) * 100 
      }))
      .sort((a, b) => b.count - a.count);

    // Get all ACs for the state
    const allStateACs = getAllACsForState();
    console.log('🔍 Analytics - allStateACs:', allStateACs.length, 'ACs');
    console.log('🔍 Analytics - acStatsWithResponses:', acStatsWithResponses.length, 'ACs with responses');
    console.log('🔍 Analytics - acStatsWithResponses details:', acStatsWithResponses);
    
    // Create a set of ACs that already have responses
    const acsWithResponses = new Set(acStatsWithResponses.map(stat => stat.ac));
    console.log('🔍 Analytics - acsWithResponses set:', Array.from(acsWithResponses));
    
    // Add ACs with 0 responses
    const acsWithZeroResponses = allStateACs
      .filter(acName => !acsWithResponses.has(acName))
      .map(acName => ({
        ac: acName,
        count: 0,
        capi: 0,
        cati: 0,
        percentage: 0
      }))
      .sort((a, b) => a.ac.localeCompare(b.ac));

    console.log('🔍 Analytics - acsWithZeroResponses:', acsWithZeroResponses.length, 'ACs with 0 responses');
    console.log('🔍 Analytics - acsWithZeroResponses sample:', acsWithZeroResponses.slice(0, 3));

    // Combine and sort: ACs with responses first, then ACs with 0 responses
    const acStats = [...acStatsWithResponses, ...acsWithZeroResponses];
    console.log('🔍 Analytics - Final acStats:', acStats.length, 'total ACs');
    console.log('🔍 Analytics - Final acStats sample:', acStats.slice(0, 5));

    const districtStats = Array.from(districtMap.entries())
      .map(([district, count]) => ({ district, count, percentage: (count / totalResponses) * 100 }))
      .sort((a, b) => b.count - a.count);

    const lokSabhaStats = Array.from(lokSabhaMap.entries())
      .map(([lokSabha, count]) => ({ lokSabha, count, percentage: (count / totalResponses) * 100 }))
      .sort((a, b) => b.count - a.count);

    const interviewerStats = Array.from(interviewerMap.entries())
      .map(([interviewer, count]) => ({ interviewer, count, percentage: (count / totalResponses) * 100 }))
      .sort((a, b) => b.count - a.count);

    const genderStats = Object.fromEntries(genderMap);
    const ageStats = Object.fromEntries(ageMap);
    
    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate CAPI Performance stats
    const capiResponsesForStats = filteredResponses.filter(r => r.interviewMode?.toUpperCase() === 'CAPI');
    const capiApproved = capiResponsesForStats.filter(r => r.status?.toLowerCase() === 'approved').length;
    const capiRejected = capiResponsesForStats.filter(r => r.status?.toLowerCase() === 'rejected').length;

    // CATI Performance stats - use real data if available
    console.log('🔍🔍🔍 Analytics calculation - catiStats:', catiStats);
    console.log('🔍🔍🔍 Analytics calculation - catiStats?.callerPerformance:', catiStats?.callerPerformance);
    const catiPerformanceData = catiStats || {
      callerPerformance: {
        callsMade: 0,
        callsAttended: 0,
        dialsAttempted: 0,
        callsConnected: 0,
        totalTalkDuration: '0:00:00'
      },
      numberStats: {
        callNotReceived: 0,
        ringing: 0,
        notRinging: 0,
        noResponseByTelecaller: 0
      },
      callNotRingStatus: {
        switchOff: 0,
        numberNotReachable: 0,
        numberDoesNotExist: 0,
        noResponseByTelecaller: 0
      },
      callRingStatus: {
        callsConnected: 0,
        callsNotConnected: 0,
        noResponseByTelecaller: 0
      }
    };

    return {
      totalResponses,
      capiResponses,
      catiResponses,
      completionRate,
      averageResponseTime,
      acStats,
      districtStats,
      lokSabhaStats,
      interviewerStats,
      genderStats,
      ageStats,
      dailyStats,
      capiPerformance: {
        approved: capiApproved,
        rejected: capiRejected,
        total: capiResponsesForStats.length
      },
      catiPerformance: catiPerformanceData
    };
  }, [filteredResponses, survey, catiStats]);

  // Filter options
  const filterOptions = useMemo(() => {
    if (!responses || responses.length === 0) return { ac: [], district: [], lokSabha: [], interviewer: [] };

    const acSet = new Set();
    const districtSet = new Set();
    const lokSabhaSet = new Set();
    const interviewerSet = new Set();

    responses.forEach(response => {
      const respondentInfo = getRespondentInfo(response.responses, response);
      
      if (respondentInfo.ac && respondentInfo.ac !== 'N/A') {
        acSet.add(respondentInfo.ac);
      }
      if (respondentInfo.district && respondentInfo.district !== 'N/A') {
        districtSet.add(respondentInfo.district);
      }
      if (respondentInfo.lokSabha && respondentInfo.lokSabha !== 'N/A') {
        lokSabhaSet.add(respondentInfo.lokSabha);
      }
      if (response.interviewer) {
        interviewerSet.add(`${response.interviewer.firstName} ${response.interviewer.lastName}`);
      }
    });

    return {
      ac: Array.from(acSet).sort(),
      district: Array.from(districtSet).sort(),
      lokSabha: Array.from(lokSabhaSet).sort(),
      interviewer: Array.from(interviewerSet).sort()
    };
  }, [responses]);

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
      dateRange: 'all',
      startDate: '',
      endDate: '',
      status: 'all', // Default to all (Approved + Rejected)
      interviewMode: '',
      ac: '',
      district: '',
      lokSabha: '',
      interviewer: ''
    });
  };

  // Handle CSV download
  const handleCSVDownload = () => {
    if (filteredResponses.length === 0) {
      showError('No data to download');
      return;
    }

    const headers = [
      'Response ID',
      'Interview Mode',
      'Interviewer Name',
      'Interviewer Email',
      'Respondent Name',
      'Gender',
      'Age',
      'Assembly Constituency',
      'District',
      'Lok Sabha',
      'State',
      'City',
      'Response Date',
      'GPS Coordinates'
    ];

    const csvData = filteredResponses.map(response => {
      const respondentInfo = getRespondentInfo(response.responses, response);
      
      return [
        response.responseId || response._id?.slice(-8) || 'N/A',
        response.interviewMode?.toUpperCase() || 'N/A',
        response.interviewer ? `${response.interviewer.firstName} ${response.interviewer.lastName}` : 'N/A',
        response.interviewer ? response.interviewer.email : 'N/A',
        respondentInfo.name,
        respondentInfo.gender,
        respondentInfo.age,
        respondentInfo.ac,
        respondentInfo.district,
        respondentInfo.lokSabha,
        respondentInfo.state,
        respondentInfo.city,
        new Date(response.createdAt).toLocaleDateString(),
        response.location ? `(${response.location.latitude}, ${response.location.longitude})` : 'N/A'
      ];
    });

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${survey?.surveyName || 'survey'}_reports_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading survey reports...</p>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Survey not found</h3>
          <p className="text-gray-600 mb-4">The requested survey could not be found.</p>
          <button
            onClick={() => navigate('/company/surveys')}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Surveys</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 w-full survey-reports-page">
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
                    {survey.surveyName || survey.name}
                  </h1>
                  <p className="text-sm text-gray-600">Survey Reports & Analytics</p>
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
              </div>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white border-b border-gray-200 w-full">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
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

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => handleFilterChange('dateRange', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                {/* Interview Mode */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interview Mode</label>
                  <select
                    value={filters.interviewMode}
                    onChange={(e) => handleFilterChange('interviewMode', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Modes</option>
                    <option value="CAPI">CAPI</option>
                    <option value="CATI">CATI</option>
                  </select>
                </div>

                {/* Assembly Constituency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assembly Constituency</label>
                  <select
                    value={filters.ac}
                    onChange={(e) => handleFilterChange('ac', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All ACs</option>
                    {filterOptions.ac.map(ac => (
                      <option key={ac} value={ac}>{ac}</option>
                    ))}
                  </select>
                </div>

                {/* Interviewer */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interviewer</label>
                  <select
                    value={filters.interviewer}
                    onChange={(e) => handleFilterChange('interviewer', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Interviewers</option>
                    {filterOptions.interviewer.map(interviewer => (
                      <option key={interviewer} value={interviewer}>{interviewer}</option>
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
                  Showing {filteredResponses.length} of {responses.length} responses
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="w-full py-6 px-4 sm:px-6 lg:px-8">
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Responses</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalResponses.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Sample Size</p>
                <p className="text-2xl font-bold text-gray-900">
                  {survey?.sampleSize?.toLocaleString() || 
                   survey?.targetSampleSize?.toLocaleString() || 
                   survey?.specifications?.sampleSize?.toLocaleString() ||
                   survey?.survey?.sampleSize?.toLocaleString() ||
                   'N/A'}
                </p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-lg">
                <Target className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">CAPI Responses</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.capiResponses.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Activity className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">CATI Responses</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.catiResponses.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Geographic Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* AC-wise Stats */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Assembly Constituency Performance</h3>
              <MapPin className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              {analytics.acStats.slice(0, 5).map((stat, index) => (
                <div key={stat.ac} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-semibold rounded-full flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate">{stat.ac}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">{stat.count}</div>
                    <div className="text-xs text-gray-500">{stat.percentage.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowACModal(true)}
                className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium text-center"
              >
                View All ({analytics.acStats.length} ACs)
              </button>
            </div>
          </div>

          {/* Interviewer Performance */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Top Interviewers</h3>
              <Award className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              {analytics.interviewerStats.slice(0, 5).map((stat, index) => (
                <div key={stat.interviewer} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 bg-green-100 text-green-600 text-xs font-semibold rounded-full flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate">{stat.interviewer}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">{stat.count}</div>
                    <div className="text-xs text-gray-500">{stat.percentage.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowInterviewerModal(true)}
                className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium text-center"
              >
                View All ({analytics.interviewerStats.length} Interviewers)
              </button>
            </div>
          </div>
        </div>

        {/* Overall Time Graph */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Response Trends</h3>
          
          {/* Chart Container */}
          <div className="h-80 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading response trends...</p>
                </div>
              </div>
            ) : prepareChartData() ? (
              <Line data={prepareChartData()} options={chartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No response data available</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Complete some responses to see trends
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Chart Insights */}
          {analytics.dailyStats && analytics.dailyStats.length > 0 && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{analytics.totalResponses}</div>
                <div className="text-sm text-gray-600">Total Responses</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{analytics.capiResponses}</div>
                <div className="text-sm text-gray-600">CAPI Responses</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{analytics.catiResponses}</div>
                <div className="text-sm text-gray-600">CATI Responses</div>
              </div>
            </div>
          )}
        </div>

        {/* Additional Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gender Distribution */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Gender Distribution</h3>
            <div className="space-y-3">
              {Object.entries(analytics.genderStats).map(([gender, count]) => (
                <div key={gender} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 capitalize">{gender}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${(count / analytics.totalResponses) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Age Distribution */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Age Distribution</h3>
            <div className="space-y-3">
              {Object.entries(analytics.ageStats)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([ageGroup, count]) => (
                <div key={ageGroup} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{ageGroup}-{parseInt(ageGroup) + 9} years</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${(count / analytics.totalResponses) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Response Trends */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Daily Response Trends</h3>
            </div>
            <div className="space-y-3">
              {analytics.dailyStats.slice(-5).map((stat, index) => (
                <div key={stat.date} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {new Date(stat.date).toLocaleDateString()}
                  </span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full" 
                        style={{ width: `${(stat.count / Math.max(...analytics.dailyStats.map(d => d.count), 1)) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">{stat.count}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowDailyTrendsModal(true)}
                className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium text-center"
              >
                View All ({analytics.dailyStats.length} Days)
              </button>
            </div>
          </div>
        </div>
        </div>

        {/* CAPI Performance Section */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">CAPI Performance</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-3xl font-bold text-green-600 mb-2">{analytics.capiPerformance.approved}</div>
              <div className="text-sm font-medium text-green-800">Approved Interviews</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="text-3xl font-bold text-red-600 mb-2">{analytics.capiPerformance.rejected}</div>
              <div className="text-sm font-medium text-red-800">Rejected Interviews</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-3xl font-bold text-blue-600 mb-2">{analytics.capiPerformance.total}</div>
              <div className="text-sm font-medium text-blue-800">Total CAPI Interviews</div>
            </div>
          </div>
        </div>

        {/* CATI Performance Section - Show for multi-mode surveys or surveys with CATI responses */}
        {(() => {
          console.log('🔍 NEW CATI Debug - Survey object:', survey);
          console.log('🔍 NEW CATI Debug - Survey mode:', survey?.mode);
          console.log('🔍 NEW CATI Debug - Analytics capiResponses:', analytics.capiResponses);
          console.log('🔍 NEW CATI Debug - Analytics catiResponses:', analytics.catiResponses);
          
          // Show CATI section if:
          // 1. It's a multi-mode survey (has both CAPI and CATI responses)
          // 2. It has any CATI responses
          // 3. Survey mode is 'multi_mode' or 'cati'
          const isMultiMode = analytics.capiResponses > 0 && analytics.catiResponses > 0;
          const hasAnyCATI = analytics.catiResponses > 0;
          const isSurveyMultiMode = survey?.mode === 'multi_mode' || survey?.mode === 'cati';
          
          console.log('🔍 NEW CATI Debug - isMultiMode:', isMultiMode);
          console.log('🔍 NEW CATI Debug - hasAnyCATI:', hasAnyCATI);
          console.log('🔍 NEW CATI Debug - isSurveyMultiMode:', isSurveyMultiMode);
          console.log('🔍 NEW CATI Debug - Final result:', isMultiMode || hasAnyCATI || isSurveyMultiMode);
          
          // FORCE SHOW FOR DEBUGGING
          console.log('🔍 NEW CATI Debug - FORCING SHOW FOR DEBUG');
          return true;
        })() && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">CATI Performance</h3>
          
          {/* Caller Performance */}
          <div className="mb-8">
            <h4 className="text-md font-semibold text-gray-800 mb-4">Caller Performance</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-blue-600 mb-1">{analytics.catiPerformance.callerPerformance.callsMade}</div>
                <div className="text-xs font-medium text-blue-800">Calls Made</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="text-2xl font-bold text-green-600 mb-1">{analytics.catiPerformance.callerPerformance.callsAttended}</div>
                <div className="text-xs font-medium text-green-800">Calls Attended</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="text-2xl font-bold text-purple-600 mb-1">{analytics.catiPerformance.callerPerformance.dialsAttempted}</div>
                <div className="text-xs font-medium text-purple-800">Dials Attempted</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                <div className="text-2xl font-bold text-orange-600 mb-1">{analytics.catiPerformance.callerPerformance.callsConnected}</div>
                <div className="text-xs font-medium text-orange-800">Calls Connected</div>
              </div>
              <div className="text-center p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="text-2xl font-bold text-indigo-600 mb-1">{analytics.catiPerformance.callerPerformance.totalTalkDuration}</div>
                <div className="text-xs font-medium text-indigo-800">Talk Duration</div>
              </div>
            </div>
          </div>

          {/* Number Stats */}
          <div className="mb-8">
            <h4 className="text-md font-semibold text-gray-800 mb-4">Number Stats</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-2xl font-bold text-gray-600 mb-1">{analytics.catiPerformance.numberStats.callNotReceived}</div>
                <div className="text-xs font-medium text-gray-800">Call Not Received</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="text-2xl font-bold text-yellow-600 mb-1">{analytics.catiPerformance.numberStats.ringing}</div>
                <div className="text-xs font-medium text-yellow-800">Ringing</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="text-2xl font-bold text-red-600 mb-1">{analytics.catiPerformance.numberStats.notRinging}</div>
                <div className="text-xs font-medium text-red-800">Not Ringing</div>
              </div>
              <div className="text-center p-3 bg-pink-50 rounded-lg border border-pink-200">
                <div className="text-2xl font-bold text-pink-600 mb-1">{analytics.catiPerformance.numberStats.noResponseByTelecaller}</div>
                <div className="text-xs font-medium text-pink-800">No Response by Telecaller</div>
              </div>
            </div>
          </div>

          {/* Call Not Ring Status */}
          <div className="mb-8">
            <h4 className="text-md font-semibold text-gray-800 mb-4">Call Not Ring Status</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-2xl font-bold text-gray-600 mb-1">{analytics.catiPerformance.callNotRingStatus.switchOff}</div>
                <div className="text-xs font-medium text-gray-800">Switch Off</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="text-2xl font-bold text-red-600 mb-1">{analytics.catiPerformance.callNotRingStatus.numberNotReachable}</div>
                <div className="text-xs font-medium text-red-800">Number Not Reachable</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                <div className="text-2xl font-bold text-orange-600 mb-1">{analytics.catiPerformance.callNotRingStatus.numberDoesNotExist}</div>
                <div className="text-xs font-medium text-orange-800">Number Does Not Exist</div>
              </div>
              <div className="text-center p-3 bg-pink-50 rounded-lg border border-pink-200">
                <div className="text-2xl font-bold text-pink-600 mb-1">{analytics.catiPerformance.callNotRingStatus.noResponseByTelecaller}</div>
                <div className="text-xs font-medium text-pink-800">No Response by Telecaller</div>
              </div>
            </div>
          </div>

          {/* Call Ring Status */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-4">Call Ring Status</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="text-2xl font-bold text-green-600 mb-1">{analytics.catiPerformance.callRingStatus.callsConnected}</div>
                <div className="text-xs font-medium text-green-800">Calls Connected</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="text-2xl font-bold text-red-600 mb-1">{analytics.catiPerformance.callRingStatus.callsNotConnected}</div>
                <div className="text-xs font-medium text-red-800">Calls Not Connected</div>
              </div>
              <div className="text-center p-3 bg-pink-50 rounded-lg border border-pink-200">
                <div className="text-2xl font-bold text-pink-600 mb-1">{analytics.catiPerformance.callRingStatus.noResponseByTelecaller}</div>
                <div className="text-xs font-medium text-pink-800">No Response by Telecaller</div>
              </div>
            </div>
          </div>

          {/* Call Records Section */}
          {catiStats?.callRecords && catiStats.callRecords.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-gray-800">Call Records</h4>
                <button
                  onClick={() => setShowCallRecords(!showCallRecords)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {showCallRecords ? 'Hide' : 'Show'} Call Records ({catiStats.callRecords.length})
                </button>
              </div>
              
              {showCallRecords && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Call ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Interviewer</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Talk Time</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {catiStats.callRecords.map((call) => (
                          <tr key={call._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                              {call.callId?.substring(0, 20)}...
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{call.fromNumber}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{call.toNumber}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {call.interviewer ? call.interviewer.name : 'N/A'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                call.callStatus === 'answered' || call.callStatus === 'completed' 
                                  ? 'bg-green-100 text-green-800'
                                  : call.callStatus === 'no-answer'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : call.callStatus === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {call.callStatusDescription || call.callStatus}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {call.callDuration ? `${Math.floor(call.callDuration / 60)}:${(call.callDuration % 60).toString().padStart(2, '0')}` : 'N/A'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {call.talkDuration ? `${Math.floor(call.talkDuration / 60)}:${(call.talkDuration % 60).toString().padStart(2, '0')}` : 'N/A'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {call.callStartTime ? new Date(call.callStartTime).toLocaleDateString() : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* AC Performance Modal */}
        {showACModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  Assembly Constituency Performance
                  {survey?.acAssignmentState && (
                    <span className="text-sm font-normal text-gray-600 ml-2">
                      - {survey.acAssignmentState}
                    </span>
                  )}
                </h3>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      const csvData = analytics.acStats.map(stat => ({
                        'Assembly Constituency': stat.ac,
                        'Total Responses': stat.count,
                        'CAPI Responses': stat.capi,
                        'CATI Responses': stat.cati,
                        'Percentage': `${stat.percentage.toFixed(1)}%`
                      }));
                      const csvContent = [Object.keys(csvData[0]), ...csvData.map(row => Object.values(row))]
                        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
                        .join('\n');
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `ac_performance_${survey?.acAssignmentState || 'state'}_${new Date().toISOString().split('T')[0]}.csv`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(url);
                    }}
                    className="flex items-center space-x-2 px-3 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={() => setShowACModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Rank</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Assembly Constituency</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">Total Responses</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">CAPI</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">CATI</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.acStats.map((stat, index) => (
                      <tr key={stat.ac} className="border-b border-gray-100">
                        <td className="py-3 px-4">
                          <span className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-semibold rounded-full flex items-center justify-center">
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-900">{stat.ac}</td>
                        <td className="py-3 px-4 text-right font-semibold text-gray-900">{stat.count}</td>
                        <td className="py-3 px-4 text-right font-semibold text-green-600">{stat.capi}</td>
                        <td className="py-3 px-4 text-right font-semibold text-orange-600">{stat.cati}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{stat.percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Interviewer Performance Modal */}
        {showInterviewerModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">Interviewer Performance</h3>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      const csvData = analytics.interviewerStats.map(stat => ({
                        'Interviewer': stat.interviewer,
                        'Total Responses': stat.count,
                        'Percentage': `${stat.percentage.toFixed(1)}%`
                      }));
                      const csvContent = [Object.keys(csvData[0]), ...csvData.map(row => Object.values(row))]
                        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
                        .join('\n');
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `interviewer_performance_${new Date().toISOString().split('T')[0]}.csv`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(url);
                    }}
                    className="flex items-center space-x-2 px-3 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={() => setShowInterviewerModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Rank</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Interviewer</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">Total Responses</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.interviewerStats.map((stat, index) => (
                      <tr key={stat.interviewer} className="border-b border-gray-100">
                        <td className="py-3 px-4">
                          <span className="w-6 h-6 bg-green-100 text-green-600 text-xs font-semibold rounded-full flex items-center justify-center">
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-900">{stat.interviewer}</td>
                        <td className="py-3 px-4 text-right font-semibold text-gray-900">{stat.count}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{stat.percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Daily Trends Modal */}
        {showDailyTrendsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">Daily Response Trends</h3>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      const csvData = analytics.dailyStats.map(stat => ({
                        'Date': new Date(stat.date).toLocaleDateString(),
                        'Response Count': stat.count
                      }));
                      const csvContent = [Object.keys(csvData[0]), ...csvData.map(row => Object.values(row))]
                        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
                        .join('\n');
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `daily_trends_${new Date().toISOString().split('T')[0]}.csv`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(url);
                    }}
                    className="flex items-center space-x-2 px-3 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={() => setShowDailyTrendsModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                {analytics.dailyStats.map((stat, index) => (
                  <div key={stat.date} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-900">
                      {new Date(stat.date).toLocaleDateString()}
                    </span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-purple-600 h-2 rounded-full" 
                          style={{ width: `${(stat.count / Math.max(...analytics.dailyStats.map(d => d.count))) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 w-8 text-right">{stat.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default SurveyReportsPage;
