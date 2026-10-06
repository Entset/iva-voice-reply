// Voice a reply into the chat of the turn. The model calls it `voice_reply__speak`.
import { defineTool } from "eve/tools";
import { chatOf, currentVoice, isVoice, say, speakable, VOICES } from "../lib/voice";

// ponytail: hard cap instead of chunking; ~10 min of speech, guards the balance.
const MAX_CHARS = 8000;
const DONE = "Голосовое уже в чате. Заверши ход пустым ответом: без текста, эмодзи и кнопок.";

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
      voice: { type: "string", enum: Object.keys(VOICES), description: "Разовый голос" },
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
    const voice = isVoice(asked) ? asked : currentVoice();
    const signal = (ctx as { abortSignal?: AbortSignal })?.abortSignal;
    const sent = await say(chat, text, voice, {}, signal);
    return sent.ok ? { ...sent, note: DONE } : sent;
  },
});
