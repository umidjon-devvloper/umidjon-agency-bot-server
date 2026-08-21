import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../data/leads.jsonl");

/**
 * Every lead is appended to a local file before delivery is attempted.
 *
 * The site's database is the system of record; this log exists for the case the
 * database write and the Telegram send both fail, or someone deletes a message
 * from the chat. One line per lead, so `tail -f` is a usable admin panel and a
 * partial write can never corrupt the earlier entries.
 */
export async function recordLead(lead) {
  try {
    await mkdir(dirname(FILE), { recursive: true });
    await appendFile(
      FILE,
      JSON.stringify({ ...lead, receivedAt: new Date().toISOString() }) + "\n",
    );
  } catch (err) {
    // Never fatal: a read-only or ephemeral filesystem (most PaaS containers)
    // must not stop the lead from reaching the phone.
    console.error("[store] could not record lead:", err.message);
  }
}
