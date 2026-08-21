/**
 * All configuration lives in the environment: the token is a credential and the
 * chat ids change whenever the team changes, neither belongs in the repo.
 *
 * Node 20+ reads `.env` itself with `--env-file`, so there is no dotenv here and
 * no dependency to install before the server can start.
 */

function list(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  token: process.env.TELEGRAM_BOT_TOKEN ?? "",
  /** More than one id is normal: a personal chat plus the team group. */
  chatIds: list(process.env.TELEGRAM_CHAT_ID),
  port: Number(process.env.PORT ?? 8787),
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  apiKey: process.env.LEAD_API_KEY ?? "",
  polling: String(process.env.BOT_POLLING ?? "").toLowerCase() === "true",
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
};

/** Startup checks. A missing token is fatal — the whole service is the bot. */
export function assertConfig() {
  if (!config.token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required. Copy .env.example to .env and fill it in.");
  }
  if (!config.chatIds.length) {
    console.warn(
      "[config] TELEGRAM_CHAT_ID is empty — leads will be stored but not delivered.\n" +
        "         Send /start to the bot to get the chat id, then put it in .env.",
    );
  }
  if (!config.apiKey) {
    console.warn("[config] LEAD_API_KEY is empty — /api/lead accepts unauthenticated requests.");
  }
}
