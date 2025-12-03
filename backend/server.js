const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
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
app.use('/api/party-logos', express.static(path.join(__dirname, '../../Report-Generation/party symbols')));

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

// Create HTTP server with increased timeout for large file uploads
const server = require('http').createServer(app);
server.timeout = 7200000; // 2 hours timeout for very large file uploads and report generation
server.keepAliveTimeout = 7200000; // 2 hours keep-alive timeout
server.headersTimeout = 7200000; // 2 hours headers timeout

// Start HTTP server (reverted for compatibility)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTP Server is running on port ${PORT}`);
  console.log(`🌐 Access your API at: http://${SERVER_IP}:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 CORS Origin: ${CORS_ORIGIN}`);
  console.log(`⚠️  Note: Audio recording requires HTTPS. Use localhost for development.`);
  console.log(`⏱️  Server timeout set to 2 hours for very large file processing (up to 800MB)`);
});