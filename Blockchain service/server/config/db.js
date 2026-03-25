import mongoose from "mongoose";
import dns from "node:dns/promises";

function isSrvResolutionError(error) {
  const message = (error?.message || "").toLowerCase();
  const code = (error?.code || error?.cause?.code || "").toString().toLowerCase();
  return (
    message.includes("querysrv") ||
    code === "econnrefused" ||
    code === "etimeout" ||
    code === "enotfound"
  );
}

async function buildStandardAtlasUriFromSrv(srvUri) {
  const parsed = new URL(srvUri);
  const srvHost = parsed.hostname;
  const srvRecord = `_mongodb._tcp.${srvHost}`;
  const srvEntries = await dns.resolveSrv(srvRecord);

  if (!srvEntries.length) {
    throw new Error(`No SRV entries found for ${srvRecord}`);
  }

  const txtEntries = await dns.resolveTxt(srvHost).catch(() => []);
  const query = new URLSearchParams(parsed.searchParams);

  for (const txtRecord of txtEntries) {
    const text = txtRecord.join("");
    const params = new URLSearchParams(text);
    for (const [key, value] of params.entries()) {
      if (!query.has(key)) {
        query.set(key, value);
      }
    }
  }

  const auth = parsed.username
    ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@`
    : "";
  const hosts = srvEntries
    .map((entry) => `${entry.name.replace(/\.$/, "")}:${entry.port}`)
    .join(",");
  const path = parsed.pathname || "/";
  const queryString = query.toString();

  return `mongodb://${auth}${hosts}${path}${queryString ? `?${queryString}` : ""}`;
}

export async function connectDB(uri) {
  if (!uri) {
    throw new Error("MONGODB_URI is required.");
  }

  try {
    await mongoose.connect(uri);
  } catch (error) {
    if (!uri.startsWith("mongodb+srv://") || !isSrvResolutionError(error)) {
      throw error;
    }

    const fallbackUri = await buildStandardAtlasUriFromSrv(uri);
    await mongoose.connect(fallbackUri);
  }
}
