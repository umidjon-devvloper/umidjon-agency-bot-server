import { config } from "./config.js";

/** Bodies larger than this are refused unread — a lead is a few hundred bytes. */
const MAX_BODY_BYTES = 32 * 1024;

export function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/**
 * The browser only reaches this service if the site posts leads directly; the
 * normal path is server-to-server from the site's backend, which sends no
 * Origin at all. So: no Origin — allow; an Origin — it must be on the list.
 */
export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;

  if (!config.allowedOrigins.includes(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  res.setHeader("Access-Control-Max-Age", "86400");
  return true;
}

export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error("Payload too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Body is not valid JSON");
    err.statusCode = 400;
    throw err;
  }
}

/**
 * A public form endpoint invites floods — a bored visitor with a loop, or a
 * scraper. A fixed window per IP is crude but keeps a burst out of the phone,
 * which is the thing that actually costs the team something.
 */
export function createRateLimiter({ limit = 10, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();

  return function check(key) {
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      // Sweep here rather than on a timer: the map only grows while requests
      // arrive, so cleanup while handling one is enough to keep it bounded.
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
      }
      return { allowed: true };
    }

    entry.count++;
    if (entry.count > limit) {
      return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
    }
    return { allowed: true };
  };
}

/** Behind Railway/Render/nginx the socket address is the proxy, not the visitor. */
export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}
