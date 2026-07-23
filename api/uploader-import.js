import {
  hasValidSession,
  isSameOrigin,
  isTransferConfigured,
} from "../lib/uploader-session.js";

function uploaderConfig() {
  const baseUrl = process.env.MULTI_MOVIE_UPLOADER_URL?.trim();
  const secret = process.env.ROMANCE_CAROUSEL_INGEST_SECRET?.trim();
  if (!baseUrl || !secret) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

async function parseUpstream(response) {
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : { error: "invalid_uploader_response" };
  return { status: response.status, body };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!isTransferConfigured()) {
    return res.status(503).json({ error: "transfer_not_configured" });
  }
  if (!isSameOrigin(req) || !hasValidSession(req)) {
    return res.status(401).json({ error: "authentication_required" });
  }

  const config = uploaderConfig();
  if (!config) {
    return res.status(503).json({ error: "transfer_not_configured" });
  }

  try {
    if (req.body?.action === "start") {
      const idempotencyKey = req.body.idempotencyKey;
      const payload = req.body.payload;
      if (
        typeof idempotencyKey !== "string" ||
        !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey) ||
        !payload ||
        typeof payload !== "object"
      ) {
        return res.status(400).json({ error: "invalid_request" });
      }
      const upstream = await fetch(
        `${config.baseUrl}/api/integrations/romance-carousel/imports`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.secret}`,
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        },
      );
      const result = await parseUpstream(upstream);
      return res.status(result.status).json(result.body);
    }

    if (req.body?.action === "complete") {
      const importId = req.body.importId;
      if (
        typeof importId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          importId,
        )
      ) {
        return res.status(400).json({ error: "invalid_import_id" });
      }
      const upstream = await fetch(
        `${config.baseUrl}/api/integrations/romance-carousel/imports/${importId}/complete`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${config.secret}` },
        },
      );
      const result = await parseUpstream(upstream);
      return res.status(result.status).json(result.body);
    }

    return res.status(400).json({ error: "invalid_action" });
  } catch {
    return res.status(502).json({ error: "uploader_unavailable" });
  }
}
