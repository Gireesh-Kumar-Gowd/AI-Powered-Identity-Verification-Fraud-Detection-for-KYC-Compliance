import React, { useState, useRef, useEffect } from "react";
import DashboardLayout from "./DashboardLayout";
import {
  detectDocumentType,
  extractOCRText,
  parseDocument,
  runFraudAnalysis,
} from "../services/api";
import VerificationResult from "./VerificationResult";

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
        document_type: documentType,
        extracted_data: extractedData,
        anomaly_score: fraudResult.anomaly_score,
        threshold: fraudResult.threshold,
        status: fraudResult.status,
        similar_records: fraudResult.similar_records || [],
      };

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

      <div className="upload-grid">
        
        <div className="upload-col">
          
    
          <div className="dash-card">
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

            {mainFile ? (
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
            ) : (
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
            )}
          </div>

        
          <div className="dash-card" style={{ opacity: aiStatus !== 'idle' ? 0.5 : 1, pointerEvents: aiStatus !== 'idle' ? 'none' : 'auto' }}>
            <div className="card-label"><span>Supporting Documents</span></div>
            
            <input 
              type="file" 
              multiple 
              ref={supportingInputRef} 
              onChange={handleSupportingChange} 
              style={{ display: "none" }} 
            />

            <div className="drop-zone" onClick={() => supportingInputRef.current.click()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '28px', height: '28px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <line x1="10" y1="9" x2="8" y2="9"></line>
              </svg>
              <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "4px", color: "var(--text-primary)" }}>Upload supporting docs</div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Address proof, utility bills, etc.</div>
            </div>

           
            {supportingFiles.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                {supportingFiles.map((file, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '8px 12px', borderRadius: '8px', marginBottom: '6px', fontSize: '13px', border: '1px solid var(--border-soft)' }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%' }}>📎 {file.name}</span>
                    <button onClick={() => removeSupportingFile(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

       
        <div className="dash-card ai-panel ai-panel-centered">
          
          <div className={`ai-icon-large ${aiStatus === 'completed' || aiStatus === 'results' ? 'success' : aiStatus === 'scanning' ? 'scanning' : ''}`}>
            {aiStatus === 'idle' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>
            )}
            {aiStatus === 'scanning' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin-anim"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-8.31l5.67-5.67"></path></svg>
            )}
            {(aiStatus === 'completed' || aiStatus === 'results') && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            )}
          </div>

          <h2 className="ai-title">
            {aiStatus === 'idle' && 'AI Verification Engine'}
            {aiStatus === 'scanning' && 'Analyzing Documents'}
            {aiStatus === 'completed' && 'Verification Complete'}
            {aiStatus === 'results' && 'Verification Complete'}
          </h2>
          <p className="ai-subtitle">
            {aiStatus === 'idle' && 'Upload documents to enable the AI engine.'}
            {aiStatus === 'scanning' && 'Please wait while AI verifies identity'}
            {aiStatus === 'completed' && 'Documents analyzed successfully'}
            {aiStatus === 'results' && 'Documents analyzed successfully'}
          </p>

          {(aiStatus === 'scanning' || aiStatus === 'completed') && (
            <div style={{ width: '100%' }}>
              <div className="ai-progress-wrapper">
                <div className="progress-labels">
                  <span>Processing...</span>
                  <span style={{ color: aiStatus === 'completed' ? 'var(--success)' : 'var(--accent)', fontWeight: '600' }}>
                    {progress}%
                  </span>
                </div>
                <div className="scan-progress">
                  <div 
                    className={`scan-progress-fill ${aiStatus === 'completed' ? 'completed' : ''}`} 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              <div className="ai-checklist-left">
                {STEPS.map((step, idx) => (
                  <div key={idx} className={`check-item ${currentStep > idx ? 'done' : currentStep === idx ? 'active' : 'waiting'}`}>
                    <span className="check-icon">
                      {currentStep > idx ? '✓' : currentStep === idx ? '●' : '○'}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiStatus === 'completed' && (
            verificationError ? (
              <div className="error-message" style={{ color: 'var(--danger)', fontSize: '14px', textAlign: 'center', padding: '16px', background: '#fee2e2', borderRadius: '8px', marginTop: '16px' }}>
                ⚠️ {verificationError}
              </div>
            ) : (
              <VerificationResult 
                result={verificationResult}
                onStartNew={handleRemoveFile}
              />
            )
          )}

          <div style={{ width: "100%", marginTop: "auto" }}>
            {aiStatus === 'idle' && (
              <button className="btn-primary" onClick={handleStartVerification} disabled={!mainFile}>
                Start AI Verification
              </button>
            )}
            {aiStatus === 'scanning' && (
              <button className="btn-primary" disabled style={{ background: 'var(--border-soft)', color: 'var(--text-muted)' }}>
                Processing...
              </button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Upload;