// «🔊 Озвучить» under every long final reply in a Telegram chat, inside the reply itself.
// Code, not the model, puts it there: a rule the model must remember is skipped too often.
import { defineHook } from "eve/hooks";
import { attachSpeakButton, SILENT } from "../lib/voice";

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
        // The model's own buttons would be replaced by ours: leave such replies alone.
        if (text.length < MIN_CHARS || text.includes("<tg-button")) return;
        const attrs = (ctx as { session?: { auth?: { current?: { attributes?: unknown } | null } } })
          .session?.auth?.current?.attributes as Record<string, unknown> | undefined;
        const chatId = attrs?.chat_id;
        const after = Number(attrs?.message_id);
        if ((typeof chatId !== "string" && typeof chatId !== "number") || !Number.isInteger(after)) return;
        await attachSpeakButton(String(chatId), after);
      } catch (error) {
        console.error("[voice-reply] button not attached:", error instanceof Error ? error.message : error);
      }
    },
  },
});
