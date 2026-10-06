// A 🔊 button under every long final reply in a Telegram chat. Code, not the model, puts it
// there: a rule the model must remember is skipped often enough to be useless.
import { defineHook } from "eve/hooks";
import { chatOf, sendSpeakButton, SILENT } from "../lib/voice";

// ponytail: fixed threshold; make it a setting if someone wants it tuned.
const MIN_CHARS = 600;

export default defineHook({
  events: {
    async "message.completed"(event, ctx) {
      // A throwing hook fails the turn: the button is never worth that.
      try {
        const data = (event as { data?: { message?: unknown; finishReason?: unknown } }).data;
        if (data?.finishReason !== "stop" || typeof data.message !== "string") return;
        const text = data.message.replace(SILENT, "").trim();
        if (text.length < MIN_CHARS || text.includes('data="Озвучь"')) return;
        const chat = chatOf(ctx, false);
        if (chat) await sendSpeakButton(chat);
      } catch (error) {
        console.error("[voice-reply] button not sent:", error instanceof Error ? error.message : error);
      }
    },
  },
});
