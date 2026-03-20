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
    const isSuspicious = mlResult.fraud_detection?.status === 'Suspicious KYC Record';

    let status;
    if (isNonKyc) {
      status = 'Rejected';
    } else if (isSuspicious) {
      status = 'Rejected';
    } else {
      status = 'Approved';
    }

    const ocrData = mlResult.ocr_data || null;
    const fraudDetection = mlResult.fraud_detection || null;

    const details = {
      documentStatus: isNonKyc ? 'Not a valid KYC document' : 'Verified',
      forgeryDetection: fraudDetection
        ? fraudDetection.status
        : 'Not analyzed',
      faceMatch: 'N/A',
      extractedName: ocrData?.['Full Name'] || ocrData?.['Name'] || '',
      extractedAddress: '',
      anomalyScore: fraudDetection?.anomaly_score ?? null,
      fraudStatus: fraudDetection?.status || null,
      ocrData: ocrData,
      classScores: mlResult.class_scores || null,
      similarRecords: fraudDetection?.similar_records || null,
    };

    // Save to database
    const verification = await Verification.create({
      user: req.user.id,
      name: req.user.name,
      initials: req.user.name.split(' ').map(n => n[0]).join(''),
      docType: mlResult.document_type,
      docTypeSub: mlResult.document_type.split(' ')[0],
      confidence: mlResult.confidence,
      status,
      details,
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
    const verifications = await Verification.find({ user: req.user.id }).sort('-date');

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
