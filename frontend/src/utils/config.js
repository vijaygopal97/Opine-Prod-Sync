/**
 * Configuration utilities for Convergent application
 * Centralizes environment variable access and URL construction
 */

// Get API base URL from environment variables
export const getApiBaseUrl = () => {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
};

// Get the base URL for file uploads and document previews
export const getFileBaseUrl = () => {
  return getApiBaseUrl();
};

// Construct full URL for uploaded files
export const getFileUrl = (filePath) => {
  if (!filePath) return null;
  
  // If the filePath already contains a full URL, return it as is
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  
  // Construct the full URL using the base URL
  const baseUrl = getFileBaseUrl();
  return `${baseUrl}/uploads/${filePath}`;
};

// Construct full URL for API endpoints
export const getApiUrl = (endpoint) => {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
};

// Check if we're in development mode
export const isDevelopment = () => {
  return import.meta.env.DEV;
};

// Check if we're in production mode
export const isProduction = () => {
  return import.meta.env.PROD;
};

// Get the current environment
export const getEnvironment = () => {
  return import.meta.env.MODE;
};

