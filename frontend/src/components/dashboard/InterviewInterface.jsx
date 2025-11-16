import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  X, 
  CheckCircle, 
  Clock,
  ChevronLeft,
  ChevronRight,
  Menu
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { surveyResponseAPI } from '../../services/api';
import { getApiUrl } from '../../utils/config';

const InterviewInterface = ({ survey, onClose, onComplete }) => {
  const { showSuccess, showError } = useToast();
  
  // Core state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [validationErrors, setValidationErrors] = useState(new Set());
  const [targetAudienceErrors, setTargetAudienceErrors] = useState(new Map());
  const [genderQuotas, setGenderQuotas] = useState(null);
  const [othersTextInputs, setOthersTextInputs] = useState({}); // Store "Others" text input values by questionId
  const [shuffledOptions, setShuffledOptions] = useState({}); // Store shuffled options per questionId to maintain consistent order
  
  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState([]);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioStream, setAudioStream] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [audioSupported, setAudioSupported] = useState(false);
  
  // Timer state
  const [totalTime, setTotalTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const timerRef = useRef(null);
  const questionTimerRef = useRef(null);
  
  // Session state
  const [sessionData, setSessionData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  
  // AC Selection state
  const [selectedAC, setSelectedAC] = useState('');
  
  // Location state
  const [gpsLocation, setGpsLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const [locationError, setLocationError] = useState(null);
  
  // Permission modal state
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionType, setPermissionType] = useState(null); // 'location' or 'audio'
  const [permissionError, setPermissionError] = useState(null);


  // Comprehensive location detection with WiFi triangulation and multiple fallbacks
  const getCurrentLocation = useCallback(() => {
    return new Promise(async (resolve, reject) => {
      console.log('🎯 Starting comprehensive location detection...');
      console.log('🌐 Current URL:', window.location.href);
      console.log('🔒 Is secure context:', window.isSecureContext);
      console.log('📍 Geolocation available:', !!navigator.geolocation);

      // Strategy 1: Try WiFi triangulation (most accurate for laptops)
      try {
        console.log('🎯 Strategy 1: WiFi Triangulation...');
        const wifiLocation = await getLocationFromWiFi();
        if (wifiLocation) {
          console.log('✅ WiFi location obtained:', wifiLocation);
          resolve(wifiLocation);
          return;
        }
      } catch (error) {
        console.warn('❌ WiFi triangulation failed:', error.message);
      }

      // Strategy 2: Try browser geolocation with network location
      if (navigator.geolocation) {
        try {
          console.log('🎯 Strategy 2: Browser Geolocation (Network + GPS)...');
          const browserLocation = await getLocationFromBrowser();
          if (browserLocation) {
            console.log('✅ Browser location obtained:', browserLocation);
            resolve(browserLocation);
            return;
          }
        } catch (error) {
          console.warn('❌ Browser geolocation failed:', error.message);
        }
      }

      // Strategy 3: Try Google Maps Geolocation API
      try {
        console.log('🎯 Strategy 3: Google Maps Geolocation...');
        const googleLocation = await getLocationFromGoogleMaps();
        if (googleLocation) {
          console.log('✅ Google Maps location obtained:', googleLocation);
          resolve(googleLocation);
          return;
        }
      } catch (error) {
        console.warn('❌ Google Maps geolocation failed:', error.message);
      }

      // Strategy 4: Try manual location selection as last resort
      console.log('🎯 Strategy 4: Manual Location Selection...');
      const manualLocation = await getLocationFromManualSelection();
      if (manualLocation) {
        console.log('✅ Manual location obtained:', manualLocation);
        resolve(manualLocation);
        return;
      }

      // All strategies failed
      console.error('❌ All location detection methods failed');
      const errorMessage = 'Unable to determine your location. Please try enabling location services or select your location manually.';
      
      setLocationError(errorMessage);
      setShowPermissionModal(true);
      setPermissionType('location');
      setPermissionError(`
        <div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 class="font-semibold text-red-800 mb-2">🔧 Location Detection Failed</h4>
          <div class="text-sm text-red-700 space-y-2">
            <p><strong>All location detection methods failed. Please try:</strong></p>
            <ol class="ml-4 space-y-1">
              <li>1. Enable location services in your browser</li>
              <li>2. Allow location access when prompted</li>
              <li>3. Try a different browser (Safari works better on macOS)</li>
              <li>4. Ensure you're using HTTPS</li>
              <li>5. Try from a different location with better network coverage</li>
            </ol>
          </div>
        </div>
      `);
      
      reject(new Error(errorMessage));
    });
  }, []);

  // WiFi triangulation using browser's network location
  const getLocationFromWiFi = async () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      // Use network location (WiFi triangulation) - most accurate for laptops
      const options = {
        enableHighAccuracy: false, // Use network location instead of GPS
        timeout: 15000,
        maximumAge: 300000 // 5 minutes cache
      };

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude, accuracy } = position.coords;
            
            // Get address from coordinates
            const address = await reverseGeocode(latitude, longitude);
            
            const locationData = {
              latitude,
              longitude,
              accuracy,
              address: address.address,
              city: address.city,
              state: address.state,
              country: address.country,
              timestamp: new Date(),
              source: 'wifi_triangulation'
            };
            
            resolve(locationData);
          } catch (error) {
            // Still resolve with coordinates even if address fails
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: new Date(),
              source: 'wifi_triangulation'
            });
          }
        },
        (error) => {
          reject(new Error(`WiFi triangulation failed: ${error.message}`));
        },
        options
      );
    });
  };

  // Browser geolocation with multiple strategies
  const getLocationFromBrowser = async () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      // Try high accuracy first, then fallback to network location
      const highAccuracyOptions = {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      };

      const networkOptions = {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 300000
      };

      const tryLocation = (options, strategyName) => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude, accuracy } = position.coords;
              const address = await reverseGeocode(latitude, longitude);
              
              resolve({
                latitude,
                longitude,
                accuracy,
                address: address.address,
                city: address.city,
                state: address.state,
                country: address.country,
                timestamp: new Date(),
                source: `browser_${strategyName}`
              });
            } catch (error) {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date(),
                source: `browser_${strategyName}`
              });
            }
          },
          (error) => {
            if (options.enableHighAccuracy) {
              // Try network location as fallback
              tryLocation(networkOptions, 'network');
            } else {
              reject(new Error(`Browser geolocation failed: ${error.message}`));
            }
          },
          options
        );
      };

      tryLocation(highAccuracyOptions, 'gps');
    });
  };

  // Google Maps Geolocation API
  const getLocationFromGoogleMaps = async () => {
    try {
      // Load Google Maps API
      await loadGoogleMapsAPI();
      
      return new Promise((resolve, reject) => {
        if (!window.google || !window.google.maps) {
          reject(new Error('Google Maps API not available'));
          return;
        }

        // Use Google Maps Geolocation
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude, accuracy } = position.coords;
              const address = await reverseGeocode(latitude, longitude);
              
              resolve({
                latitude,
                longitude,
                accuracy,
                address: address.address,
                city: address.city,
                state: address.state,
                country: address.country,
                timestamp: new Date(),
                source: 'google_maps'
              });
            } catch (error) {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date(),
                source: 'google_maps'
              });
            }
          },
          (error) => {
            reject(new Error(`Google Maps geolocation failed: ${error.message}`));
          },
          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
          }
        );
      });
    } catch (error) {
      throw new Error(`Google Maps API failed: ${error.message}`);
    }
  };

  // Manual location selection
  const getLocationFromManualSelection = async () => {
    return new Promise((resolve) => {
      // Show manual location picker modal
      setShowPermissionModal(true);
      setPermissionType('location');
      setPermissionError(`
        <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 class="font-semibold text-blue-800 mb-2">📍 Manual Location Selection</h4>
          <div class="text-sm text-blue-700 space-y-2">
            <p>Since automatic location detection failed, please:</p>
            <ol class="ml-4 space-y-1">
              <li>1. Click "Allow Location Access" to try again</li>
              <li>2. Or manually enter your location details</li>
              <li>3. Ensure you're in a location with good network coverage</li>
            </ol>
          </div>
        </div>
      `);
      
      // For now, return null - user will need to retry
      resolve(null);
    });
  };

  // Load Google Maps API
  const loadGoogleMapsAPI = async () => {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve(window.google);
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        if (window.google && window.google.maps) {
          resolve(window.google);
        } else {
          reject(new Error('Google Maps API failed to load'));
        }
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load Google Maps API'));
      };
      
      document.head.appendChild(script);
    });
  };

  // Reverse geocoding function using free Nominatim API
  const reverseGeocode = async (latitude, longitude) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'OpineIndia-SurveyApp/1.0'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Reverse geocoding failed');
      }
      
      const data = await response.json();
      
      return {
        address: data.display_name || 'Unknown Address',
        city: data.address?.city || data.address?.town || data.address?.village || 'Unknown City',
        state: data.address?.state || 'Unknown State',
        country: data.address?.country || 'Unknown Country'
      };
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return {
        address: 'Address not available',
        city: 'Unknown City',
        state: 'Unknown State',
        country: 'Unknown Country'
      };
    }
  };

  // Fetch gender quotas from backend
  const fetchGenderQuotas = useCallback(async () => {
    try {
      const response = await surveyResponseAPI.getGenderResponseCounts(survey._id);
      if (response.success) {
        setGenderQuotas(response.data.genderQuotas);
      }
    } catch (error) {
      console.error('Error fetching gender quotas:', error);
    }
  }, [survey._id]);

  // Check audio support when component mounts
  useEffect(() => {
    const checkAudioSupport = () => {
      const isSupported = !!(
        navigator.mediaDevices && 
        navigator.mediaDevices.getUserMedia && 
        window.MediaRecorder
      );
      
      
      setAudioSupported(isSupported);
    };
    
    checkAudioSupport();
  }, []);

  // Fetch gender quotas when component mounts
  useEffect(() => {
    if (survey._id) {
      fetchGenderQuotas();
    }
  }, [survey._id, fetchGenderQuotas]);

  // Audio recording functions
  const startAudioRecording = useCallback(async () => {
    try {
      // Check if MediaDevices API is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported. Please use a modern browser with HTTPS.');
      }

      // Check if we're on HTTPS (required for microphone access)
      // Allow development server IP for testing
      const isDevelopmentServer = window.location.hostname === '74.225.250.243' || window.location.hostname === 'localhost';
      if (window.location.protocol !== 'https:' && !isDevelopmentServer) {
        throw new Error('Microphone access requires HTTPS. Please access the site via HTTPS or use localhost for development.');
      }

            // Request microphone access with simpler constraints
            const stream = await navigator.mediaDevices.getUserMedia({ 
              audio: true
            });
            
      
      setAudioStream(stream);
      
      // Create MediaRecorder with fallback formats - try MP3 first
      let mimeType = 'audio/mp4'; // Try MP4 first for better compatibility
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Use default
          }
        }
      }
      
      
      const recorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000, // Increased bitrate for better mobile compatibility
        audioSampleRate: 44100 // Standard sample rate for better compatibility
      });
      
      const chunks = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          setAudioChunks(prev => [...prev, event.data]); // Update state as well
        }
      };
      
      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: mimeType || 'audio/mp4' });
        setAudioBlob(audioBlob);
        setAudioChunks(chunks);
        
        // Create URL for playback
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null);
      };
      
            recorder.onstart = () => {
              setIsRecording(true);
              setIsAudioPaused(false);
            };
      
      recorder.onpause = () => {
        setIsAudioPaused(true);
      };
      
            recorder.onresume = () => {
              setIsAudioPaused(false);
            };
            
            recorder.onerror = (event) => {
              console.error('MediaRecorder error:', event.error);
              setIsRecording(false);
            };
      
      setMediaRecorder(recorder);
            // Use different intervals for mobile vs desktop
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const interval = isMobile ? 500 : 100; // Slower for mobile devices
            recorder.start(interval);
      
    } catch (error) {
      console.error('Error starting audio recording:', error);
      
      // Provide specific error messages based on error type
      let errorMessage = 'Failed to start audio recording. ';
      let troubleshooting = '';
      
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Microphone access denied.';
        troubleshooting = `
          <div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 class="font-semibold text-yellow-800 mb-2">🔧 Microphone Permission Required</h4>
            <div class="text-sm text-yellow-700 space-y-2">
              <p><strong>For Desktop Browsers:</strong></p>
              <ol class="ml-4 space-y-1">
                <li>1. Click the microphone icon in the address bar</li>
                <li>2. Select "Allow" for microphone access</li>
                <li>3. Refresh the page and try again</li>
              </ol>
              <p><strong>For Mobile Browsers:</strong></p>
              <ol class="ml-4 space-y-1">
                <li>1. Go to Settings → Privacy & Security → Microphone</li>
                <li>2. Enable microphone access for your browser</li>
                <li>3. Restart the browser and try again</li>
              </ol>
            </div>
          </div>
        `;
        setPermissionError(troubleshooting);
        setPermissionType('audio');
        setShowPermissionModal(true);
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No microphone found.';
        troubleshooting = `
          <div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h4 class="font-semibold text-red-800 mb-2">🔧 No Microphone Detected</h4>
            <div class="text-sm text-red-700 space-y-2">
              <p><strong>Please check:</strong></p>
              <ul class="ml-4 space-y-1">
                <li>• Microphone is connected and working</li>
                <li>• No other applications are using the microphone</li>
                <li>• Try refreshing the page</li>
                <li>• Check browser permissions for microphone access</li>
              </ul>
            </div>
          </div>
        `;
        setPermissionError(troubleshooting);
        setPermissionType('audio');
        setShowPermissionModal(true);
      } else if (error.name === 'NotSupportedError') {
        errorMessage += 'Audio recording not supported in this browser.';
        troubleshooting = `
          <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 class="font-semibold text-blue-800 mb-2">🔧 Browser Compatibility Issue</h4>
            <div class="text-sm text-blue-700 space-y-2">
              <p><strong>Try these solutions:</strong></p>
              <ul class="ml-4 space-y-1">
                <li>• Use a modern browser (Chrome, Firefox, Safari, Edge)</li>
                <li>• Ensure you're using HTTPS (not HTTP)</li>
                <li>• Update your browser to the latest version</li>
                <li>• Try a different browser</li>
              </ul>
            </div>
          </div>
        `;
        setPermissionError(troubleshooting);
        setPermissionType('audio');
        setShowPermissionModal(true);
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Microphone is being used by another application.';
        troubleshooting = `
          <div class="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h4 class="font-semibold text-orange-800 mb-2">🔧 Microphone Busy</h4>
            <div class="text-sm text-orange-700">
              <p><strong>Please close these applications:</strong></p>
              <ul class="ml-4 space-y-1">
                <li>• Video calling apps (Zoom, Teams, Skype)</li>
                <li>• Voice recording apps</li>
                <li>• Other browser tabs using microphone</li>
                <li>• System audio recording software</li>
              </ul>
            </div>
          </div>
        `;
        setPermissionError(troubleshooting);
        setPermissionType('audio');
        setShowPermissionModal(true);
      } else if (error.message.includes('HTTPS')) {
        errorMessage = error.message;
      } else if (error.message.includes('MediaDevices API')) {
        errorMessage = error.message;
      } else {
        errorMessage += 'Please check microphone permissions and try again.';
      }
      
      // Show error message
      if (!troubleshooting) {
        showError(errorMessage);
      }
    }
  }, [showError]);

  const stopAudioRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      setIsAudioPaused(false);
    }
  }, [mediaRecorder]);

  const pauseAudioRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
    }
  }, [mediaRecorder]);

  const resumeAudioRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
    }
  }, [mediaRecorder]);

  // Upload audio to server
  const uploadAudioFile = useCallback(async (audioBlob, sessionId) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `interview_${sessionId}_${Date.now()}.webm`);
      formData.append('sessionId', sessionId);
      formData.append('surveyId', survey._id);
      
      const response = await fetch(getApiUrl('/api/survey-responses/upload-audio'), {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed:', response.status, errorText);
        throw new Error(`Failed to upload audio: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      console.log('Audio upload successful:', result);
      return result.data.audioUrl;
    } catch (error) {
      console.error('Error uploading audio:', error);
      throw error;
    }
  }, [survey._id]);

  // Get all questions from all sections
  const getAllQuestions = () => {
    const allQuestions = [];
    
    // Check if AC selection is required
    const requiresACSelection = sessionData?.requiresACSelection && 
                               sessionData?.assignedACs && 
                               sessionData.assignedACs.length > 0;

    // Debug logging (can be removed in production)
    // console.log('=== getAllQuestions AC SELECTION DEBUG ===');
    // console.log('sessionData:', sessionData);
    // console.log('requiresACSelection:', requiresACSelection);
    // console.log('assignedACs:', sessionData?.assignedACs);
    // console.log('=== END getAllQuestions AC SELECTION DEBUG ===');
    
    // Add AC selection question as first question if required
    if (requiresACSelection) {
      const acQuestion = {
        id: 'ac-selection',
        type: 'single_choice',
        text: 'Select Assembly Constituency',
        description: 'Please select the Assembly Constituency where you are conducting this interview.',
        required: true,
        order: -1, // Make it appear first
        options: sessionData.assignedACs.map(ac => ({
          id: `ac-${ac}`,
          text: ac,
          value: ac
        })),
        sectionIndex: -1, // Special section for AC selection
        questionIndex: -1,
        sectionId: 'ac-selection',
        sectionTitle: 'Assembly Constituency Selection',
        isACSelection: true // Flag to identify this special question
      };
      allQuestions.push(acQuestion);
    }
    
    // Add regular survey questions
    survey.sections?.forEach((section, sectionIndex) => {
      section.questions?.forEach((question, questionIndex) => {
        allQuestions.push({
          ...question,
          sectionIndex,
          questionIndex,
          sectionId: section.id,
          sectionTitle: section.title
        });
      });
    });
    return allQuestions;
  };

  const allQuestions = useMemo(() => getAllQuestions(), [sessionData, survey]);
  const currentQuestion = allQuestions[currentQuestionIndex];

  // Debug: Log when sessionData changes (can be removed in production)
  // useEffect(() => {
  //   console.log('=== sessionData CHANGED ===');
  //   console.log('sessionData:', sessionData);
  //   console.log('allQuestions length:', allQuestions.length);
  //   console.log('First question:', allQuestions[0]);
  //   console.log('=== END sessionData CHANGED ===');
  // }, [sessionData, allQuestions]);

  // Debug: Log all questions and their conditions (commented out for production)
  // useEffect(() => {
  //   console.log('=== SURVEY QUESTIONS DEBUG ===');
  //   allQuestions.forEach((question, index) => {
  //     console.log(`Question ${index}: "${question.text}"`);
  //     console.log(`  - ID: ${question.id}`);
  //     console.log(`  - Conditions:`, question.conditions);
  //     console.log(`  - Type: ${question.type}`);
  //   });
  //   console.log('=== END SURVEY QUESTIONS DEBUG ===');
  // }, [allQuestions]);

  // Timer functions
  const startTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    
    // Use a more direct approach with useRef to avoid stale closures
    let currentTime = 0;
    timerRef.current = setInterval(() => {
      currentTime += 1;
      setTotalTime(currentTime);
    }, 1000);
    
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);


  const stopQuestionTimer = useCallback(() => {
    if (questionStartTime) {
      return Math.floor((Date.now() - questionStartTime) / 1000);
    }
    return 0;
  }, [questionStartTime]);

  // Format time
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if response has content
  const hasResponseContent = (response) => {
    if (response === null || response === undefined) return false;
    if (typeof response === 'string') return response.trim().length > 0;
    if (Array.isArray(response)) return response.length > 0;
    if (typeof response === 'number') return !isNaN(response) && isFinite(response); // Allow 0 and negative numbers
    if (typeof response === 'boolean') return true;
    return true;
  };

  // Validate age against target audience requirements
  const validateAge = (age) => {
    const ageRange = survey.targetAudience?.demographics?.ageRange;
    if (!ageRange || !ageRange.min || !ageRange.max) return null; // No age restrictions
    
    const ageNum = parseInt(age);
    if (isNaN(ageNum)) return null; // Invalid age format
    
    if (ageNum < ageRange.min || ageNum > ageRange.max) {
      return `Only respondents of age between ${ageRange.min} and ${ageRange.max} are allowed to participate`;
    }
    return null; // Valid age
  };

  // Validate gender against target audience requirements and quotas
  const validateGender = (gender) => {
    const genderRequirements = survey.targetAudience?.demographics?.genderRequirements;
    if (!genderRequirements) return null; // No gender restrictions
    
    // Check if the selected gender is allowed
    const allowedGenders = Object.keys(genderRequirements).filter(g => 
      genderRequirements[g] && !g.includes('Percentage')
    );
    
    if (allowedGenders.length === 0) return null; // No gender restrictions
    
    // Map the response value to the requirement key format
    const genderMapping = {
      'male': 'Male',
      'female': 'Female', 
      'non_binary': 'Non-binary'
    };
    
    const mappedGender = genderMapping[gender];
    if (!mappedGender || !allowedGenders.includes(mappedGender)) {
      const allowedList = allowedGenders.join(', ');
      return `Only ${allowedList} respondents are allowed to participate`;
    }

    // Check quota if available
    if (genderQuotas && genderQuotas[mappedGender]) {
      const quota = genderQuotas[mappedGender];
      if (quota.isFull) {
        return `Sample size for ${mappedGender} is completed. Please select a different gender.`;
      }
    }

    return null; // Valid gender
  };

  // Validate fixed questions against target audience
  const validateFixedQuestion = (questionId, response) => {
    if (questionId === 'fixed_respondent_age') {
      return validateAge(response);
    } else if (questionId === 'fixed_respondent_gender') {
      return validateGender(response);
    }
    return null; // No validation for other questions
  };

  // Check if all required questions are answered
  const areAllRequiredQuestionsAnswered = () => {
    return visibleQuestions.every(question => {
      if (!question.required) return true;
      const response = responses[question.id];
      return hasResponseContent(response);
    });
  };

  // Find first unanswered required question
  const findFirstUnansweredRequiredQuestion = () => {
    return visibleQuestions.find(question => {
      if (!question.required) return false;
      const response = responses[question.id];
      return !hasResponseContent(response);
    });
  };

  // Check if a specific question is required and unanswered
  const isQuestionRequiredAndUnanswered = (question) => {
    if (!question.required) return false;
    const response = responses[question.id];
    return !hasResponseContent(response);
  };

  // Evaluate conditional logic for a question
  const evaluateConditions = useCallback((question) => {
    if (!question.conditions || question.conditions.length === 0) {
      // console.log(`Question "${question.text}" has no conditions, showing by default`);
      return true;
    }

    // console.log(`Evaluating conditions for question: ${question.text}`, question.conditions);

    const results = question.conditions.map((condition, index) => {
      const response = responses[condition.questionId];
      
      // console.log(`Condition ${index}: questionId=${condition.questionId}, operator=${condition.operator}, value=${condition.value}, response=`, response);
      
      if (response === undefined || response === null) {
        // console.log(`Condition ${index}: No response found, returning false`);
        return false;
      }

      let met = false;

      switch (condition.operator) {
        case 'equals':
          met = String(response).toLowerCase() === String(condition.value).toLowerCase();
          break;
        case 'not_equals':
          met = String(response).toLowerCase() !== String(condition.value).toLowerCase();
          break;
        case 'contains':
          met = String(response).toLowerCase().includes(condition.value.toLowerCase());
          break;
        case 'not_contains':
          met = !String(response).toLowerCase().includes(condition.value.toLowerCase());
          break;
        case 'greater_than':
          met = parseFloat(response) > parseFloat(condition.value);
          break;
        case 'less_than':
          met = parseFloat(response) < parseFloat(condition.value);
          break;
        case 'is_empty':
          met = !hasResponseContent(response);
          break;
        case 'is_not_empty':
          met = hasResponseContent(response);
          break;
        case 'is_selected':
          if (Array.isArray(response)) {
            met = response.some(r => String(r).toLowerCase() === String(condition.value).toLowerCase());
          } else {
            met = String(response).toLowerCase() === String(condition.value).toLowerCase();
          }
          break;
        case 'is_not_selected':
          if (Array.isArray(response)) {
            met = !response.some(r => String(r).toLowerCase() === String(condition.value).toLowerCase());
          } else {
            met = String(response).toLowerCase() !== String(condition.value).toLowerCase();
          }
          break;
        default:
          met = false;
      }


      // console.log(`Condition ${index}: Result = ${met}`);
      return met;
    });

    // Handle AND/OR logic between conditions
    if (results.length === 1) {
      // console.log(`Single condition result: ${results[0]}`);
      return results[0];
    }

    let finalResult = results[0];
    for (let i = 1; i < results.length; i++) {
      const logic = question.conditions[i].logic || 'AND';
      if (logic === 'AND') {
        finalResult = finalResult && results[i];
      } else if (logic === 'OR') {
        finalResult = finalResult || results[i];
      }
    }

    // console.log(`Final condition result for "${question.text}": ${finalResult}`);
    return finalResult;
  }, [responses]);

  // Get visible questions based on conditional logic - memoized for performance
  const visibleQuestions = useMemo(() => {
    const visible = allQuestions.filter(question => {
      const shouldShow = evaluateConditions(question);
      // console.log(`Question "${question.text}" should show: ${shouldShow}`);
      return shouldShow;
    });
    // console.log(`Visible questions: ${visible.length} out of ${allQuestions.length}`);
    return visible;
  }, [allQuestions, responses, evaluateConditions]); // Only recalculate when responses change

  const currentVisibleIndex = visibleQuestions.findIndex(q => q.id === currentQuestion?.id);
  const currentVisibleQuestion = visibleQuestions[currentVisibleIndex];

  // Handle response change
  const handleResponseChange = useCallback((questionId, response) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: response
    }));
    
    // Handle AC selection specially
    if (questionId === 'ac-selection') {
      setSelectedAC(response);
    }
    
    // Clear validation error for this question if it has content
    if (hasResponseContent(response)) {
      setValidationErrors(prev => {
        const newErrors = new Set(prev);
        newErrors.delete(questionId);
        return newErrors;
      });
    }

    // Real-time target audience validation for fixed questions
    if (hasResponseContent(response)) {
      const validationError = validateFixedQuestion(questionId, response);
      setTargetAudienceErrors(prev => {
        const newErrors = new Map(prev);
        if (validationError) {
          newErrors.set(questionId, validationError);
        } else {
          newErrors.delete(questionId);
        }
        return newErrors;
      });

      // Refresh gender quotas if gender question is answered
      if (questionId === 'fixed_respondent_gender') {
        // Small delay to allow backend to process the response
        setTimeout(() => {
          fetchGenderQuotas();
        }, 1000);
      }
    } else {
      // Clear target audience error if response is empty
      setTargetAudienceErrors(prev => {
        const newErrors = new Map(prev);
        newErrors.delete(questionId);
        return newErrors;
      });
    }
  }, []);

  // Navigate to next question
  const goToNextQuestion = () => {
    if (currentVisibleIndex < visibleQuestions.length - 1) {
      setCurrentQuestionIndex(prev => {
        const nextVisibleQuestion = visibleQuestions[currentVisibleIndex + 1];
        return allQuestions.findIndex(q => q.id === nextVisibleQuestion.id);
      });
    } else {
      // End of survey
      completeInterview();
    }
  };

  // Navigate to previous question
  const goToPreviousQuestion = () => {
    if (currentVisibleIndex > 0) {
      setCurrentQuestionIndex(prev => {
        const prevVisibleQuestion = visibleQuestions[currentVisibleIndex - 1];
        return allQuestions.findIndex(q => q.id === prevVisibleQuestion.id);
      });
    }
  };

  // Navigate to specific question
  const navigateToQuestion = (questionId) => {
    const questionIndex = allQuestions.findIndex(q => q.id === questionId);
    if (questionIndex !== -1) {
      setCurrentQuestionIndex(questionIndex);
    }
  };

  // Start the interview process after permissions are granted
  const startInterviewProcess = useCallback(async () => {
    try {
      const response = await surveyResponseAPI.startInterview(survey._id);
      
      if (response.success) {
        setSessionData(response.data);
        setSessionId(response.data.sessionId);
        setIsPaused(false);
        setIsInterviewActive(true);

        // Start audio recording if supported and in CAPI mode
        if (survey.mode === 'capi' && audioSupported) {
          try {
            await startAudioRecording();
          } catch (error) {
            // Audio recording failed, but continue with interview
            console.warn('Audio recording failed, continuing without audio:', error);
            showError('Audio recording unavailable. Interview will continue without audio recording.');
          }
        } else if (survey.mode === 'capi' && !audioSupported) {
          console.warn('Audio recording not supported in this browser/environment');
        }
      } else {
        showError('Failed to start interview');
      }
    } catch (error) {
      console.error('Error starting interview:', error);
      showError('Failed to start interview');
    } finally {
      setIsLoading(false);
        setIsStarting(false);
    }
  }, [survey._id, survey.mode, audioSupported, startAudioRecording, showError]);

  // Check audio permission separately
  const checkAudioPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
      console.log('Audio permission granted');
      
      // Continue with interview start
      await startInterviewProcess();
    } catch (audioErr) {
      console.error('Audio permission error:', audioErr);
      
      // Show modern permission modal
      setPermissionType('audio');
      setPermissionError(audioErr.message);
      setShowPermissionModal(true);
        setIsLoading(false);
      setIsStarting(false);
    }
  }, [startInterviewProcess]);

  // Start the actual interview
  const startActualInterview = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsStarting(true);
      setShowWelcomeModal(false);
      
      // Check for location and audio permissions first
      setLocationPermission('checking');
      setLocationError(null);
      
      try {
        // Get location
        const locationData = await getCurrentLocation();
        setGpsLocation(locationData);
        setLocationPermission('granted');
        console.log('Location obtained:', locationData);
        
        // Location successful, now check audio
        await checkAudioPermission();
      } catch (locationErr) {
        console.error('Location error:', locationErr);
        setLocationError(locationErr.message);
        setLocationPermission('denied');
        
        // Show modern permission modal with option to continue without location
        setPermissionType('location');
        setPermissionError(locationErr.message);
        setShowPermissionModal(true);
        setIsLoading(false);
        setIsStarting(false);
        return;
      }
    } catch (error) {
      console.error('Error starting interview:', error);
      showError('Failed to start interview');
      setIsLoading(false);
      setIsStarting(false);
    }
  }, [survey._id, checkAudioPermission, getCurrentLocation, showError, startInterviewProcess]);

  // Complete interview
  const completeInterview = async () => {
    try {
      setIsLoading(true);

      // Check if all required questions are answered
      if (!areAllRequiredQuestionsAnswered()) {
        const firstUnanswered = findFirstUnansweredRequiredQuestion();
        if (firstUnanswered) {
          // Add validation error for this question
          setValidationErrors(prev => new Set([...prev, firstUnanswered.id]));
          
          // Navigate to the first unanswered required question
          const questionIndex = allQuestions.findIndex(q => q.id === firstUnanswered.id);
          if (questionIndex !== -1) {
            setCurrentQuestionIndex(questionIndex);
            const sectionNumber = firstUnanswered.sectionIndex + 1;
            const questionInSection = firstUnanswered.questionIndex + 1;
            showError(`Question ${sectionNumber}.${questionInSection} is required. Please answer: "${firstUnanswered.text}"`);
            return;
          }
        }
        showError('Please answer all required questions before completing the interview.');
        return;
      }

      // Check for target audience validation errors
      if (targetAudienceErrors.size > 0) {
        const firstErrorQuestionId = targetAudienceErrors.keys().next().value;
        const errorMessage = targetAudienceErrors.get(firstErrorQuestionId);
        
        // Navigate to the first question with target audience error
        const questionIndex = allQuestions.findIndex(q => q.id === firstErrorQuestionId);
        if (questionIndex !== -1) {
          setCurrentQuestionIndex(questionIndex);
          showError(errorMessage);
          return;
        }
      }

      // Stop audio recording and upload if available
      let audioUrl = null;
      let audioRecordingData = {
        hasAudio: false,
        audioUrl: null,
        recordingDuration: 0,
        format: 'mp4',
        codec: 'opus',
        bitrate: 96000,
        fileSize: 0,
        uploadedAt: null
      };
      
      if (isRecording) {
        
        // Create a promise that resolves with the audio blob
        const audioBlobPromise = new Promise((resolve) => {
          // Store the original onstop handler
          const originalOnStop = mediaRecorder.onstop;
          
          // Override the onstop handler to resolve our promise
          mediaRecorder.onstop = () => {
            console.log('Promise: MediaRecorder stopped, creating blob from chunks'); // Debug log
            
            // Create blob from the collected chunks
            const blob = new Blob(audioChunks, { type: 'audio/mp4' });
            console.log('Promise: Audio blob created:', blob.size, 'bytes'); // Debug log
            
            // Set the state
            setAudioBlob(blob);
            setAudioUrl(URL.createObjectURL(blob));
            
            // Stop all tracks to release microphone
            if (audioStream) {
              audioStream.getTracks().forEach(track => track.stop());
              setAudioStream(null);
            }
            
            // Call original handler if it exists
            if (originalOnStop) {
              originalOnStop();
            }
            
            resolve(blob);
          };
        });
        
        // Stop the recording
        stopAudioRecording();
        
        // Wait for the audio blob to be created
        
        try {
          const blob = await audioBlobPromise;
          
          if (blob && blob.size > 0) {
            audioUrl = await uploadAudioFile(blob, sessionId);
            audioRecordingData = {
              hasAudio: true,
              audioUrl: audioUrl,
              recordingDuration: Math.round(totalTime), // Use totalTime as recording duration
              format: 'mp4',
              codec: 'opus',
              bitrate: 96000,
              fileSize: blob.size,
              uploadedAt: new Date().toISOString()
            };
          } else {
            showError('Failed to create audio recording. Interview will continue without audio.');
          }
        } catch (error) {
          console.error('Error processing audio:', error);
          showError('Failed to process audio recording. Interview will continue without audio.');
        }
      } else {
      }

      // Prepare final responses array
      const finalResponses = [];
      
      allQuestions.forEach((question, index) => {
        const response = responses[question.id];
        const responseTime = stopQuestionTimer();
        
        // Convert options to the format expected by backend (array of strings)
        const questionOptions = question.options ? 
          question.options.map(option => {
            if (typeof option === 'object') {
              return option.text || option.value || option;
            }
            return option;
          }) : [];
        
        // Find "Others" option value for this question
        const othersOption = question.options?.find(opt => {
          const optText = typeof opt === 'object' ? opt.text : opt;
          return optText && (optText.toLowerCase().trim() === 'others' || optText.toLowerCase().trim() === 'other');
        });
        const othersOptionValue = othersOption ? (typeof othersOption === 'object' ? othersOption.value || othersOption.text : othersOption) : null;
        
        // Process response to include option codes and handle "Others" text input
        let processedResponse = response || (question.type === 'multiple_choice' ? [] : '');
        let responseCodes = null;
        let responseWithCodes = null;
        
        if (question.type === 'multiple_choice' && question.options) {
          if (Array.isArray(processedResponse)) {
            // Multiple selection
            responseCodes = [];
            responseWithCodes = [];
            
            processedResponse.forEach(respValue => {
              const selectedOption = question.options.find(opt => {
                const optValue = typeof opt === 'object' ? opt.value || opt.text : opt;
                return optValue === respValue;
              });
              
              if (selectedOption) {
                const optText = typeof selectedOption === 'object' ? selectedOption.text : selectedOption;
                const optCode = typeof selectedOption === 'object' ? selectedOption.code : null;
                const isOthersOption = optText && (optText.toLowerCase().trim() === 'others' || optText.toLowerCase().trim() === 'other');
                
                if (isOthersOption) {
                  // Get the "Others" text input value
                  const othersText = othersTextInputs[`${question.id}_${respValue}`] || '';
                  if (othersText) {
                    // Save with code but answer is the text input
                    responseCodes.push(optCode || respValue);
                    responseWithCodes.push({
                      code: optCode || respValue,
                      answer: othersText,
                      optionText: optText
                    });
                  } else {
                    // No text provided, just save the option
                    responseCodes.push(optCode || respValue);
                    responseWithCodes.push({
                      code: optCode || respValue,
                      answer: optText,
                      optionText: optText
                    });
                  }
                } else {
                  // Regular option
                  responseCodes.push(optCode || respValue);
                  responseWithCodes.push({
                    code: optCode || respValue,
                    answer: optText,
                    optionText: optText
                  });
                }
              }
            });
          } else {
            // Single selection
            const selectedOption = question.options.find(opt => {
              const optValue = typeof opt === 'object' ? opt.value || opt.text : opt;
              return optValue === processedResponse;
            });
            
            if (selectedOption) {
              const optText = typeof selectedOption === 'object' ? selectedOption.text : selectedOption;
              const optCode = typeof selectedOption === 'object' ? selectedOption.code : null;
              const isOthersOption = optText && (optText.toLowerCase().trim() === 'others' || optText.toLowerCase().trim() === 'other');
              
              if (isOthersOption) {
                // Get the "Others" text input value
                const othersText = othersTextInputs[`${question.id}_${processedResponse}`] || '';
                if (othersText) {
                  responseCodes = optCode || processedResponse;
                  responseWithCodes = {
                    code: optCode || processedResponse,
                    answer: othersText,
                    optionText: optText
                  };
                } else {
                  responseCodes = optCode || processedResponse;
                  responseWithCodes = {
                    code: optCode || processedResponse,
                    answer: optText,
                    optionText: optText
                  };
                }
              } else {
                responseCodes = optCode || processedResponse;
                responseWithCodes = {
                  code: optCode || processedResponse,
                  answer: optText,
                  optionText: optText
                };
              }
            }
          }
        }
        
        // For "Others" option, update the response to include the specified text
        let finalResponse = processedResponse;
        if (question.type === 'multiple_choice' && responseWithCodes) {
          // Check if any response has "Others" with specified text
          if (Array.isArray(responseWithCodes)) {
            const othersResponse = responseWithCodes.find(r => r.optionText && (r.optionText.toLowerCase().trim() === 'others' || r.optionText.toLowerCase().trim() === 'other') && r.answer !== r.optionText);
            if (othersResponse) {
              // Replace the "Others" value with the specified text in the response array
              finalResponse = processedResponse.map((val) => {
                if (val === othersResponse.code || val === othersOptionValue) {
                  return `Others: ${othersResponse.answer}`;
                }
                return val;
              });
            }
          } else if (responseWithCodes.optionText && (responseWithCodes.optionText.toLowerCase().trim() === 'others' || responseWithCodes.optionText.toLowerCase().trim() === 'other') && responseWithCodes.answer !== responseWithCodes.optionText) {
            // Single selection with "Others" specified text
            finalResponse = `Others: ${responseWithCodes.answer}`;
          }
        }
        
        finalResponses.push({
          sectionIndex: question.sectionIndex,
          questionIndex: question.questionIndex,
          questionId: question.id,
          questionType: question.type,
          questionText: question.text,
          questionDescription: question.description,
          questionOptions: questionOptions,
          response: finalResponse, // Use finalResponse which includes "Others: [specified text]"
          responseCodes: responseCodes, // Include option codes
          responseWithCodes: responseWithCodes, // Include structured response with codes
          responseTime,
          isRequired: question.required || false,
          isSkipped: !hasResponseContent(response)
        });
      });

      // Calculate quality metrics
      const qualityMetrics = {
        averageResponseTime: finalResponses.length > 0 
          ? Math.round(finalResponses.reduce((sum, r) => sum + r.responseTime, 0) / finalResponses.length)
          : 0,
        totalPauses: 0,
        totalPauseTime: 0,
        backNavigationCount: 0,
        dataQualityScore: 100
      };


      const response = await surveyResponseAPI.completeInterview(
        sessionId, 
        finalResponses, 
        qualityMetrics, 
        {
          survey: survey._id,
          interviewer: sessionData?.interviewer || 'current-user',
          status: 'Pending_Approval', // Changed from 'completed' to 'Pending_Approval'
          sessionId: sessionId,
          startTime: sessionData?.startTime || new Date(),
          endTime: new Date(),
          totalTimeSpent: totalTime,
          interviewMode: survey.mode || 'capi',
          deviceInfo: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            browser: 'Chrome',
            screenResolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          audioRecording: audioRecordingData,
          selectedAC: selectedAC, // Include selected AC in response data
          location: gpsLocation, // Include location data
          totalQuestions: allQuestions.length,
          answeredQuestions: finalResponses.filter(r => hasResponseContent(r.response)).length,
          skippedQuestions: finalResponses.filter(r => !hasResponseContent(r.response)).length,
          completionPercentage: Math.round((finalResponses.filter(r => hasResponseContent(r.response)).length / allQuestions.length) * 100)
        }
      );
      
      if (response.success) {
        showSuccess(`Interview completed successfully! Response ID: ${response.data.responseId}. Your response has been submitted for quality approval.`);
        onComplete && onComplete({
          survey: survey._id,
          responses: finalResponses,
          sessionId: sessionId,
          totalTime: totalTime,
          responseId: response.data.responseId,
          status: response.data.status
        });
        onClose();
      } else {
        showError('Failed to complete interview');
      }
    } catch (error) {
      console.error('Error completing interview:', error);
      showError('Failed to complete interview');
    } finally {
      setIsLoading(false);
    }
  };

  // Abandon interview
  const abandonInterview = async () => {
    try {
      if (sessionId) {
        await surveyResponseAPI.abandonInterview(sessionId);
      }
      showSuccess('Interview abandoned');
      onClose();
    } catch (error) {
      console.error('Error abandoning interview:', error);
      showError('Failed to abandon interview');
    }
  };

  // Pause/Resume interview
  const pauseInterview = () => {
    console.log('Pausing interview...'); // Debug log
    setIsPaused(true);
    // Timer will pause automatically via useEffect when isPaused becomes true
    
    // Pause audio recording if active
    if (isRecording && !isAudioPaused) {
      pauseAudioRecording();
    }
  };

  const resumeInterview = () => {
    console.log('Resuming interview...'); // Debug log
    setIsPaused(false);
    // Timer will resume automatically via useEffect when isPaused becomes false
    
    // Resume audio recording if it was paused
    if (isRecording && isAudioPaused) {
      resumeAudioRecording();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      
      // Cleanup audio stream
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
      }
      
      // Cleanup audio URL
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [stopTimer, audioStream, audioUrl]);

  // Cleanup audio recording on unmount only
  useEffect(() => {
    return () => {
      // Only stop recording on component unmount, not on dependency changes
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };
  }, []); // Empty dependency array - only runs on mount/unmount

  // Start question timer when question changes
  useEffect(() => {
    if (currentQuestion) {
      setQuestionStartTime(Date.now());
    }
  }, [currentQuestionIndex]);

  // Debug timer state changes
  useEffect(() => {
  }, [totalTime]);

  // Test timer functionality
  useEffect(() => {
    if (isInterviewActive && !isPaused) {
    }
  }, [isInterviewActive, isPaused]);

  // Alternative timer using useEffect
  useEffect(() => {
    let interval;
    if (isInterviewActive && !isPaused) {
      interval = setInterval(() => {
        setTotalTime(prev => {
          const newTime = prev + 1;
          return newTime;
        });
      }, 1000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isInterviewActive, isPaused]);


  // Fisher-Yates shuffle algorithm for randomizing options
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Get shuffled options for a question (shuffle once, then reuse)
  const getShuffledOptions = (questionId, originalOptions) => {
    if (!originalOptions || originalOptions.length === 0) return originalOptions;
    
    // If already shuffled for this question, return cached shuffled order
    if (shuffledOptions[questionId]) {
      return shuffledOptions[questionId];
    }
    
    // Shuffle options for the first time
    const shuffled = shuffleArray(originalOptions);
    setShuffledOptions(prev => ({
      ...prev,
      [questionId]: shuffled
    }));
    
    return shuffled;
  };

  // Render question input based on type
  const renderQuestionInput = () => {
    if (!currentVisibleQuestion) return null;

    const { type, options, required } = currentVisibleQuestion;
    const currentResponse = responses[currentVisibleQuestion.id] || '';
    const questionId = currentVisibleQuestion.id;
    
    // Get shuffled options for display (for multiple_choice, single_choice, and dropdown)
    const displayOptions = (type === 'multiple_choice' || type === 'single_choice' || type === 'dropdown') 
      ? getShuffledOptions(questionId, options)
      : options;

    switch (type) {
      case 'text':
      case 'textarea':
        return (
          <textarea
            value={currentResponse}
            onChange={(e) => handleResponseChange(currentVisibleQuestion.id, e.target.value)}
            placeholder={`Enter your ${type === 'textarea' ? 'detailed ' : ''}response...`}
            className="w-full p-6 text-lg border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 resize-none transition-all duration-200"
            rows={type === 'textarea' ? 6 : 3}
            required={required}
          />
        );

      case 'numeric':
        return (
          <input
            type="number"
            value={currentResponse !== null && currentResponse !== undefined ? currentResponse : ''}
            onChange={(e) => {
              const value = e.target.value;
              // Allow empty string or valid number (including 0 and negative numbers)
              if (value === '') {
                handleResponseChange(currentVisibleQuestion.id, '');
              } else {
                const numValue = parseFloat(value);
                if (!isNaN(numValue) && isFinite(numValue)) {
                  handleResponseChange(currentVisibleQuestion.id, numValue);
                }
              }
            }}
            placeholder="Enter a number..."
            className="w-full p-6 text-lg border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
            required={required}
            step="any"
          />
        );

      case 'multiple_choice':
        const allowMultiple = currentVisibleQuestion.settings?.allowMultiple || false;
        const maxSelections = currentVisibleQuestion.settings?.maxSelections;
        const isGenderQuestion = currentVisibleQuestion.id === 'fixed_respondent_gender';
        const currentSelections = Array.isArray(currentResponse) ? currentResponse.length : 0;
        
        // Use shuffled options for display
        const shuffledMultipleChoiceOptions = displayOptions || options;
        
        // Check if "None" option exists
        const noneOption = shuffledMultipleChoiceOptions.find(opt => {
          const optText = typeof opt === 'object' ? opt.text : opt;
          return optText && optText.toLowerCase().trim() === 'none';
        });
        const noneOptionValue = noneOption ? (typeof noneOption === 'object' ? noneOption.value || noneOption.text : noneOption) : null;
        
        // Check if "Others" option exists
        const othersOption = shuffledMultipleChoiceOptions.find(opt => {
          const optText = typeof opt === 'object' ? opt.text : opt;
          return optText && (optText.toLowerCase().trim() === 'others' || optText.toLowerCase().trim() === 'other');
        });
        const othersOptionValue = othersOption ? (typeof othersOption === 'object' ? othersOption.value || othersOption.text : othersOption) : null;
        const othersOptionCode = othersOption && typeof othersOption === 'object' ? othersOption.code : null;
        
        // Check if "Others" is selected
        const isOthersSelected = allowMultiple 
          ? (Array.isArray(currentResponse) && currentResponse.includes(othersOptionValue))
          : (currentResponse === othersOptionValue);
        
        // Check if "None" is selected
        const isNoneSelected = allowMultiple
          ? (Array.isArray(currentResponse) && currentResponse.includes(noneOptionValue))
          : (currentResponse === noneOptionValue);
        
        return (
          <div className="space-y-4">
            {allowMultiple && maxSelections && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">Selection limit:</span> {currentSelections} / {maxSelections} selected
                </p>
              </div>
            )}
            {shuffledMultipleChoiceOptions.map((option, index) => {
              const optionValue = typeof option === 'object' ? option.value || option.text : option;
              const optionText = typeof option === 'object' ? option.text : option;
              const optionId = typeof option === 'object' ? option.id : index;
              const optionCode = typeof option === 'object' ? option.code : null;
              const isNoneOption = optionText && optionText.toLowerCase().trim() === 'none';
              const isOthersOption = optionText && (optionText.toLowerCase().trim() === 'others' || optionText.toLowerCase().trim() === 'other');
              
              // Get quota information for gender question
              let quotaInfo = null;
              if (isGenderQuestion && genderQuotas) {
                const genderMapping = {
                  'male': 'Male',
                  'female': 'Female', 
                  'non_binary': 'Non-binary'
                };
                const mappedGender = genderMapping[optionValue];
                if (mappedGender && genderQuotas[mappedGender]) {
                  const quota = genderQuotas[mappedGender];
                  quotaInfo = quota;
                }
              }
              
              return (
                <div key={optionId} className="space-y-2">
                  <label className="flex items-center space-x-4 cursor-pointer group">
                  <input
                    type={allowMultiple ? "checkbox" : "radio"}
                    name={allowMultiple ? undefined : `question-${questionId}`}
                    checked={allowMultiple 
                      ? (Array.isArray(currentResponse) && currentResponse.includes(optionValue))
                      : (currentResponse === optionValue)
                    }
                    onChange={(e) => {
                      if (allowMultiple) {
                        let newResponse = Array.isArray(currentResponse) ? [...currentResponse] : [];
                        const maxSelections = currentVisibleQuestion.settings?.maxSelections;
                        
                        if (e.target.checked) {
                          // Handle "None" option - mutual exclusivity
                          if (isNoneOption) {
                            // If "None" is selected, clear all other selections
                            newResponse = [optionValue];
                            // Clear "Others" text input if it was selected
                            if (othersOptionValue && newResponse.includes(othersOptionValue)) {
                              setOthersTextInputs(prev => {
                                const updated = { ...prev };
                                delete updated[`${questionId}_${othersOptionValue}`];
                                return updated;
                              });
                            }
                          } else if (isOthersOption) {
                            // If "Others" is selected, clear all other selections (mutual exclusivity)
                            newResponse = [optionValue];
                            // Clear "None" if it exists
                            if (noneOptionValue && newResponse.includes(noneOptionValue)) {
                              newResponse = newResponse.filter(v => v !== noneOptionValue);
                            }
                          } else {
                            // If any other option is selected, remove "None" and "Others" if they exist
                            if (noneOptionValue && newResponse.includes(noneOptionValue)) {
                              newResponse = newResponse.filter(v => v !== noneOptionValue);
                            }
                            if (othersOptionValue && newResponse.includes(othersOptionValue)) {
                              newResponse = newResponse.filter(v => v !== othersOptionValue);
                              // Clear "Others" text input
                              setOthersTextInputs(prev => {
                                const updated = { ...prev };
                                delete updated[`${questionId}_${othersOptionValue}`];
                                return updated;
                              });
                            }
                            
                            // Check if we've reached the maximum selections limit
                            if (maxSelections && newResponse.length >= maxSelections) {
                              // Don't allow selecting more if limit is reached
                              return;
                            }
                            newResponse.push(optionValue);
                          }
                        } else {
                          // Remove the option
                          const index = newResponse.indexOf(optionValue);
                          if (index > -1) newResponse.splice(index, 1);
                          
                          // Clear "Others" text input if "Others" is deselected
                          if (isOthersOption) {
                            setOthersTextInputs(prev => {
                              const updated = { ...prev };
                              delete updated[`${questionId}_${optionValue}`];
                              return updated;
                            });
                          }
                        }
                        handleResponseChange(questionId, newResponse);
                      } else {
                        // Single selection
                        if (isNoneOption) {
                          // "None" selected - just set it
                          handleResponseChange(questionId, optionValue);
                          // Clear "Others" text input if it exists
                          if (othersOptionValue && currentResponse === othersOptionValue) {
                            setOthersTextInputs(prev => {
                              const updated = { ...prev };
                              delete updated[`${questionId}_${othersOptionValue}`];
                              return updated;
                            });
                          }
                        } else if (isOthersOption) {
                          // "Others" selected - just set it
                          handleResponseChange(questionId, optionValue);
                        } else {
                          // Other option selected - clear "None" and "Others" if they were selected
                          if (noneOptionValue && currentResponse === noneOptionValue) {
                            handleResponseChange(questionId, optionValue);
                          } else if (othersOptionValue && currentResponse === othersOptionValue) {
                            handleResponseChange(questionId, optionValue);
                            // Clear "Others" text input
                            setOthersTextInputs(prev => {
                              const updated = { ...prev };
                              delete updated[`${questionId}_${othersOptionValue}`];
                              return updated;
                            });
                          } else {
                            handleResponseChange(questionId, optionValue);
                          }
                        }
                      }
                    }}
                      className={`w-6 h-6 border-2 border-gray-300 rounded focus:ring-blue-500 group-hover:border-blue-400 transition-colors ${
                        quotaInfo?.isFull 
                          ? 'text-gray-400 cursor-not-allowed opacity-50' 
                          : 'text-blue-600'
                      }`}
                      disabled={quotaInfo?.isFull}
                    />
                    <div className="flex-1">
                      <span className={`text-lg transition-colors ${
                        quotaInfo?.isFull 
                          ? 'text-gray-400 line-through' 
                          : 'text-gray-700 group-hover:text-gray-900'
                      }`}>
                        {optionText}
                      </span>
                      {quotaInfo && (
                        <div className="text-sm text-gray-500 mt-1">
                          {quotaInfo.isFull ? (
                            <span className="text-red-500 font-medium">Quota Full ({quotaInfo.currentCount}/{quotaInfo.quota})</span>
                          ) : (
                            <span className="text-green-600">Available ({quotaInfo.remaining} remaining)</span>
                          )}
                        </div>
                      )}
                    </div>
                </label>
                {/* Show text input for "Others" option when selected */}
                {isOthersOption && isOthersSelected && (
                  <div className="ml-10 mt-2">
                    <input
                      type="text"
                      value={othersTextInputs[`${questionId}_${optionValue}`] || ''}
                      onChange={(e) => {
                        setOthersTextInputs(prev => ({
                          ...prev,
                          [`${questionId}_${optionValue}`]: e.target.value
                        }));
                      }}
                      placeholder="Please specify..."
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
                </div>
              );
            })}
          </div>
        );

      case 'single_choice':
        // Use shuffled options for display
        const shuffledSingleChoiceOptions = displayOptions || options;
        
        return (
          <div className="space-y-4">
            {shuffledSingleChoiceOptions.map((option, index) => {
              const optionValue = typeof option === 'object' ? option.value || option.text : option;
              const optionText = typeof option === 'object' ? option.text : option;
              const optionId = typeof option === 'object' ? option.id : index;
              
              return (
                <label key={optionId} className="flex items-center space-x-4 cursor-pointer group">
                  <input
                    type="radio"
                    name={`question-${currentVisibleQuestion.id}`}
                    value={optionValue}
                    checked={currentResponse === optionValue}
                    onChange={(e) => handleResponseChange(currentVisibleQuestion.id, e.target.value)}
                    className="w-6 h-6 text-blue-600 border-2 border-gray-300 focus:ring-blue-500 group-hover:border-blue-400 transition-colors"
                  />
                  <span className="text-lg text-gray-700 group-hover:text-gray-900 transition-colors">{optionText}</span>
                </label>
              );
            })}
          </div>
        );

      case 'rating':
      case 'rating_scale':
        const scale = currentVisibleQuestion.scale || { min: 1, max: 5 };
        const min = scale.min || 1;
        const max = scale.max || 5;
        const labels = scale.labels || [];
        const minLabel = scale.minLabel || '';
        const maxLabel = scale.maxLabel || '';
        const ratings = [];
        for (let i = min; i <= max; i++) {
          ratings.push(i);
        }
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {ratings.map((rating) => {
                const label = labels[rating - min] || '';
                return (
                  <button
                    key={rating}
                    onClick={() => handleResponseChange(currentVisibleQuestion.id, rating)}
                    className={`w-14 h-14 rounded-full border-2 transition-all duration-200 flex flex-col items-center justify-center ${
                      currentResponse === rating
                        ? 'bg-yellow-400 border-yellow-500 text-yellow-900 shadow-lg scale-110'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-yellow-400 hover:bg-yellow-50'
                    }`}
                    title={label}
                  >
                    <span className="text-lg font-bold">{rating}</span>
                    {label && (
                      <span className="text-xs mt-0.5">{label}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {(minLabel || maxLabel) && (
              <div className="flex justify-between text-sm text-gray-500 px-2">
                <span>{minLabel}</span>
                <span>{maxLabel}</span>
              </div>
            )}
          </div>
        );

      case 'yes_no':
        return (
          <div className="space-y-4">
            <label className="flex items-center space-x-4 cursor-pointer group">
              <input
                type="radio"
                name={`question-${currentVisibleQuestion.id}`}
                value="yes"
                checked={currentResponse === 'yes'}
                onChange={(e) => handleResponseChange(currentVisibleQuestion.id, e.target.value)}
                className="w-6 h-6 text-green-600 border-2 border-gray-300 focus:ring-green-500 group-hover:border-green-400 transition-colors"
              />
              <span className="text-lg text-gray-700 group-hover:text-gray-900 transition-colors">Yes</span>
            </label>
            <label className="flex items-center space-x-4 cursor-pointer group">
              <input
                type="radio"
                name={`question-${currentVisibleQuestion.id}`}
                value="no"
                checked={currentResponse === 'no'}
                onChange={(e) => handleResponseChange(currentVisibleQuestion.id, e.target.value)}
                className="w-6 h-6 text-red-600 border-2 border-gray-300 focus:ring-red-500 group-hover:border-red-400 transition-colors"
              />
              <span className="text-lg text-gray-700 group-hover:text-gray-900 transition-colors">No</span>
            </label>
          </div>
        );

      case 'dropdown':
        // Use shuffled options for display
        const shuffledDropdownOptions = displayOptions || options;
        
        return (
          <select
            value={currentResponse}
            onChange={(e) => handleResponseChange(currentVisibleQuestion.id, e.target.value)}
            className="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
            required={required}
          >
            <option value="">Select an option...</option>
            {shuffledDropdownOptions.map((option, index) => {
              const optionValue = typeof option === 'object' ? option.value || option.text : option;
              const optionText = typeof option === 'object' ? option.text : option;
              return (
                <option key={index} value={optionValue}>
                  {optionText}
                </option>
              );
            })}
          </select>
        );

      case 'date':
        return (
          <input
            type="date"
            value={currentResponse}
            onChange={(e) => handleResponseChange(currentVisibleQuestion.id, e.target.value)}
            className="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
            required={required}
          />
        );

      default:
        return (
          <div className="p-8 text-center text-gray-500">
            <p>Unsupported question type: {type}</p>
          </div>
        );
    }
  };

  // Welcome Modal
  if (showWelcomeModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 transform transition-all duration-500 ease-out animate-in fade-in-0 zoom-in-95">
          <div className="text-center">
            {/* Animated Icon */}
            <div className="mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto flex items-center justify-center animate-pulse">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Interview Ready
            </h2>

            {/* Survey Info */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-gray-800 mb-2">{survey.surveyName}</h3>
              <p className="text-sm text-gray-600">
                {allQuestions.length} questions • {survey.mode || 'CAPI'} Mode
              </p>
            </div>

            {/* Instructions */}
            <div className="text-left mb-6 space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 text-sm font-semibold">1</span>
                </div>
                <p className="text-sm text-gray-700">
                  <strong>Location & Audio Access Required:</strong> This interview requires location and microphone permissions to ensure data integrity
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 text-sm font-semibold">2</span>
                </div>
                <p className="text-sm text-gray-700">
                  Answer each question honestly and completely
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 text-sm font-semibold">3</span>
                </div>
                <p className="text-sm text-gray-700">
                  You can navigate between questions using the sidebar
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 text-sm font-semibold">4</span>
                </div>
                <p className="text-sm text-gray-700">
                  Take your time - there's no rush
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 text-sm font-semibold">5</span>
                </div>
                <p className="text-sm text-gray-700">
                  Your responses are automatically saved
                </p>
              </div>
            </div>

            {/* Audio Recording Information */}
            {survey.mode === 'capi' && (
              <div className={`p-4 rounded-lg mb-6 ${
                audioSupported 
                  ? 'bg-blue-50 border border-blue-200' 
                  : 'bg-yellow-50 border border-yellow-200'
              }`}>
                <div className="flex items-start space-x-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    audioSupported ? 'bg-blue-100' : 'bg-yellow-100'
                  }`}>
                    <span className={`text-sm font-semibold ${
                      audioSupported ? 'text-blue-600' : 'text-yellow-600'
                    }`}>
                      🎙️
                    </span>
                  </div>
                  <div>
                    <h4 className={`font-semibold ${
                      audioSupported ? 'text-blue-800' : 'text-yellow-800'
                    }`}>
                      Audio Recording
                    </h4>
                    <p className={`text-sm ${
                      audioSupported ? 'text-blue-700' : 'text-yellow-700'
                    }`}>
                      {audioSupported 
                        ? 'This interview will be automatically recorded for quality assurance. You will be asked for microphone permission when you start.'
                        : window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '74.225.250.243'
                        ? 'Audio recording requires HTTPS. Please access the site via HTTPS (https://your-domain.com) or use localhost for development.'
                        : 'Audio recording is not available in your current browser/environment. The interview will continue without audio recording.'
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={startActualInterview}
                disabled={isLoading || isStarting}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading || isStarting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Starting...</span>
                  </div>
                ) : (
                  'Start Interview'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || isStarting) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isStarting ? 'Starting Interview...' : 'Loading...'}
            </h3>
            <p className="text-gray-600">
              {isStarting ? 'Please wait while we prepare your interview session.' : 'Please wait...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInterviewActive || !currentVisibleQuestion) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Interview Not Ready</h3>
            <p className="text-gray-600 mb-4">The interview session could not be started.</p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col interview-interface" style={{ 
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      minHeight: '100dvh' // Dynamic viewport height for better mobile support
    }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{survey.surveyName}</h1>
            <p className="text-sm text-gray-600">Interview in Progress</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>{formatTime(totalTime)}</span>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Audio Recording Indicator */}
            {survey.mode === 'capi' && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${
                  !audioSupported ? 'bg-red-500' :
                  isRecording ? (isAudioPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse') : 
                  'bg-gray-400'
                }`}></div>
                <span className="text-xs text-gray-600">
                  {!audioSupported ? 'Audio Unavailable' :
                   isRecording ? (isAudioPaused ? 'Audio Paused' : 'Recording') : 
                   'Audio Ready'}
                </span>
              </div>
            )}
            
            {isPaused ? (
              <button
                onClick={resumeInterview}
                className="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm flex items-center space-x-1"
              >
                <Play className="w-4 h-4" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={pauseInterview}
                className="px-3 py-1 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm flex items-center space-x-1"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
            )}
            <button
              onClick={() => setShowAbandonConfirm(true)}
              className="px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm flex items-center space-x-1"
            >
              <Square className="w-4 h-4" />
              <span>Stop</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <div className="w-80 border-r border-gray-200 bg-gray-50 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-gray-800">Questions</h3>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-2">
                {visibleQuestions.map((question, index) => {
                  const isCurrent = question.id === currentVisibleQuestion?.id;
                  const hasResponse = hasResponseContent(responses[question.id]);
                  const hasTargetAudienceError = targetAudienceErrors.has(question.id);
                  
                  return (
                    <button
                      key={question.id}
                      onClick={() => navigateToQuestion(question.id)}
                      className={`w-full text-left p-4 rounded-lg transition-all duration-200 ${
                        isCurrent
                          ? 'bg-blue-500 text-white shadow-lg'
                          : hasTargetAudienceError
                          ? 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-200'
                          : hasResponse
                          ? 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-200'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium">
                          {question.sectionIndex + 1}.{question.questionIndex + 1}
                        </span>
                        {hasResponse && !hasTargetAudienceError && <CheckCircle className="w-4 h-4" />}
                        {hasTargetAudienceError && <span className="text-red-600 text-lg">⚠️</span>}
                      </div>
                      <p className="text-sm mt-2 line-clamp-2">{question.text}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Question Content */}
          <div className="flex-1 overflow-y-auto p-12">
            <div className="max-w-4xl mx-auto">
              {/* Navigation at top of question area */}
              <div className="mb-8 bg-gray-50 rounded-xl p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={goToPreviousQuestion}
                      disabled={currentVisibleIndex === 0}
                      className="group relative px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-xl hover:border-blue-500 hover:text-blue-600 transition-all duration-200 disabled:bg-gray-100 disabled:border-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center space-x-2 shadow-sm hover:shadow-md disabled:shadow-none"
                      style={{ minHeight: '48px', minWidth: '140px' }}
                    >
                      <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
                      <span className="font-medium">Previous</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600 font-medium">
                      Question {currentVisibleIndex + 1} of {visibleQuestions.length}
                    </span>
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${((currentVisibleIndex + 1) / visibleQuestions.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {currentVisibleIndex === visibleQuestions.length - 1 ? (
                      <button
                        onClick={completeInterview}
                        className="px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all duration-200 flex items-center space-x-2 shadow-lg"
                        style={{ minHeight: '44px', minWidth: '180px' }}
                      >
                        <CheckCircle className="w-5 h-5" />
                        <span>Complete Interview</span>
                      </button>
                    ) : (
                      <button
                        onClick={goToNextQuestion}
                        className="group relative px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl"
                        style={{ minHeight: '48px', minWidth: '140px' }}
                      >
                        <span className="font-medium">Next</span>
                        <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-12">
                <h2 className={`text-3xl font-semibold mb-6 leading-relaxed ${
                  validationErrors.has(currentVisibleQuestion.id) || targetAudienceErrors.has(currentVisibleQuestion.id)
                    ? 'text-red-600 border-l-4 border-red-500 pl-4' 
                    : 'text-gray-800'
                }`}>
                  {currentVisibleQuestion.text}
                  {currentVisibleQuestion.required && <span className="text-red-500 ml-2">*</span>}
                </h2>
                {currentVisibleQuestion.description && (
                  <p className="text-xl text-gray-600 leading-relaxed">{currentVisibleQuestion.description}</p>
                )}
                {validationErrors.has(currentVisibleQuestion.id) && (
                  <p className="text-red-600 text-sm mt-2 font-medium">
                    ⚠️ This question is required and must be answered before completing the interview.
                  </p>
                )}
                {targetAudienceErrors.has(currentVisibleQuestion.id) && (
                  <p className="text-red-600 text-sm mt-2 font-medium bg-red-50 p-3 rounded-lg border border-red-200">
                    🚫 {targetAudienceErrors.get(currentVisibleQuestion.id)}
                  </p>
                )}
              </div>

              <div className="mb-12">
                {isPaused ? (
                  <div className="p-8 text-center bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                    <div className="flex items-center justify-center space-x-3 mb-4">
                      <Pause className="w-8 h-8 text-yellow-600" />
                      <h3 className="text-xl font-semibold text-yellow-800">Interview Paused</h3>
              </div>
                    <p className="text-yellow-700 mb-4">
                      The interview is currently paused. Audio recording is also paused.
                    </p>
                    <p className="text-sm text-yellow-600">
                      Click "Resume" to continue the interview and audio recording.
                    </p>
                  </div>
                ) : (
                  renderQuestionInput()
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Abandon Confirmation Modal */}
      {showAbandonConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Abandon Interview?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to abandon this interview? All progress will be lost and cannot be recovered.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowAbandonConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={abandonInterview}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Abandon
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Permission Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 transform transition-all duration-300 ease-out">
            <div className="text-center">
              {/* Icon */}
              <div className="mb-6">
                <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${
                  permissionType === 'location' ? 'bg-blue-100' : 'bg-green-100'
                }`}>
                  {permissionType === 'location' ? (
                    <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  ) : (
                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {permissionType === 'location' ? 'Location Access Required' : 'Microphone Access Required'}
              </h2>

              {/* Description */}
              <div className="text-left mb-6 space-y-3">
                <p className="text-gray-700">
                  {permissionType === 'location' 
                    ? 'This interview requires access to your location to ensure data integrity and verify the interview location.'
                    : 'This interview requires access to your microphone to record the conversation for quality assurance.'
                  }
                </p>
                
                {permissionError && (
                  <div 
                    className="text-left"
                    dangerouslySetInnerHTML={{ __html: permissionError }}
                  />
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">How to enable access:</h4>
                  <ol className="text-sm text-blue-800 space-y-1 text-left">
                    <li>1. Look for the permission prompt in your browser's address bar</li>
                    <li>2. Click "Allow" when prompted</li>
                    <li>3. If you missed it, click the {permissionType === 'location' ? 'location' : 'microphone'} icon in the address bar</li>
                    <li>4. Select "Allow" from the dropdown menu</li>
                  </ol>
                </div>
                
                {permissionType === 'location' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-900 mb-2">⚠️ Important Note:</h4>
                    <p className="text-sm text-yellow-800">
                      Location tracking is required for data integrity and quality assurance. 
                      Without location data, your interview may be flagged for review or rejected.
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowPermissionModal(false);
                      setShowWelcomeModal(true);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowPermissionModal(false);
                      // Retry the permission request
                      startActualInterview();
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
                
                {/* Continue without location option */}
                {permissionType === 'location' && (
                  <button
                    onClick={() => {
                      setShowPermissionModal(false);
                      // Continue without location
                      setGpsLocation(null);
                      setLocationPermission('skipped');
                      // Continue with audio check
                      checkAudioPermission();
                    }}
                    className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm"
                  >
                    Continue Without Location (Not Recommended)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewInterface;