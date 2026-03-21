import React from "react";
import "./VerificationResult.css";

const VerificationResult = ({ result, onStartNew }) => {
  if (!result) return null;

  const { document_type, extracted_data, anomaly_score, status, similar_records } = result;
  
  // Determine status based on anomaly score
  const getApprovalStatus = (score) => {
    // anomaly_score < 0.5 = APPROVED (legitimate)
    // anomaly_score >= 0.5 = SUSPICIOUS (potential fraud)
    return score < 0.5 ? "Approved" : "Suspicious";
  };

  // Color coding for anomaly score - FIXED THRESHOLDS
  const getScoreColor = (score) => {
    if (score < 0.3) return "#10B981"; // Green - low anomaly (0.0-0.3)
    if (score < 0.6) return "#FBBF24"; // Yellow - moderate anomaly (0.3-0.6)
    return "#EF4444"; // Red - high anomaly (0.6-1.0)
  };

  const getStatusColor = (isApproved) => {
    return isApproved ? "#10B981" : "#EF4444";
  };

  // Determine approval status
  const approvalStatus = getApprovalStatus(anomaly_score);
  const scoreColor = getScoreColor(anomaly_score);
  const statusColor = getStatusColor(approvalStatus === "Approved");

  // Get fields to display based on document type
  const getDisplayFields = () => {
    if (!extracted_data) return [];
    
    switch (document_type) {
      case "Aadhaar Card":
        return [
          { label: "Full Name", value: extracted_data["Full Name"] || "N/A" },
          { label: "Gender", value: extracted_data["Gender"] || "N/A" },
          { label: "Date of Birth", value: extracted_data["Date/Year of Birth"] || "N/A" },
          { label: "Aadhaar Number", value: extracted_data["Aadhaar Number"] || "N/A" },
        ];
      case "Pan Card":
        return [
          { label: "Name", value: extracted_data["Name"] || "N/A" },
          { label: "Parent's Name", value: extracted_data["Parent's Name"] || "N/A" },
          { label: "Date of Birth", value: extracted_data["Date of Birth"] || "N/A" },
          { label: "PAN Number", value: extracted_data["PAN Number"] || "N/A" },
        ];
      case "Passport":
        return [
          { label: "Full Name", value: `${extracted_data["given_name"] || ""} ${extracted_data["surname"] || ""}`.trim() || "N/A" },
          { label: "Nationality", value: extracted_data["nationality"] || "N/A" },
          { label: "Gender", value: extracted_data["sex"] || "N/A" },
          { label: "Date of Birth", value: extracted_data["date_of_birth"] || "N/A" },
          { label: "Place of Birth", value: extracted_data["place_of_birth"] || "N/A" },
          { label: "Place of Issue", value: extracted_data["place_of_issue"] || "N/A" },
        ];
      default:
        return [];
    }
  };

  return (
    <div className="verification-result-container">
      {/* Status Circle */}
      <div className="result-header">
        <div className="status-circle" style={{ backgroundColor: statusColor }}>
          {approvalStatus === "Approved" ? "✓" : "⚠"}
        </div>
        <h2>Verification {approvalStatus}</h2>
        <p>All steps completed successfully</p>
      </div>

      {/* Main Result Card */}
      <div className="result-card">
        {/* Document Info */}
        <div className="result-section">
          <h3>Document Information</h3>
          <div className="info-grid">
            <div className="info-row">
              <span className="info-label">Document Type</span>
              <span className="info-value">{document_type}</span>
            </div>
          </div>
        </div>

        {/* Extracted Fields */}
        <div className="result-section">
          <h3>Extracted Information</h3>
          <div className="info-grid">
            {getDisplayFields().map((field, idx) => (
              <div key={idx} className="info-row">
                <span className="info-label">{field.label}</span>
                <span className="info-value">{field.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Anomaly Score */}
        <div className="result-section">
          <h3>Fraud Analysis Results</h3>
          <div className="anomaly-card" style={{ borderLeftColor: scoreColor }}>
            <div className="anomaly-header">
              <span>Anomaly Score</span>
              <span className="anomaly-score" style={{ color: scoreColor }}>
                {anomaly_score.toFixed(2)}
              </span>
            </div>
            <div className="anomaly-bar">
              <div
                className="anomaly-fill"
                style={{
                  width: `${Math.min(anomaly_score * 100, 100)}%`,
                  backgroundColor: scoreColor,
                }}
              />
            </div>
            <div className="anomaly-info">
              <p>
                {anomaly_score < 0.3
                  ? "✓ Low anomaly - Document appears genuine"
                  : anomaly_score < 0.6
                  ? "⚠ Moderate anomaly - Manual review recommended"
                  : "⚠ High anomaly - Suspicious document"}
              </p>
            </div>
          </div>
        </div>

        {/* Top 5 Similar Nodes */}
        {similar_records && similar_records.length > 0 && (
          <div className="result-section">
            <h3>Top 5 Most Similar Documents</h3>
            <div className="similar-docs-container">
              {similar_records.slice(0, 2).map((record, idx) => (
                <div key={idx} className="similar-doc-card">
                  <div className="doc-header">
                    <span className="doc-number">Document #{idx + 1}</span>
                    <span className="similarity-badge">
                      Similarity: {record.similarity.toFixed(4)}
                    </span>
                  </div>
                  <div className="doc-details">
                    {Object.entries(record).map(([key, value]) => {
                      if (key === 'similarity') return null;
                      return (
                        <div key={key} className="detail-row">
                          <span className="detail-label">{key}:</span>
                          <span className="detail-value">{String(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Final Status */}
        <div className="result-section final-status">
          <div className="status-box" style={{ borderLeftColor: statusColor }}>
            <h4>Final Verification Status</h4>
            <p className="status-text" style={{ color: statusColor }}>
              {approvalStatus === "Approved"
                ? "✓ Document verification APPROVED"
                : "⚠ Document verification SUSPICIOUS - Potential fraud detected"}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button className="btn-new-verification" onClick={onStartNew}>
          Start New Verification
        </button>
      </div>
    </div>
  );
};

export default VerificationResult;
