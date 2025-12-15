const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const CatiRespondentQueue = require('../models/CatiRespondentQueue');

// Survey ID to process
const SURVEY_ID = '68fd1915d41841da463f0d46';

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Opine';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Remove duplicate phone numbers, keeping only the first occurrence
 */
async function removeDuplicatePhones() {
  try {
    console.log('\n🔍 Starting duplicate removal process...');
    console.log(`📋 Survey ID: ${SURVEY_ID}\n`);

    // Get all queue entries for this survey, sorted by createdAt (oldest first)
    const allEntries = await CatiRespondentQueue.find({
      survey: new mongoose.Types.ObjectId(SURVEY_ID)
    })
    .select('_id respondentContact.phone respondentContact.name status createdAt')
    .sort({ createdAt: 1, _id: 1 }); // Sort by creation date, then by _id for consistent ordering

    console.log(`📊 Total queue entries found: ${allEntries.length}\n`);

    // Group by phone number and identify duplicates
    const phoneMap = new Map();
    const entriesToDelete = [];
    const entriesToKeep = [];

    allEntries.forEach(entry => {
      const phone = entry.respondentContact?.phone;
      if (!phone) {
        return; // Skip entries without phone numbers
      }

      // Normalize phone number (remove spaces, dashes, etc.)
      const normalizedPhone = phone.trim().replace(/[\s\-\(\)]/g, '');

      if (!phoneMap.has(normalizedPhone)) {
        // First occurrence - keep it
        phoneMap.set(normalizedPhone, entry);
        entriesToKeep.push({
          _id: entry._id.toString(),
          phone: phone,
          name: entry.respondentContact?.name || 'N/A',
          status: entry.status,
          createdAt: entry.createdAt
        });
      } else {
        // Duplicate - mark for deletion
        entriesToDelete.push({
          _id: entry._id.toString(),
          phone: phone,
          name: entry.respondentContact?.name || 'N/A',
          status: entry.status,
          createdAt: entry.createdAt,
          keptEntry: {
            _id: phoneMap.get(normalizedPhone)._id.toString(),
            name: phoneMap.get(normalizedPhone).respondentContact?.name || 'N/A'
          }
        });
      }
    });

    console.log(`📊 Analysis Results:`);
    console.log(`   - Total entries: ${allEntries.length}`);
    console.log(`   - Unique phone numbers: ${phoneMap.size}`);
    console.log(`   - Entries to keep: ${entriesToKeep.length}`);
    console.log(`   - Entries to delete: ${entriesToDelete.length}\n`);

    if (entriesToDelete.length === 0) {
      console.log('✅ No duplicates found. Nothing to delete.\n');
      return {
        totalEntries: allEntries.length,
        uniquePhones: phoneMap.size,
        kept: entriesToKeep.length,
        deleted: 0,
        deletedIds: []
      };
    }

    // Show summary of what will be deleted
    console.log('⚠️  Entries to be deleted (keeping first occurrence):\n');
    console.log('='.repeat(80));
    
    // Group deletions by phone for better readability
    const deletionsByPhone = new Map();
    entriesToDelete.forEach(entry => {
      const normalizedPhone = entry.phone.trim().replace(/[\s\-\(\)]/g, '');
      if (!deletionsByPhone.has(normalizedPhone)) {
        deletionsByPhone.set(normalizedPhone, []);
      }
      deletionsByPhone.get(normalizedPhone).push(entry);
    });

    let deletionCount = 0;
    deletionsByPhone.forEach((deletions, phone) => {
      if (deletions.length > 0) {
        const keptEntry = deletions[0].keptEntry;
        console.log(`\n📞 Phone: ${phone} (${deletions.length} duplicate(s) to delete)`);
        console.log(`   ✅ Keeping: ${keptEntry._id} - ${keptEntry.name}`);
        deletions.forEach((del, idx) => {
          console.log(`   ❌ Deleting ${idx + 1}: ${del._id} - ${del.name} (Status: ${del.status})`);
          deletionCount++;
        });
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\n🗑️  Ready to delete ${entriesToDelete.length} duplicate entries...\n`);

    // Extract IDs to delete
    const idsToDelete = entriesToDelete.map(e => new mongoose.Types.ObjectId(e._id));

    // Perform deletion
    console.log('🗑️  Deleting duplicate entries...');
    const deleteResult = await CatiRespondentQueue.deleteMany({
      _id: { $in: idsToDelete }
    });

    console.log(`✅ Deletion completed:`);
    console.log(`   - Deleted: ${deleteResult.deletedCount} entries\n`);

    // Save deletion log
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, `duplicate-deletion-log-${SURVEY_ID}-${Date.now()}.json`);
    
    const deletionLog = {
      surveyId: SURVEY_ID,
      timestamp: new Date().toISOString(),
      summary: {
        totalEntries: allEntries.length,
        uniquePhones: phoneMap.size,
        kept: entriesToKeep.length,
        deleted: deleteResult.deletedCount
      },
      deletedEntries: entriesToDelete,
      keptEntries: entriesToKeep
    };

    fs.writeFileSync(logPath, JSON.stringify(deletionLog, null, 2));
    console.log(`💾 Deletion log saved to: ${logPath}\n`);

    return {
      totalEntries: allEntries.length,
      uniquePhones: phoneMap.size,
      kept: entriesToKeep.length,
      deleted: deleteResult.deletedCount,
      deletedIds: idsToDelete.map(id => id.toString()),
      logPath: logPath
    };

  } catch (error) {
    console.error('❌ Error removing duplicates:', error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    await connectDB();
    const result = await removeDuplicatePhones();
    
    console.log('\n📊 Final Summary:');
    console.log('='.repeat(80));
    console.log(`   Total entries before: ${result.totalEntries}`);
    console.log(`   Unique phone numbers: ${result.uniquePhones}`);
    console.log(`   Entries kept: ${result.kept}`);
    console.log(`   Entries deleted: ${result.deleted}`);
    console.log('='.repeat(80));
    
    await mongoose.connection.close();
    console.log('\n✅ MongoDB connection closed');
    console.log('✅ Duplicate removal completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { removeDuplicatePhones };


