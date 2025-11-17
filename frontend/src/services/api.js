import axios from 'axios';

// Get API base URL from environment variables
// Use relative path in production to go through nginx proxy
// In production (HTTPS), use empty string so relative paths work through nginx
// In development, use localhost:5000 directly
const isProduction = window.location.protocol === 'https:' || window.location.hostname !== 'localhost';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (isProduction ? '' : 'http://localhost:5000');

// Create axios instance with default configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout to 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add JWT token to headers if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Test backend connection
export const testBackendConnection = async () => {
  try {
    const response = await api.get('/');
    console.log('✅ Database connected successfully');
    return { success: true, data: response.data };
  } catch (error) {
    console.log('❌ Database connection failed');
    return { success: false, error: error.message };
  }
};

// Authentication API functions
export const authAPI = {
  // Register new user
  register: async (userData) => {
    try {
      const response = await api.post('/api/auth/register', userData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Login user
  login: async (credentials) => {
    try {
      const response = await api.post('/api/auth/login', credentials);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get current user profile
  getMe: async () => {
    try {
      const response = await api.get('/api/auth/me');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update user profile
  updateProfile: async (profileData) => {
    try {
      const response = await api.put('/api/auth/profile', profileData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Change password
  changePassword: async (passwordData) => {
    try {
      const response = await api.put('/api/auth/change-password', passwordData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Verify email
  verifyEmail: async (token) => {
    try {
      const response = await api.get(`/api/auth/verify-email/${token}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Resend email verification
  resendVerification: async () => {
    try {
      const response = await api.post('/api/auth/resend-verification');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Forgot password - send OTP
  forgotPassword: async (email) => {
    try {
      const response = await api.post('/api/auth/forgot-password', { email });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Verify OTP for password reset
  verifyOTP: async (email, otp, emailHash) => {
    try {
      const response = await api.post('/api/auth/verify-otp', { 
        email, 
        otp, 
        emailHash 
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Reset password with new password
  resetPassword: async (resetToken, email, newPassword, confirmPassword) => {
    try {
      const response = await api.post('/api/auth/reset-password', { 
        resetToken,
        email, 
        newPassword,
        confirmPassword
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

        // Get available companies
        getCompanies: async () => {
          try {
            const response = await api.get('/api/auth/companies');
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Get all users with pagination and filtering
        getAllUsers: async (params = {}) => {
          try {
            const response = await api.get('/api/auth/users', { params });
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Get user by ID
        getUserById: async (id) => {
          try {
            const response = await api.get(`/api/auth/users/${id}`);
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Update user
        updateUser: async (id, userData) => {
          try {
            const response = await api.put(`/api/auth/users/${id}`, userData);
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Delete user
        deleteUser: async (id) => {
          try {
            const response = await api.delete(`/api/auth/users/${id}`);
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Get user statistics
        getUserStats: async () => {
          try {
            const response = await api.get('/api/auth/users/stats');
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Company-specific user management
        getCompanyUsers: async (params = {}) => {
          try {
            const response = await api.get('/api/auth/company/users', { params });
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Register company user (no company code needed)
        registerCompanyUser: async (userData) => {
          try {
            const response = await api.post('/api/auth/company/register-user', userData);
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Update company user
        updateCompanyUser: async (id, userData) => {
          try {
            const response = await api.put(`/api/auth/company/users/${id}`, userData);
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Delete company user
        deleteCompanyUser: async (id) => {
          try {
            const response = await api.delete(`/api/auth/company/users/${id}`);
            return response.data;
          } catch (error) {
            throw error;
          }
        },

  // Interviewer Profile API functions
  getInterviewerProfile: async () => {
    try {
      const response = await api.get('/api/interviewer-profile/profile');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getInterviewerProfileById: async (userId) => {
    try {
      const response = await api.get(`/api/interviewer-profile/profile/${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Super admin APIs for independent interviewers
  getIndependentInterviewerProfiles: async () => {
    try {
      const response = await api.get('/api/interviewer-profile/independent/pending-profiles');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  reviewIndependentInterviewerProfile: async (userId, data) => {
    try {
      const response = await api.post(`/api/interviewer-profile/independent/review-profile/${userId}`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

        updateInterviewerProfile: async (profileData) => {
          try {
            const response = await api.put('/api/interviewer-profile/profile', profileData);
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        submitProfileForApproval: async () => {
          try {
            const response = await api.post('/api/interviewer-profile/profile/submit');
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        uploadDocuments: async (formData) => {
          try {
            const response = await api.post('/api/interviewer-profile/upload-documents', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        // Document Verification API functions (for Company Admin)
        getPendingProfiles: async () => {
          try {
            const response = await api.get('/api/interviewer-profile/pending-profiles');
            return response.data;
          } catch (error) {
            throw error;
          }
        },

        reviewProfile: async (reviewData) => {
          try {
            const response = await api.post('/api/interviewer-profile/review-profile', reviewData);
            return response.data;
          } catch (error) {
            throw error;
          }
        }
    };

// Survey API functions
export const surveyAPI = {
  // Create a new survey
  createSurvey: async (surveyData) => {
    try {
      // Creating survey via API
      const response = await api.post('/api/surveys', surveyData);
      // Survey API response received
      return response.data;
    } catch (error) {
      console.error('Survey API error:', error);
      console.error('Error response:', error.response?.data);
      throw error;
    }
  },

  // Get all surveys for the company
  getSurveys: async (params = {}) => {
    try {
      const response = await api.get('/api/surveys', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get a single survey
  getSurvey: async (id) => {
    try {
      const response = await api.get(`/api/surveys/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update an existing survey
  updateSurvey: async (id, surveyData) => {
    try {
      // Updating survey via API
      const response = await api.put(`/api/surveys/${id}`, surveyData);
      // Survey update API response received
      return response.data;
    } catch (error) {
      console.error('Survey update API error:', error);
      console.error('Error response:', error.response?.data);
      throw error;
    }
  },


  // Delete a survey
  deleteSurvey: async (id) => {
    try {
      const response = await api.delete(`/api/surveys/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Publish a survey
  publishSurvey: async (id) => {
    try {
      const response = await api.post(`/api/surveys/${id}/publish`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Assign interviewers to survey
  assignInterviewers: async (id, interviewerData) => {
    try {
      const response = await api.post(`/api/surveys/${id}/assign-interviewers`, interviewerData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Assign quality agents to a survey
  assignQualityAgents: async (id, qualityAgentData) => {
    try {
      const response = await api.post(`/api/surveys/${id}/assign-quality-agents`, qualityAgentData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get survey statistics
  getSurveyStats: async () => {
    try {
      const response = await api.get('/api/surveys/stats');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get available surveys for interviewer
  getAvailableSurveys: async (params = {}) => {
    try {
      const response = await api.get('/api/surveys/available', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Reject an interview assignment
  rejectInterview: async (surveyId) => {
    try {
      const response = await api.post(`/api/surveys/${surveyId}/reject-interview`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Contact API functions
export const contactAPI = {
  // Get all contacts
  getAllContacts: async (params = {}) => {
    try {
      const response = await api.get('/api/contacts', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get contact by ID
  getContact: async (id) => {
    try {
      const response = await api.get(`/api/contacts/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create new contact
  createContact: async (contactData) => {
    try {
      const response = await api.post('/api/contacts', contactData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update contact
  updateContact: async (id, contactData) => {
    try {
      const response = await api.put(`/api/contacts/${id}`, contactData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete contact
  deleteContact: async (id) => {
    try {
      const response = await api.delete(`/api/contacts/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get contact statistics
  getContactStats: async () => {
    try {
      const response = await api.get('/api/contacts/stats');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Respond to contact
  respondToContact: async (id, responseData) => {
    try {
      const response = await api.patch(`/api/contacts/${id}/respond`, responseData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Company Management API functions
export const companyAPI = {
  // Get all companies with pagination and filtering
  getAllCompanies: async (params = {}) => {
    try {
      const response = await api.get('/api/auth/manage-companies', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get company by ID
  getCompanyById: async (id) => {
    try {
      const response = await api.get(`/api/auth/manage-companies/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update company
  updateCompany: async (id, companyData) => {
    try {
      const response = await api.put(`/api/auth/manage-companies/${id}`, companyData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete company
  deleteCompany: async (id) => {
    try {
      const response = await api.delete(`/api/auth/manage-companies/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Add company admin
  addCompanyAdmin: async (companyId, adminData) => {
    try {
      const response = await api.post(`/api/auth/manage-companies/${companyId}/admins`, adminData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Remove company admin
  removeCompanyAdmin: async (companyId, adminId) => {
    try {
      const response = await api.delete(`/api/auth/manage-companies/${companyId}/admins/${adminId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get company statistics
  getCompanyStats: async () => {
    try {
      const response = await api.get('/api/auth/manage-companies/stats');
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Survey Response API
export const surveyResponseAPI = {
  // Start a new interview session
  startInterview: async (surveyId) => {
    try {
      const response = await api.post(`/api/survey-responses/start/${surveyId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get interview session
  getInterviewSession: async (sessionId) => {
    try {
      const response = await api.get(`/api/survey-responses/session/${sessionId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update response (temporary storage)
  updateResponse: async (sessionId, questionId, response) => {
    try {
      const apiResponse = await api.post(`/api/survey-responses/session/${sessionId}/response`, {
        questionId,
        response
      });
      return apiResponse.data;
    } catch (error) {
      throw error;
    }
  },

  // Navigate to a specific question
  navigateToQuestion: async (sessionId, navigationData) => {
    try {
      const response = await api.post(`/api/survey-responses/session/${sessionId}/navigate`, navigationData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Mark question as reached
  markQuestionReached: async (sessionId, questionData) => {
    try {
      const response = await api.post(`/api/survey-responses/session/${sessionId}/reach`, questionData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Pause interview
  pauseInterview: async (sessionId) => {
    try {
      const response = await api.post(`/api/survey-responses/session/${sessionId}/pause`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Resume interview
  resumeInterview: async (sessionId) => {
    try {
      const response = await api.post(`/api/survey-responses/session/${sessionId}/resume`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Complete interview and save final response
  completeInterview: async (sessionId, responses, qualityMetrics, metadata) => {
    try {
      const response = await api.post(`/api/survey-responses/session/${sessionId}/complete`, {
        responses,
        qualityMetrics,
        metadata
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Abandon interview
  abandonInterview: async (sessionId) => {
    try {
      const response = await api.post(`/api/survey-responses/session/${sessionId}/abandon`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get gender response counts for quota management
  getGenderResponseCounts: async (surveyId) => {
    try {
      const response = await api.get(`/api/survey-responses/survey/${surveyId}/gender-counts`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get all interviews conducted by the logged-in interviewer
  getMyInterviews: async (params = {}) => {
    try {
      const response = await api.get('/api/survey-responses/my-interviews', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get pending approval responses for company admin
  getPendingApprovals: async (params = {}) => {
    try {
      const response = await api.get('/api/survey-responses/pending-approvals', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get next available response from queue for review (Queue-based assignment)
  getNextReviewAssignment: async (params = {}) => {
    try {
      const response = await api.get('/api/survey-responses/next-review', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Release review assignment (when user abandons review)
  releaseReviewAssignment: async (responseId) => {
    try {
      const response = await api.post(`/api/survey-responses/release-review/${responseId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

    // Submit survey response verification
    submitVerification: async (verificationData) => {
      try {
        const response = await api.post('/api/survey-responses/verify', verificationData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    // Get all survey responses for stats (internal use)
    getDebugResponses: async () => {
      try {
        const response = await api.get('/api/survey-responses/debug-responses');
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    // Get survey responses for View Responses modal
    getSurveyResponses: async (surveyId, params = {}) => {
      try {
        const response = await api.get(`/api/survey-responses/survey/${surveyId}/responses`, { params });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    // Approve survey response
    approveResponse: async (responseId) => {
      try {
        const response = await api.patch(`/api/survey-responses/${responseId}/approve`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    // Reject survey response
    rejectResponse: async (responseId, data) => {
      try {
        const response = await api.patch(`/api/survey-responses/${responseId}/reject`, data);
        return response.data;
      } catch (error) {
        throw error;
      }
    }
};

// Performance API
export const performanceAPI = {
  // Get comprehensive performance analytics
  getPerformanceAnalytics: async (params = {}) => {
    try {
      const response = await api.get('/api/performance/analytics', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get performance trends over time
  getPerformanceTrends: async (params = {}) => {
    try {
      const response = await api.get('/api/performance/trends', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get detailed interview history
  getInterviewHistory: async (params = {}) => {
    try {
      const response = await api.get('/api/performance/interviews', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Quality Agent Performance APIs
  // Get quality agent performance analytics
  getQualityAgentAnalytics: async (params = {}) => {
    try {
      const response = await api.get('/api/performance/quality-agent/analytics', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get quality agent performance trends
  getQualityAgentTrends: async (params = {}) => {
    try {
      const response = await api.get('/api/performance/quality-agent/trends', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get quality agent reviewed responses
  getQualityAgentReviews: async (params = {}) => {
    try {
      const response = await api.get('/api/performance/quality-agent/reviews', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get QC performance for a specific survey (Company Admin)
  getQCPerformanceBySurvey: async (surveyId, params = {}) => {
    try {
      const response = await api.get(`/api/performance/qc-performance/survey/${surveyId}`, { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  getQCPerformanceTrends: async (surveyId, params = {}) => {
    try {
      const response = await api.get(`/api/performance/qc-performance/survey/${surveyId}/trends`, { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Report Generation API
export const reportAPI = {
  // Generate report from Excel file
  generateReport: async (excelFile, referenceDate) => {
    try {
      const formData = new FormData();
      formData.append('excelFile', excelFile);
      if (referenceDate) {
        formData.append('referenceDate', referenceDate);
      }
      
      const response = await api.post('/api/reports/generate', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 7200000, // 2 hours timeout for very large file uploads and report generation (up to 800MB)
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Generate audit trail
  generateAuditTrail: async (excelPath, referenceDate) => {
    try {
      const response = await api.post('/api/reports/audit', {
        excelPath,
        referenceDate
      }, {
        timeout: 7200000, // 2 hours timeout for large file processing
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Download generated file
  downloadFile: async (filename) => {
    try {
      const response = await api.get(`/api/reports/download/${filename}`, {
        responseType: 'blob',
        timeout: 60000,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Download Excel template
  downloadTemplate: async () => {
    try {
      const response = await api.get('/api/reports/template', {
        responseType: 'blob',
        timeout: 60000,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default api;
