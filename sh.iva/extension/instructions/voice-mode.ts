// Dynamic instruction: tells the model which reply mode (text/voice) is active in
// this turn. The mode file is written by hooks/mode-watcher.ts from the owner's
// phrases; reading it each turn makes the switch instant, with no restart.
import { defineDynamic, defineInstructions } from "eve/instructions";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dataDir = () => join(process.env.ASSISTANT_DATA_DIR || "data", "plugin-data", "voice-reply");

function mode(): "voice" | "text" {
  try {
    const saved = readFileSync(join(dataDir(), "mode"), "utf8").trim().toLowerCase();
    if (saved === "voice" || saved === "text") return saved;
  } catch {
    /* no file yet — default mode */
  }
  return "text";
}

const VOICE_MD = `## Голосовой режим (включён владельцем)
Сейчас активен ГОЛОСОВОЙ режим ответов: каждый финальный ответ отправляй через voice_reply__speak — разговорный пересказ без таблиц, ссылок и разметки, длиннее ~5500 знаков дели на 2–3 голосовых подряд — и завершай финальный ответ ровно строкой <!-- iva:silent -->. Текст вместо голоса только в двух случаях: владелец в том же сообщении попросил текст, или написал «Сделай ответ текстом».`;

const TEXT_MD = `## Режим ответов: текст
Сейчас активен ТЕКСТОВЫЙ режим (по умолчанию): отвечай обычным текстом, кнопка «Озвучить» под длинными ответами ставится кодом автоматически. Голосовое — только по явной разовой просьбе («озвучь», «прочитай вслух», «скажи голосом»). «Озвучь» / «Голос …» / «Смени голос» режима не меняют.`;

export default defineDynamic({
  events: {
    // turn.started — re-read each turn: a toggle must apply from the very next reply.
    "turn.started": () =>
      defineInstructions({ content: mode() === "voice" ? VOICE_MD : TEXT_MD, role: "user" }),
  },
});
