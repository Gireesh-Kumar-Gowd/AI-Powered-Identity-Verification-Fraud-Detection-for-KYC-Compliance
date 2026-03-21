const path = require('path');
const fs = require('fs');
const Verification = require('../models/Verification');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

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
    const { status, docType, days } = req.query;
    let query = {};

    // Filter by status
    if (status && status !== 'All Status') {
      query.status = status;
    }

    // Filter by document type
    if (docType && docType !== 'All Documents') {
      query.document_type = docType;
    }

    // Filter by date range
    if (days && days !== 'All Time') {
      const daysNum = parseInt(days);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysNum);
      query.submitted_date = { $gte: cutoffDate };
    }

    const verifications = await Verification.find(query)
      .sort('-submitted_date')
      .limit(1000);

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

exports.getVerificationStats = async (req, res, next) => {
  try {
    const total = await Verification.countDocuments();
    const approved = await Verification.countDocuments({ status: 'Approved' });
    const suspicious = await Verification.countDocuments({ status: 'Suspicious' });
    const rejected = await Verification.countDocuments({ status: 'Rejected' });
    const nonKyc = await Verification.countDocuments({ status: 'Non-KYC' });

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
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.saveVerification = async (req, res, next) => {
  try {
    const { user_id, user_name, document_type, anomaly_score, status, extracted_data, similar_nodes } = req.body;

    if (!user_id || !user_name || !document_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, user_name, document_type'
      });
    }

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

    res.status(201).json({
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
