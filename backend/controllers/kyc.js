const path = require('path');
const fs = require('fs');
const Verification = require('../models/Verification');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
const NODE_ENV = process.env.NODE_ENV || 'development';

exports.verifyDocuments = async (req, res, next) => {
  try {
    if (!req.files || !req.files['identity']) {
      return res.status(400).json({
        success: false,
        error: 'Please upload an identity document'
      });
    }

    const identityFile = req.files['identity'][0];
    const supportingFiles = req.files['supporting'] || [];

    // --- Forward the identity image to the Python ML service ---
    const filePath = path.resolve(identityFile.path);
    const fileBuffer = fs.readFileSync(filePath);

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), identityFile.originalname);

    let mlResult;
    try {
      const mlResponse = await fetch(`${ML_SERVICE_URL}/api/ml/classify`, {
        method: 'POST',
        body: formData,
      });

      if (!mlResponse.ok) {
        const errBody = await mlResponse.text();
        throw new Error(`ML service returned ${mlResponse.status}: ${errBody}`);
      }

      mlResult = await mlResponse.json();
    } catch (mlErr) {
      return res.status(502).json({
        success: false,
        error: `ML service unavailable: ${mlErr.message}`
      });
    }

    // --- Map ML result to verification record ---
    const isNonKyc = mlResult.document_type === 'Non-KYC Document';
    const isSuspicious = mlResult.fraud_detection?.status === 'Suspicious';
    const anomalyScore = mlResult.fraud_detection?.anomaly_score ?? null;

    let status;
    if (isNonKyc) {
      status = 'Non-KYC';
    } else if (isSuspicious) {
      status = 'Suspicious';
    } else {
      status = 'Approved';
    }

    const ocrData = mlResult.ocr_data || null;
    const fraudDetection = mlResult.fraud_detection || null;

    // Save to database
    const verification = await Verification.create({
      user_id: req.user.id,
      user_name: req.user.name,
      document_type: mlResult.document_type,
      submitted_date: new Date(),
      anomaly_score: anomalyScore,
      status: status,
      extracted_data: ocrData,
      similar_nodes: fraudDetection?.similar_records || [],
      // Keep legacy fields
      details: {
        documentStatus: isNonKyc ? 'Not a valid KYC document' : 'Verified',
        forgeryDetection: fraudDetection ? fraudDetection.status : 'Not analyzed',
        faceMatch: 'N/A',
        extractedName: ocrData?.['Full Name'] || ocrData?.['Name'] || '',
        extractedAddress: '',
        ocrData: ocrData,
        classScores: mlResult.class_scores || null,
      },
      identityFile: identityFile.path,
      supportingFiles: supportingFiles.map(f => f.path)
    });

    res.status(200).json({
      success: true,
      data: verification
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.getHistory = async (req, res, next) => {
  try {
    const verifications = await Verification.find({ user_id: req.user.id }).sort('-submitted_date');

    res.status(200).json({
      success: true,
      count: verifications.length,
      data: verifications
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.getAllVerifications = async (req, res, next) => {
  try {
    console.log('🔵 getAllVerifications endpoint called');
    console.log('Query parameters:', req.query);
    
    const { status, docType, days } = req.query;
    let query = {};

    // Filter by status
    if (status && status !== 'All Status') {
      query.status = status;
      console.log('Filtering by status:', status);
    }

    // Filter by document type
    if (docType && docType !== 'All Documents') {
      query.document_type = docType;
      console.log('Filtering by document type:', docType);
    }

    // Filter by date range
    if (days && days !== 'All Time') {
      const daysNum = parseInt(days);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysNum);
      query.submitted_date = { $gte: cutoffDate };
      console.log('Filtering by date range:', daysNum, 'days');
    }

    console.log('Query object:', JSON.stringify(query));
    
    const verifications = await Verification.find(query)
      .sort('-submitted_date')
      .limit(1000)
      .lean();

    console.log(`✅ Verifications found: ${verifications.length}`);
    if (verifications.length > 0) {
      console.log(`First record:`, JSON.stringify(verifications[0], null, 2));
    } else {
      console.log('📭 No verifications found in database');
    }
    
    // Properly serialize ObjectId
    const serializedVerifications = verifications.map(v => {
      return {
        ...v,
        _id: v._id ? v._id.toString() : v._id
      };
    });
    
    res.status(200).json({
      success: true,
      count: serializedVerifications.length,
      data: serializedVerifications
    });
  } catch (err) {
    console.error('❌ Error in getAllVerifications:', err.message);
    console.error('📋 Stack trace:', err.stack);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.getVerificationStats = async (req, res, next) => {
  try {
    console.log('🔵 getVerificationStats endpoint called');
    
    const total = await Verification.countDocuments();
    const approved = await Verification.countDocuments({ status: 'Approved' });
    const suspicious = await Verification.countDocuments({ status: 'Suspicious' });
    const rejected = await Verification.countDocuments({ status: 'Rejected' });
    const nonKyc = await Verification.countDocuments({ status: 'Non-KYC' });

    console.log(`✅ Stats - Total: ${total}, Approved: ${approved}, Suspicious: ${suspicious}, Rejected: ${rejected}, NonKYC: ${nonKyc}`);

    res.status(200).json({
      success: true,
      data: {
        total,
        approved,
        suspicious,
        rejected,
        nonKyc
      }
    });
  } catch (err) {
    console.error('❌ Error in getVerificationStats:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.saveVerification = async (req, res, next) => {
  try {
    console.log('🔵 saveVerification endpoint called');
    console.log('Request body:', req.body);
    
    const { user_id, user_name, document_type, anomaly_score, status, extracted_data, similar_nodes } = req.body;

    if (!user_id || !user_name || !document_type) {
      console.error('❌ Missing required fields:', { user_id, user_name, document_type });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, user_name, document_type'
      });
    }

    console.log('✅ All required fields present, creating verification...');
    
    const verification = await Verification.create({
      user_id,
      user_name,
      document_type,
      submitted_date: new Date(),
      anomaly_score,
      status,
      extracted_data,
      similar_nodes: similar_nodes || []
    });

    console.log('✅ Verification saved successfully:', verification._id);
    
    res.status(201).json({
      success: true,
      data: verification
    });
  } catch (err) {
    console.error('❌ Error in saveVerification:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.saveManualDecision = async (req, res, next) => {
  try {
    console.log('\n🔵 saveManualDecision endpoint called');
    console.log('📨 Request method:', req.method);
    console.log('📨 Content-Type:', req.headers['content-type']);
    console.log('📨 Request body:', JSON.stringify(req.body, null, 2));
    
    const { user_name, document_type, anomaly_score, status, extracted_data, similar_nodes } = req.body;

    // Validate required fields
    if (!user_name || !document_type || !status) {
      console.error('❌ Missing required fields for manual decision:', { user_name, document_type, status });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_name, document_type, status'
      });
    }

    console.log('✅ All required fields present');
    console.log('📦 Creating verification with status:', status);
    
    const verification = await Verification.create({
      user_id: 'admin',
      user_name,
      document_type,
      submitted_date: new Date(),
      anomaly_score: anomaly_score !== undefined ? anomaly_score : null,
      status,
      extracted_data: extracted_data || {},
      similar_nodes: similar_nodes || []
    });

    console.log('✅ Manual decision saved successfully to MongoDB');
    console.log('📊 Verification ID:', verification._id);
    console.log('📊 Document details:', { 
      user_name: verification.user_name,
      document_type: verification.document_type,
      status: verification.status,
      anomaly_score: verification.anomaly_score
    });
    
    // Properly serialize ObjectId
    res.status(201).json({
      success: true,
      verification_id: verification._id.toString(),
      data: {
        _id: verification._id.toString(),
        user_name: verification.user_name,
        document_type: verification.document_type,
        submitted_date: verification.submitted_date,
        anomaly_score: verification.anomaly_score,
        status: verification.status,
        extracted_data: verification.extracted_data,
        similar_nodes: verification.similar_nodes
      }
    });
  } catch (err) {
    console.error('\n❌ Error in saveManualDecision:', err.message);
    console.error('📋 Full error details:', err);
    console.error('🗄️ MongoDB connection status:', Verification.collection.conn.readyState);
    res.status(500).json({
      success: false,
      error: err.message,
      details: NODE_ENV === 'development' ? err.toString() : 'Internal server error'
    });
  }
};

// Reset verification data (development only)
exports.resetVerifications = async (req, res, next) => {
  try {
    if (NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        error: 'Reset only available in development mode'
      });
    }

    console.log('🔄 Resetting verifications collection...');
    const result = await Verification.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} documents`);

    res.status(200).json({
      success: true,
      message: `Reset complete. Deleted ${result.deletedCount} documents`,
      deleted: result.deletedCount
    });
  } catch (err) {
    console.error('❌ Error resetting verifications:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
