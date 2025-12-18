const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================
// GLOBAL ERROR HANDLERS - PREVENT CRASHES
// ============================================
// Handle unhandled promise rejections (prevent crashes)
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED PROMISE REJECTION - Preventing crash:', reason);
  console.error('❌ Promise:', promise);
  console.error('❌ Stack:', reason?.stack || 'No stack trace');
  // Log to error file but don't crash
  // The error is already logged, we just prevent the crash
});

// Handle uncaught exceptions (prevent crashes)
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION - Preventing crash:', error);
  console.error('❌ Error name:', error.name);
  console.error('❌ Error message:', error.message);
  console.error('❌ Stack:', error.stack);
  // Log to error file but don't crash
  // The error is already logged, we just prevent the crash
});

// Handle warnings (log but don't crash)
process.on('warning', (warning) => {
  console.warn('⚠️ PROCESS WARNING:', warning.name);
  console.warn('⚠️ Message:', warning.message);
  console.warn('⚠️ Stack:', warning.stack);
});

// Import routes
const contactRoutes = require('./routes/contactRoutes');
const authRoutes = require('./routes/authRoutes');
const surveyRoutes = require('./routes/surveyRoutes');
const surveyResponseRoutes = require('./routes/surveyResponseRoutes');
const interviewerProfileRoutes = require('./routes/interviewerProfileRoutes');
const performanceRoutes = require('./routes/performanceRoutes');
const reportRoutes = require('./routes/reportRoutes');
const catiRoutes = require('./routes/catiRoutes');
const catiInterviewRoutes = require('./routes/catiInterviewRoutes');
const qcBatchRoutes = require('./routes/qcBatchRoutes');
const qcBatchConfigRoutes = require('./routes/qcBatchConfigRoutes');
const pollingStationRoutes = require('./routes/pollingStationRoutes');
const masterDataRoutes = require('./routes/masterDataRoutes');
const cron = require('node-cron');
const { processQCBatches } = require('./jobs/qcBatchProcessor');

const app = express();
const PORT = process.env.PORT || 5000;
const SERVER_IP = process.env.SERVER_IP || 'localhost';
const MONGODB_URI = process.env.MONGODB_URI;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3001';

// Middleware - Support multiple origins
const allowedOrigins = CORS_ORIGIN.includes(',') 
  ? CORS_ORIGIN.split(',').map(origin => origin.trim())
  : [CORS_ORIGIN, 'https://convo.convergentview.com', 'https://opine.exypnossolutions.com'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.some(allowed => origin === allowed)) {
      callback(null, true);
    } else {
      // Check if origin matches any allowed origin pattern
      const isAllowed = allowedOrigins.some(allowed => {
        if (allowed.includes('*')) {
          const pattern = allowed.replace('*', '.*');
          return new RegExp(pattern).test(origin);
        }
        return origin === allowed;
      });
      callback(isAllowed ? null : new Error('Not allowed by CORS'), isAllowed);
    }
  },
  credentials: true
}));

// Increase body size limit for large Excel file uploads (800MB)
// Use verify function to capture raw body for webhook endpoint
app.use(express.json({ 
  limit: '800mb',
  verify: (req, res, buf, encoding) => {
    if (req.path === '/api/cati/webhook' && req.method === 'POST') {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '800mb',
  verify: (req, res, buf, encoding) => {
    if (req.path === '/api/cati/webhook' && req.method === 'POST') {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
}));
app.use(cookieParser());

// Serve static files (audio recordings)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve party logos
const partyLogosPath = path.resolve(__dirname, '../../Report-Generation/party symbols');
console.log('📁 Party logos path:', partyLogosPath);
app.use('/api/party-logos', express.static(partyLogosPath, {
  setHeaders: (res, filePath) => {
    // Set proper content type based on file extension
    if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    } else if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }
  }
}));

// MongoDB Connection
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in environment variables');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
.then(() => {
  console.log('✅ Connected to MongoDB successfully!');
  console.log(`📊 Database: ${MONGODB_URI.split('@')[1]?.split('/')[0] || 'Connected'}`);
  
  // Schedule QC batch processing to run daily at 12:00 AM (midnight) IST
  // This will process batches from previous days and check in-progress batches
  cron.schedule('0 0 * * *', async () => {
    console.log('⏰ QC Batch Processing Job triggered by cron (12:00 AM IST)');
    try {
      await processQCBatches();
      console.log('✅ QC Batch Processing Job completed successfully');
    } catch (error) {
      console.error('❌ QC Batch Processing Job failed:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  console.log('⏰ QC Batch Processing Job scheduled to run daily at 12:00 AM IST');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error.message);
  console.log(`🔧 Please whitelist IP: ${SERVER_IP} in MongoDB Atlas`);
  console.log('💡 Check your MONGODB_URI in .env file');
});

// Note: Opine model removed - using Contact model instead

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Opine API!' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/interviewer-profile', interviewerProfileRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/cati-interview', catiInterviewRoutes);
app.use('/api/cati', catiRoutes);
app.use('/api/survey-responses', surveyResponseRoutes);
app.use('/api/qc-batches', qcBatchRoutes);
app.use('/api/qc-batch-config', qcBatchConfigRoutes);
app.use('/api/polling-stations', pollingStationRoutes);
app.use('/api/master-data', masterDataRoutes);

// Note: Opines API routes removed - using Contact API instead

// ============================================
// GLOBAL ERROR HANDLING MIDDLEWARE
// ============================================
// Catch-all error handler for Express routes (prevents crashes)
app.use((err, req, res, next) => {
  console.error('❌ EXPRESS ERROR HANDLER:', err);
  console.error('❌ Error name:', err.name);
  console.error('❌ Error message:', err.message);
  console.error('❌ Stack:', err.stack);
  console.error('❌ Request URL:', req.url);
  console.error('❌ Request method:', req.method);
  
  // Send error response but don't crash
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Create HTTP server with increased timeout for large file uploads
const server = require('http').createServer(app);
server.timeout = 7200000; // 2 hours timeout for very large file uploads and report generation
server.keepAliveTimeout = 7200000; // 2 hours keep-alive timeout
server.headersTimeout = 7200000; // 2 hours headers timeout

// Handle server errors gracefully
server.on('error', (error) => {
  console.error('❌ SERVER ERROR:', error);
  console.error('❌ Error details:', {
    code: error.code,
    message: error.message,
    stack: error.stack
  });
  // Don't exit - let PM2 handle restarts if needed
});

// Handle client errors (prevent crashes from bad requests)
server.on('clientError', (error, socket) => {
  console.error('❌ CLIENT ERROR:', error.message);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

// Start HTTP server (reverted for compatibility)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTP Server is running on port ${PORT}`);
  console.log(`🌐 Access your API at: http://${SERVER_IP}:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 CORS Origin: ${CORS_ORIGIN}`);
  console.log(`⚠️  Note: Audio recording requires HTTPS. Use localhost for development.`);
  console.log(`⏱️  Server timeout set to 2 hours for very large file processing (up to 800MB)`);
  console.log(`🛡️  Global error handlers installed to prevent crashes`);
});