import React, { useState, useRef, useEffect } from "react";
import DashboardLayout from "./DashboardLayout";
import {
  detectDocumentType,
  extractOCRText,
  parseDocument,
  runFraudAnalysis,
} from "../services/api";
import VerificationResult from "./VerificationResult";
import NonKYCResult from "./NonKYCResult";

const Upload = () => {
 
  const [mainFile, setMainFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [aiStatus, setAiStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verificationError, setVerificationError] = useState(null);

  const [supportingFiles, setSupportingFiles] = useState([]);
  const supportingInputRef = useRef(null);

  // Step definitions
  const STEPS = [
    "Document Type Detection",
    "OCR Text Extraction",
    "Data Parsing",
    "GNN Fraud Analysis",
    "Final Verification",
  ];

  // Simulate progress while API call is in-flight; stop at 90% until resolved
  useEffect(() => {
    if (aiStatus === "scanning") {
      let currentProgress = 0;

      const interval = setInterval(() => {
        currentProgress += 1.2;
        // Cap at 90% — the remaining 10% is filled when API resolves
        if (currentProgress >= 90) {
          clearInterval(interval);
          currentProgress = 90;
        }
        setProgress(Math.floor(currentProgress));
        // Update step based on progress
        if (currentProgress > 15) setCurrentStep(1);
        if (currentProgress > 35) setCurrentStep(2);
        if (currentProgress > 55) setCurrentStep(3);
        if (currentProgress > 75) setCurrentStep(4);
      }, 100);

      return () => clearInterval(interval);
    } else if (aiStatus === "idle") {
      setProgress(0);
      setCurrentStep(0);
    }
  }, [aiStatus]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setMainFile(e.dataTransfer.files[0]);
      setAiStatus("idle");
      e.dataTransfer.clearData();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setMainFile(e.target.files[0]);
      setAiStatus("idle");
    }
  };

  const handleSupportingChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setSupportingFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeSupportingFile = (index) => {
    setSupportingFiles(supportingFiles.filter((_, i) => i !== index));
  };

  const handleRemoveFile = (e) => {
    if (e) e.stopPropagation();
    setMainFile(null);
    setSupportingFiles([]);
    setAiStatus("idle");
    setVerificationResult(null);
    setVerificationError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (supportingInputRef.current) supportingInputRef.current.value = "";
  };

  const saveVerificationToMongoDB = async (verificationData) => {
    try {
      // If user data isn't in localStorage, use hardcoded admin user (for demo)
      if (!verificationData.user_id) {
        verificationData.user_id = 'admin'; // temporary ID
        verificationData.user_name = 'Admin User';
      }

      console.log('📤 Saving verification to MongoDB:', verificationData);
      
      const url = 'http://localhost:5000/api/kyc/verifications';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(verificationData)
      });

      console.log('📥 Save response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to save verification: ${response.status} ${errorText}`);
      } else {
        const result = await response.json();
        console.log('✅ Verification saved to MongoDB successfully:', result);
      }
    } catch (error) {
      console.error('❌ Error saving verification to MongoDB:', error);
    }
  };

  const handleStartVerification = async () => {
    if (!mainFile) return;
    setVerificationResult(null);
    setVerificationError(null);
    setAiStatus("scanning");

    try {
      // Step 1: Detect document type
      const detectionResult = await detectDocumentType(mainFile);
      if (!detectionResult.success) {
        throw new Error(detectionResult.error || "Detection failed");
      }
      const requestId = detectionResult.request_id;
      const documentType = detectionResult.document_type;
      setCurrentStep(1);
      setProgress(25);

      // Check if document is valid KYC document
      const validKYCDocuments = ["Aadhaar Card", "Pan Card", "Passport"];
      if (!validKYCDocuments.includes(documentType)) {
        // Non-KYC document detected - stop pipeline and save to MongoDB
        const nonKYCResult = {
          is_non_kyc: true,
          document_type: documentType,
        };
        
        // Save non-KYC verification to MongoDB
        await saveVerificationToMongoDB({
          user_id: 'admin',
          user_name: 'Admin User',
          document_type: documentType,
          anomaly_score: null,
          status: 'Non-KYC',
          extracted_data: {},
          similar_nodes: []
        });

        setVerificationResult(nonKYCResult);
        setCurrentStep(1);
        setProgress(100);
        setAiStatus("completed");
        return;
      }

      // Step 2: Extract OCR text
      const ocrResult = await extractOCRText(requestId, documentType);
      if (!ocrResult.success) {
        throw new Error(ocrResult.error || "OCR extraction failed");
      }
      const rawOcrText = ocrResult.raw_ocr_text;
      setCurrentStep(2);
      setProgress(45);

      // Step 3: Parse document with Groq
      const parseResult = await parseDocument(requestId, documentType, rawOcrText);
      if (!parseResult.success) {
        throw new Error(parseResult.error || "Document parsing failed");
      }
      const extractedData = parseResult.extracted_data;
      setCurrentStep(3);
      setProgress(65);

      // Step 4: Run GNN fraud analysis
      const fraudResult = await runFraudAnalysis(requestId, documentType, extractedData);
      if (!fraudResult.success) {
        throw new Error(fraudResult.error || "GNN analysis failed");
      }
      setCurrentStep(4);
      setProgress(100);

      // Combine all results
      const finalResult = {
        is_non_kyc: false,
        document_type: documentType,
        extracted_data: extractedData,
        anomaly_score: fraudResult.anomaly_score,
        threshold: fraudResult.threshold,
        status: fraudResult.status,
        similar_records: fraudResult.similar_records || [],
      };


      // Save verification to MongoDB
      await saveVerificationToMongoDB({
        user_id: 'admin',
        user_name: 'Admin User',
        document_type: documentType,
        anomaly_score: fraudResult.anomaly_score,
        status: fraudResult.status,
        extracted_data: extractedData,
        similar_nodes: fraudResult.similar_records || []
      });

      setVerificationResult(finalResult);
      setAiStatus("completed");
    } catch (err) {
      setCurrentStep(4);
      setProgress(100);
      setVerificationError(err.message || "Could not reach server. Please try again.");
      setAiStatus("completed");
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1>New KYC Verification</h1>
        <p>Upload identity documents for AI-powered verification</p>
      </div>

      <div className="kyc-layout-container">
        
        {/* LEFT SIDE (60%) - Upload Box or Results */}
        <div className="kyc-left-panel">
          
          {/* Upload Box - Shown when no file selected or during idle state */}
          {!mainFile && (
            <div className="dash-card upload-card-full">
              <div className="card-label">
                <span>Identity Document <span style={{ color: "var(--danger)" }}>*</span></span>
              </div>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".jpg,.jpeg,.png,.pdf" 
                style={{ display: "none" }} 
                disabled={aiStatus !== 'idle'} 
              />
              
              <div 
                className="drop-zone" 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
              >
                <div style={{ fontSize: "28px", color: isDragging ? "var(--accent)" : "var(--text-muted)", marginBottom: "12px", transition: "0.2s" }}>
                  {isDragging ? "📥" : "📄"}
                </div>
                <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "4px", color: isDragging ? "var(--accent)" : "var(--text-primary)" }}>
                  {isDragging ? "Drop file here" : "Click or drag file to upload"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  PNG, JPG or PDF • Max 5MB
                </div>
              </div>
            </div>
          )}

          {/* Selected Document Info + Results - Shown after file is selected */}
          {mainFile && (
            <>
              {/* Selected Document Card */}
              <div className="dash-card">
                <div className="card-label"><span>Selected Document</span></div>
                <div className="file-chip">
                  <div className="file-chip-icon">✓</div>
                  <div className="file-chip-info">
                    <div className="file-chip-name">{mainFile.name}</div>
                    <div className="file-chip-meta">{formatFileSize(mainFile.size)} • Ready to process</div>
                  </div>
                  {aiStatus === 'idle' && (
                    <button className="btn-remove" onClick={handleRemoveFile}>
                      ✕ Remove file
                    </button>
                  )}
                </div>
              </div>

              {/* Start Button - Shown when idle with file selected */}
              {aiStatus === 'idle' && (
                <button className="btn-primary" onClick={handleStartVerification}>
                  Start AI Verification
                </button>
              )}

              {/* Error Message - Shown on completion if error */}
              {aiStatus === 'completed' && verificationError && (
                <div className="dash-card" style={{ background: '#fee2e2', borderLeft: '4px solid #dc2626' }}>
                  <div style={{ color: '#dc2626', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <span>{verificationError}</span>
                  </div>
                </div>
              )}

              {/* Results - Shown on completion if no error */}
              {aiStatus === 'completed' && !verificationError && (
                <>
                  {verificationResult?.is_non_kyc ? (
                    <NonKYCResult />
                  ) : (
                    <VerificationResult 
                      result={verificationResult}
                      onStartNew={handleRemoveFile}
                    />
                  )}
                </>
              )}

              {/* Verify Another Button - Shown on completion */}
              {aiStatus === 'completed' && (
                <button className="btn-primary" onClick={handleRemoveFile}>
                  Verify Another Document
                </button>
              )}
            </>
          )}
        </div>

        {/* RIGHT SIDE (40%) - STATIC Progress Checklist (NEVER CHANGES) */}
        <div className="kyc-right-panel">
          <div className="dash-card progress-card-static">
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Verification Progress
            </h3>
            
            <div className="ai-checklist">
              {STEPS.map((step, idx) => {
                let stepStatus = 'waiting';
                if (aiStatus === 'idle') stepStatus = 'waiting';
                else if (currentStep > idx) stepStatus = 'done';
                else if (currentStep === idx) stepStatus = 'active';
                else stepStatus = 'waiting';
                
                // Mark remaining steps as skipped for non-KYC documents
                if (verificationResult?.is_non_kyc && idx > 0) {
                  stepStatus = 'skipped';
                }

                return (
                  <div key={idx} className={`check-item ${stepStatus}`}>
                    <span className="check-icon">
                      {stepStatus === 'done' ? '✓' : stepStatus === 'active' ? '●' : stepStatus === 'skipped' ? '✗' : '○'}
                    </span>
                    {step}
                  </div>
                );
              })}
            </div>

            {/* Progress Bar - Shown during scanning */}
            {aiStatus === 'scanning' && (
              <div style={{ marginTop: '1.5rem' }}>
                <div className="progress-labels">
                  <span>Processing...</span>
                  <span style={{ color: 'var(--accent)', fontWeight: '600' }}>
                    {progress}%
                  </span>
                </div>
                <div className="scan-progress">
                  <div 
                    className="scan-progress-fill" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Complete Indicator - Shown after completion */}
            {aiStatus === 'completed' && (
              <div style={{ marginTop: '1.5rem', padding: '0.875rem', background: '#dcfce7', borderRadius: '6px', color: '#166534', fontSize: '14px', textAlign: 'center', fontWeight: '500', border: '1px solid #bbf7d0' }}>
                ✓ Verification Process Complete
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Upload;