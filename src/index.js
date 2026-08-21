import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { assertConfig, config } from "./config.js";
import { applyCors, clientIp, createRateLimiter, json, readJsonBody } from "./http.js";
import { buildLeadKeyboard, buildLeadMessage } from "./message.js";
import { broadcast } from "./telegram.js";
import { recordLead } from "./store.js";
import { handleUpdate, startPolling } from "./bot.js";

/**
 * A standalone service whose only job is: take a lead, put it in Telegram.
 *
 * It runs apart from the website on purpose. The site is deployed on every copy
 * tweak and can be down or mid-deploy exactly when a lead arrives; the bot token
 * lives in one place instead of in every preview environment; and the bot can
 * keep answering commands while the site is being rebuilt.
 */

const limit = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

/** Constant-time compare so the api key can't be guessed byte by byte. */
function secretEquals(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function validateLead(body) {
  const name = String(body?.name ?? "").trim();
  const contact = String(body?.contact ?? "").trim();

  if (!name || !contact) return { error: "name and contact are required" };
  // A bot filling in every field it finds trips this: real forms leave it empty.
  if (String(body?.website ?? "").trim()) return { error: "rejected" };

  return {
    lead: {
      name: name.slice(0, 120),
      contact: contact.slice(0, 120),
      email:
        String(body?.email ?? "")
          .trim()
          .slice(0, 160) || undefined,
      note:
        String(body?.note ?? "")
          .trim()
          .slice(0, 2000) || undefined,
      source: String(body?.source ?? "Sayt").slice(0, 80),
      lang: String(body?.lang ?? "uz").slice(0, 8),
      metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
    },
  };
}

async function handleLead(req, res) {
  if (config.apiKey && !secretEquals(req.headers["x-api-key"], config.apiKey)) {
    return json(res, 401, { ok: false, error: "unauthorized" });
  }

  const gate = limit(clientIp(req));
  if (!gate.allowed) {
    res.setHeader("Retry-After", String(gate.retryAfter));
    return json(res, 429, { ok: false, error: "too many requests" });
  }

  const body = await readJsonBody(req);
  const { lead, error } = validateLead(body);
  if (error) return json(res, 400, { ok: false, error });

  await recordLead(lead);

  const { delivered, results } = await broadcast(buildLeadMessage(lead), {
    reply_markup: buildLeadKeyboard(lead),
  });

  // The lead is on disk either way, so a delivery failure is reported without
  // pretending the submission itself was lost.
  if (!delivered && config.chatIds.length) {
    return json(res, 502, { ok: false, error: "telegram delivery failed", results });
  }

  return json(res, 200, { ok: true, delivered });
}

async function handleWebhook(req, res, url) {
  // Telegram sends the secret back on every call; without it anyone who guesses
  // the path could feed the bot fake updates.
  const provided = req.headers["x-telegram-bot-api-secret-token"] ?? url.searchParams.get("secret");
  if (!config.webhookSecret || !secretEquals(provided, config.webhookSecret)) {
    return json(res, 401, { ok: false, error: "unauthorized" });
  }

  const update = await readJsonBody(req);
  // Answer first, work after: Telegram retries anything slower than ~60s, and a
  // retried update would run the same command twice.
  json(res, 200, { ok: true });
  await handleUpdate(update);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  try {
    if (!applyCors(req, res)) return json(res, 403, { ok: false, error: "origin not allowed" });
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    if (url.pathname === "/health" || url.pathname === "/") {
      return json(res, 200, {
        ok: true,
        service: "bloom-lead-bot",
        chats: config.chatIds.length,
        mode: config.polling ? "polling" : "webhook",
        uptime: Math.round(process.uptime()),
      });
    }

    if (url.pathname === "/api/lead" && req.method === "POST") return await handleLead(req, res);

    if (url.pathname === "/api/telegram/webhook" && req.method === "POST") {
      return await handleWebhook(req, res, url);
    }

    return json(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    console.error("[server]", err);
    if (res.headersSent) return res.end();
    return json(res, err.statusCode ?? 500, { ok: false, error: err.message ?? "server error" });
  }
});

assertConfig();

const shutdown = new AbortController();
if (config.polling) startPolling({ signal: shutdown.signal });

server.listen(config.port, () => {
  console.log(`[server] lead bot listening on http://localhost:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdown.abort();
    server.close(() => process.exit(0));
    // A long-poll request can hold the loop open for up to 30s; don't wait it out.
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
