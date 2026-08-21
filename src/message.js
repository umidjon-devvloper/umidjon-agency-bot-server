/**
 * Turns a lead into the message a person reads on their phone.
 *
 * The shape mirrors what the site's forms send: the contact form gives name and
 * contact, the price calculator adds a budget range and the answers it collected.
 */

/** Telegram's HTML parse mode rejects unescaped &, < and > anywhere in the text. */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Tashkent time — the number is read by a person sitting in that timezone. */
function stamp() {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export function buildLeadMessage(lead) {
  const lines = [
    "🔔 <b>Yangi lead</b>",
    "",
    `👤 <b>Ism:</b> ${esc(lead.name)}`,
    `📞 <b>Aloqa:</b> ${esc(lead.contact)}`,
  ];

  if (lead.email) lines.push(`✉️ <b>Email:</b> ${esc(lead.email)}`);
  if (lead.note) lines.push("", `📝 ${esc(lead.note)}`);

  // The price calculator sends its answers along; a plain object dump would be
  // unreadable on a phone, so each known field gets its own line.
  const meta = lead.metadata ?? {};
  if (meta.priceRange) lines.push("", `💰 <b>Byudjet:</b> ${esc(meta.priceRange)}`);
  if (Array.isArray(meta.summary)) {
    for (const item of meta.summary) {
      if (item && typeof item === "object") {
        const label = item.label ?? item.q ?? item.question ?? "";
        const value = item.value ?? item.a ?? item.answer ?? "";
        lines.push(`• ${esc(label)}: ${esc(value)}`);
      } else {
        lines.push(`• ${esc(item)}`);
      }
    }
  } else if (typeof meta.summary === "string") {
    lines.push("", esc(meta.summary));
  }

  lines.push("", `📍 ${esc(lead.source ?? "Sayt")} · 🌐 ${esc(lead.lang ?? "uz")} · 🕒 ${stamp()}`);

  return lines.join("\n");
}

/**
 * A one-tap reply button when the visitor left a Telegram handle, so answering a
 * lead is a tap instead of copying the handle into the search field. Phone
 * numbers get no button: Telegram inline keyboards only accept http(s) and tg
 * urls, never `tel:`.
 */
export function buildLeadKeyboard(lead) {
  const handle = String(lead.contact ?? "").trim();
  const match = handle.match(/^@?([A-Za-z][A-Za-z0-9_]{4,31})$/);
  if (!match) return undefined;

  return {
    inline_keyboard: [[{ text: "💬 Telegramda javob berish", url: `https://t.me/${match[1]}` }]],
  };
}
