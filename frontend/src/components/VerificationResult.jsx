import React from "react";
import "./VerificationResult.css";

const VerificationResult = ({ result, onStartNew }) => {
  if (!result) return null;

  const { document_type, extracted_data, anomaly_score, status, similar_records } = result;
  
  // Color coding for anomaly score
  const getScoreColor = (score) => {
    if (score < 0.5) return "#10B981"; // Green - safe
    if (score < 0.9) return "#FBBF24"; // Amber - warning
    return "#EF4444"; // Red - fraud
  };

  const getStatusColor = (status) => {
    return status === "Approved" ? "#10B981" : "#EF4444";
  };

  const scoreColor = getScoreColor(anomaly_score);
  const statusColor = getStatusColor(status);

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
          {status === "Approved" ? "✓" : "⚠"}
        </div>
        <h2>Verification {status}</h2>
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
                {(anomaly_score * 100).toFixed(2)}%
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
                {anomaly_score < 0.5
                  ? "✓ Document appears legitimate - No suspicious patterns detected"
                  : anomaly_score < 0.9
                  ? "⚠ Moderate risk detected - Review carefully"
                  : "⚠ High fraud risk detected - Potential fraudulent document"}
              </p>
            </div>
          </div>
        </div>

        {/* Top 5 Similar Nodes */}
        {similar_records && similar_records.length > 0 && (
          <div className="result-section">
            <h3>Top 5 Most Similar Records</h3>
            <div className="nodes-table">
              <table>
                <thead>
                  <tr>
                    <th>Record ID</th>
                    <th>Similarity Score</th>
                    <th>Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {similar_records.map((record, idx) => {
                    const similarity = record.similarity || 0;
                    const riskLevel = similarity > 0.8 ? "High" : similarity > 0.5 ? "Medium" : "Low";
                    const riskColor =
                      riskLevel === "High" ? "#EF4444" : riskLevel === "Medium" ? "#FBBF24" : "#10B981";

                    return (
                      <tr key={idx}>
                        <td>Record #{idx + 1}</td>
                        <td>
                          <span className="similarity-badge">
                            {(similarity * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td>
                          <span className="risk-badge" style={{ color: riskColor, borderColor: riskColor }}>
                            {riskLevel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Final Status */}
        <div className="result-section final-status">
          <div className="status-box" style={{ borderLeftColor: statusColor }}>
            <h4>Final Verification Status</h4>
            <p className="status-text" style={{ color: statusColor }}>
              {status === "Approved"
                ? "✓ Document verification APPROVED"
                : "⚠ Document verification REJECTED - Potential fraud detected"}
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
