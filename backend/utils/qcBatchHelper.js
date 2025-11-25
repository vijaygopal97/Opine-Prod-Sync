const QCBatch = require('../models/QCBatch');
const SurveyResponse = require('../models/SurveyResponse');

/**
 * Get or create a QC batch for a specific survey and date
 * @param {String} surveyId - Survey ID
 * @param {Date} date - Date for the batch (defaults to today)
 * @returns {Promise<QCBatch>}
 */
const getOrCreateBatch = async (surveyId, date = null) => {
  // Use provided date or today's date (start of day)
  const batchDate = date ? new Date(date) : new Date();
  batchDate.setHours(0, 0, 0, 0);
  
  // End of day for query
  const endOfDay = new Date(batchDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Find existing batch for this date
  let batch = await QCBatch.findOne({
    survey: surveyId,
    batchDate: {
      $gte: batchDate,
      $lte: endOfDay
    },
    status: { $in: ['collecting', 'processing', 'qc_in_progress'] }
  });
  
  // If no batch exists, create a new one
  if (!batch) {
    batch = new QCBatch({
      survey: surveyId,
      batchDate: batchDate,
      status: 'collecting',
      responses: [],
      totalResponses: 0,
      sampleResponses: [],
      sampleSize: 0,
      remainingResponses: [],
      remainingSize: 0,
      qcStats: {
        approvedCount: 0,
        rejectedCount: 0,
        pendingCount: 0,
        approvalRate: 0
      },
      remainingDecision: {
        decision: 'pending'
      }
    });
    
    await batch.save();
    console.log(`✅ Created new QC batch for survey ${surveyId} on ${batchDate.toISOString().split('T')[0]}`);
  }
  
  return batch;
};

/**
 * Add a response to a batch
 * @param {String} responseId - SurveyResponse ID
 * @param {String} surveyId - Survey ID
 * @returns {Promise<QCBatch>}
 */
const addResponseToBatch = async (responseId, surveyId) => {
  try {
    // Get or create batch for today
    const batch = await getOrCreateBatch(surveyId);
    
    // Add response to batch if not already added
    if (!batch.responses.includes(responseId)) {
      batch.responses.push(responseId);
      batch.totalResponses = batch.responses.length;
      await batch.save();
      
      // Update response with batch reference
      await SurveyResponse.findByIdAndUpdate(responseId, {
        qcBatch: batch._id,
        isSampleResponse: false
      });
      
      console.log(`✅ Added response ${responseId} to batch ${batch._id}`);
    }
    
    return batch;
  } catch (error) {
    console.error('Error adding response to batch:', error);
    throw error;
  }
};

module.exports = {
  getOrCreateBatch,
  addResponseToBatch
};



