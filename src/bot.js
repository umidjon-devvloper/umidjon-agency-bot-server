import { config } from "./config.js";
import { callTelegram, sendMessage } from "./telegram.js";

/**
 * The bot side of the service: what happens when a person writes to the bot
 * rather than when the site posts a lead.
 *
 * It is deliberately small. The bot's real job is to deliver leads; the commands
 * exist so setup needs no getUpdates-URL-in-a-browser ritual — press Start and
 * the bot tells you the chat id to paste into .env.
 */

const HELP = [
  "🤖 <b>Bloom lead bot</b>",
  "",
  "Bu bot saytdagi formalardan kelgan arizalarni shu chatga yuboradi.",
  "",
  "<b>Buyruqlar</b>",
  "/id — shu chat id sini ko'rsatadi",
  "/ping — bot va server ishlayotganini tekshiradi",
  "/help — shu yordam",
].join("\n");

async function handleMessage(message) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  const text = String(message.text ?? "").trim();
  // Group commands arrive as "/id@bloom_lead_bot".
  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();

  if (command === "/start" || command === "/help") {
    await sendMessage(chatId, `${HELP}\n\n🆔 <b>Chat id:</b> <code>${chatId}</code>`);
    return;
  }

  if (command === "/id") {
    await sendMessage(
      chatId,
      `🆔 <b>Chat id:</b> <code>${chatId}</code>\n\n.env fayldagi <code>TELEGRAM_CHAT_ID</code> ga shuni yozing.`,
    );
    return;
  }

  if (command === "/ping") {
    const configured = config.chatIds.includes(String(chatId));
    await sendMessage(
      chatId,
      [
        "✅ Server ishlayapti.",
        `📬 Bu chat lead ro'yxatida: ${configured ? "ha" : "yo'q"}`,
        `📇 Sozlangan chatlar: ${config.chatIds.length}`,
      ].join("\n"),
    );
  }
}

/** Webhook and polling deliver the same update objects, so both land here. */
export async function handleUpdate(update) {
  try {
    const message = update.message ?? update.channel_post;
    if (message) await handleMessage(message);
  } catch (err) {
    console.error("[bot] update handling failed:", err.message);
  }
}

/**
 * Long polling. Chosen as the default because it needs no public URL, no TLS and
 * no webhook registration — the service works the moment it starts, on a laptop
 * or on a host with no inbound access. Set BOT_POLLING=false when running behind
 * a public URL with a webhook instead; Telegram refuses to serve both at once.
 */
export function startPolling({ signal } = {}) {
  let offset = 0;
  let stopped = false;

  signal?.addEventListener("abort", () => {
    stopped = true;
  });

  (async () => {
    // A webhook left over from an earlier deploy makes getUpdates return 409.
    await callTelegram("deleteWebhook", { drop_pending_updates: false }).catch(() => {});
    console.log("[bot] polling started");

    while (!stopped) {
      try {
        const updates = await callTelegram(
          "getUpdates",
          { offset, timeout: 30, allowed_updates: ["message", "channel_post"] },
          { retries: 0 },
        );

        for (const update of updates ?? []) {
          offset = update.update_id + 1;
          await handleUpdate(update);
        }
      } catch (err) {
        if (stopped) break;
        console.error("[bot] polling error:", err.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    console.log("[bot] polling stopped");
  })();
}
