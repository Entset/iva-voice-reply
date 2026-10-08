// Voice a reply into the chat of the turn. The model calls it `voice_reply__speak`.
import { defineTool } from "eve/tools";
import { DONE_NOTE, chatOf, currentVoice, localReady, resolveVoice, say, speakable, VOICE_CATALOG } from "../lib/voice";

// ponytail: hard cap instead of chunking; ~10 min of speech, guards the balance.
const MAX_CHARS = 8000;

export default defineTool({
  description:
    "Озвучить текст голосом и прислать голосовым сообщением в текущий чат. " +
    "text — то, что нужно произнести: разговорная версия ответа, без таблиц, ссылок и разметки. " +
    "voice — только если владелец просит голос разово; постоянный голос меняет voice_reply__voice. " +
    "Возвращает { ok, seconds, note } или { ok: false, error }.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Текст для озвучки" },
      voice: {
        type: "string",
        enum: VOICE_CATALOG.map((v) => v.id),
        description: "Разовый голос (id вида zinaida.local или eve.cloud). Только если владелец явно просит другой голос",
      },
    },
    required: ["text"],
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const { text: raw, voice: asked } = input as { text?: unknown; voice?: unknown };
    const text = speakable(String(raw ?? ""));
    if (!text) return { ok: false, error: "пустой текст" };
    if (text.length > MAX_CHARS)
      return { ok: false, error: `текст ${text.length} знаков, предел ${MAX_CHARS}: сократи пересказ` };
    const chat = chatOf(ctx);
    if (!chat) return { ok: false, error: "нет чата для отправки" };
    const voice = asked ? resolveVoice(String(asked)) : currentVoice();
    if (!voice) {
      const list = localReady()
        ? VOICE_CATALOG.map((v) => v.id).join(", ")
        : VOICE_CATALOG.filter((v) => v.engine === "cloud").map((v) => v.id).join(", ") +
          " (локальный движок не установлен)";
      return { ok: false, error: `неизвестный голос «${String(asked)}». Доступные: ${list}` };
    }
    const signal = (ctx as { abortSignal?: AbortSignal })?.abortSignal;
    const sent = await say(chat, text, voice, {}, signal);
    return sent.ok ? { ...sent, note: DONE_NOTE } : sent;
  },
});