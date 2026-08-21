import { config } from "./config.js";

const API = (method) => `https://api.telegram.org/bot${config.token}/${method}`;

/**
 * One place where every Telegram call goes through, so retries and error
 * logging are written once.
 *
 * Telegram answers 429 with `retry_after` when we send too fast, and 5xx during
 * its own hiccups; both are worth retrying. 400-class answers mean the request
 * itself is wrong (bad chat id, malformed HTML) — retrying those just burns time.
 */
export async function callTelegram(method, payload, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(API(method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(500 * 2 ** attempt);
      continue;
    }

    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return body.result;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(
        `Telegram ${method} failed (${res.status}): ${body.description ?? "unknown"}`,
      );
    }

    const waitSeconds = body.parameters?.retry_after ?? 2 ** attempt;
    await sleep(waitSeconds * 1000);
  }
}

export function sendMessage(chatId, text, extra = {}) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

/**
 * Sends to every configured chat and reports per-chat outcome rather than
 * failing the whole delivery: if the group id is wrong, the owner's private
 * chat should still get the lead.
 */
export async function broadcast(text, extra = {}) {
  const results = await Promise.all(
    config.chatIds.map(async (chatId) => {
      try {
        await sendMessage(chatId, text, extra);
        return { chatId, ok: true };
      } catch (err) {
        console.error(`[telegram] delivery to ${chatId} failed:`, err.message);
        return { chatId, ok: false, error: err.message };
      }
    }),
  );
  return { delivered: results.filter((r) => r.ok).length, results };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
