const API_BASE = "http://localhost:5000/api";
const ML_API_BASE = "http://localhost:5001/api/ml";

function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function registerUser({ name, email, password }) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  return res.json();
}

export async function loginUser({ email, password }) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (data.success && data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
  }
  return data;
}

export async function verifyDocument(identityFile, supportingFiles = []) {
  const formData = new FormData();
  formData.append("identity", identityFile);
  supportingFiles.forEach((f) => formData.append("supporting", f));

  const res = await fetch(`${API_BASE}/kyc/verify`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  return res.json();
}

// ===========================================================================
// NEW: 5-Step ML Pipeline API Calls
// ===========================================================================

export async function detectDocumentType(file) {
  const formData = new FormData();
  formData.append("file", file);
  
  const res = await fetch(`${ML_API_BASE}/detect-document-type`, {
    method: "POST",
    body: formData,
  });
  return res.json();
}

export async function extractOCRText(requestId, documentType) {
  const res = await fetch(`${ML_API_BASE}/extract-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: requestId, document_type: documentType }),
  });
  return res.json();
}

export async function parseDocument(requestId, documentType, rawOcrText) {
  const res = await fetch(`${ML_API_BASE}/parse-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      document_type: documentType,
      raw_ocr_text: rawOcrText,
    }),
  });
  return res.json();
}

export async function runFraudAnalysis(requestId, documentType, extractedData) {
  const res = await fetch(`${ML_API_BASE}/fraud-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      document_type: documentType,
      extracted_data: extractedData,
    }),
  });
  return res.json();
}

export async function getHistory() {
  const res = await fetch(`${API_BASE}/kyc/history`, {
    headers: authHeaders(),
  });
  return res.json();
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getCurrentUser() {
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

export function isLoggedIn() {
  return !!getToken();
}
