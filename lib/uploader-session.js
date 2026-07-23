import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const COOKIE_NAME = "romance_uploader_session";
const SESSION_SECONDS = 12 * 60 * 60;

function transferCode() {
  const value = process.env.ROMANCE_CAROUSEL_TRANSFER_CODE?.trim();
  return value && value.length >= 16 ? value : null;
}

function safeEqual(left, right) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [part.slice(0, separator), part.slice(separator + 1)];
      }),
  );
}

export function isTransferConfigured() {
  return Boolean(
    transferCode() &&
      process.env.ROMANCE_CAROUSEL_INGEST_SECRET?.trim() &&
      process.env.MULTI_MOVIE_UPLOADER_URL?.trim(),
  );
}

export function verifyTransferCode(candidate) {
  const expected = transferCode();
  return Boolean(
    expected &&
      typeof candidate === "string" &&
      safeEqual(candidate.trim(), expected),
  );
}

export function issueSessionCookie() {
  const secret = transferCode();
  if (!secret) throw new Error("transfer_not_configured");
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${expires}.${randomBytes(18).toString("base64url")}`;
  const value = `${payload}.${signature(payload, secret)}`;
  return `${COOKIE_NAME}=${value}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function hasValidSession(req) {
  const secret = transferCode();
  if (!secret) return false;
  const value = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [expiresText, nonce, receivedSignature] = parts;
  const expires = Number(expiresText);
  if (
    !Number.isSafeInteger(expires) ||
    expires <= Math.floor(Date.now() / 1000) ||
    !nonce
  ) {
    return false;
  }
  const payload = `${expiresText}.${nonce}`;
  return safeEqual(receivedSignature, signature(payload, secret));
}

export function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const forwardedHost =
      req.headers["x-forwarded-host"] || req.headers.host || "";
    return new URL(origin).host === forwardedHost;
  } catch {
    return false;
  }
}
