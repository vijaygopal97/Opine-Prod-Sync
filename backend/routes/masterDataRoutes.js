const express = require('express');
const router = express.Router();
const { getACData } = require('../controllers/masterDataController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Get MP and MLA names for an AC
router.get('/ac/:acName', getACData);

module.exports = router;




