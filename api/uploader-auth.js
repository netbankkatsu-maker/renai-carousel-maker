import {
  clearSessionCookie,
  hasValidSession,
  isSameOrigin,
  isTransferConfigured,
  issueSessionCookie,
  verifyTransferCode,
} from "../lib/uploader-session.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!isTransferConfigured()) {
    return res.status(503).json({ error: "transfer_not_configured" });
  }
  if (req.method === "GET") {
    return res.status(200).json({ authenticated: hasValidSession(req) });
  }
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.status(200).json({ authenticated: false });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: "origin_not_allowed" });
  }
  if (!verifyTransferCode(req.body?.code)) {
    return res.status(401).json({ error: "invalid_transfer_code" });
  }

  res.setHeader("Set-Cookie", issueSessionCookie());
  return res.status(200).json({ authenticated: true });
}
