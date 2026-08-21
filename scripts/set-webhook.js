/**
 * Registers (or removes) the Telegram webhook.
 *
 * Only needed when running with BOT_POLLING=false behind a public https URL:
 *   node --env-file=.env scripts/set-webhook.js https://bot.example.com
 *   node --env-file=.env scripts/set-webhook.js --delete
 */
import { config } from "../src/config.js";

const arg = process.argv[2];
if (!config.token) throw new Error("TELEGRAM_BOT_TOKEN is missing");

async function call(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  console.log(method, body);
  if (!body.ok) process.exitCode = 1;
}

if (arg === "--delete") {
  await call("deleteWebhook", { drop_pending_updates: false });
} else if (arg?.startsWith("https://")) {
  if (!config.webhookSecret) throw new Error("TELEGRAM_WEBHOOK_SECRET is required for webhooks");
  await call("setWebhook", {
    url: `${arg.replace(/\/$/, "")}/api/telegram/webhook`,
    secret_token: config.webhookSecret,
    allowed_updates: ["message", "channel_post"],
  });
} else {
  console.error(
    "usage: node --env-file=.env scripts/set-webhook.js <https://public-url | --delete>",
  );
  process.exitCode = 1;
}
