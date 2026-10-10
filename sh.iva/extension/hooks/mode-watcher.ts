// Voice mode toggle: watch the owner's messages for "answer by voice" / "answer in
// text" and persist the choice in the plugin's data. The instruction file under
// extension/instructions/ reads that file every turn, so a switch applies to the very
// next reply — no restart. One-off phrases («Озвучь…», «Сделай ответ текстом») never
// flip the mode: the negative lookahead keeps "ответ текстом" out of the text match.
import { defineHook } from "eve/hooks";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VOICE_RE =
  /(?:отвечай|ответы?|пиши|пишешь|говори|говоришь|озвучивай)\s+(?:со\s+мной\s+|мне\s+)?(?:только\s+)?(?:голосом|голосов[аы]|войсом)|(?:весь|всё)\s+текст\s+(?:озвучивай|голосом)|перейди\s+на\s+(?:голос|голосовые?)(?:\s+сообщения)?|включи\s+(?:голосовой\s+)?режим/i;
const TEXT_RE =
  /(?:пиши|пишешь|отвечай|(?<!сделай\s|дай\s)ответы?)\s+(?:мне\s+)?(?:только\s+)?текст[омы]*|скажи\s+текстом|(?:выключи|отключи|останови|хватит)\s+(?:голосов[аы]|голосовой\s+режим|голосовые?(?:\s+сообщения)?)/i;

const dataDir = () => join(process.env.ASSISTANT_DATA_DIR || "data", "plugin-data", "voice-reply");
const modeFile = () => join(dataDir(), "mode");

export function currentMode(): "voice" | "text" {
  try {
    const saved = readFileSync(modeFile(), "utf8").trim().toLowerCase();
    if (saved === "voice" || saved === "text") return saved;
  } catch {
    /* no file yet — default mode */
  }
  return "text";
}

export default defineHook({
  events: {
    async "message.received"(event) {
      try {
        const data = (event as { data?: { text?: unknown; message?: unknown } }).data;
        const text = data?.text ?? data?.message;
        if (typeof text !== "string") return;
        const voice = VOICE_RE.test(text);
        const saidText = TEXT_RE.test(text);
        if (voice === saidText) return; // neither or both patterns — no reliable signal
        const next = voice ? "voice" : "text";
        if (currentMode() === next) return;
        mkdirSync(dataDir(), { recursive: true });
        writeFileSync(modeFile(), next + "\n");
      } catch (error) {
        console.error("[voice-reply] mode watcher:", error instanceof Error ? error.message : error);
      }
    },
  },
});
