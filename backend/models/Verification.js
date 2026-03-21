const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  user_name: {
    type: String,
    required: true
  },
  document_type: {
    type: String,
    required: true,
    enum: ['PAN Card', 'Aadhaar Card', 'Passport', 'Non-KYC Document']
  },
  submitted_date: {
    type: Date,
    default: Date.now
  },
  anomaly_score: {
    type: Number,
    min: 0,
    max: 1
  },
  status: {
    type: String,
    enum: ['Approved', 'Suspicious', 'Rejected', 'Non-KYC'],
    default: 'Pending'
  },
  extracted_data: {
    type: Object,
    default: null
  },
  similar_nodes: {
    type: Array,
    default: []
  },
  // Keep legacy fields for backward compatibility
  details: {
    faceMatch: String,
    forgeryDetection: String,
    documentStatus: String,
    extractedName: String,
    extractedAddress: String,
    ocrData: {
      type: Object,
      default: null
    },
    classScores: {
      type: Object,
      default: null
    }
  },
  identityFile: String,
  supportingFiles: [String]
});

module.exports = mongoose.model('Verification', verificationSchema);
