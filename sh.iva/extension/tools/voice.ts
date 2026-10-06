// Choose the default voice. The model calls it `voice_reply__voice`.
// Without `set`: one sample per voice, each with a "pick this" button (the tap comes back as
// the owner's message "Голос <id>"). With `set`: save it and confirm in that voice.
import { defineTool } from "eve/tools";
import { DONE_NOTE, chatOf, currentVoice, isVoice, saveVoice, say, VOICES } from "../lib/voice";

const SAMPLE = "Привет! Я Ива. Если тебе нравится, как я звучу, выбери этот голос.";

export default defineTool({
  description:
    "Голос озвучки. Без set — прислать образцы всех голосов с кнопками выбора (на «смени голос», " +
    "«какие есть голоса»). set — сделать голос постоянным (на «Голос eve», «поставь голос erinome»). " +
    "Возвращает { ok, current, note } или { ok: false, error }.",
  inputSchema: {
    type: "object",
    properties: {
      set: { type: "string", enum: Object.keys(VOICES), description: "Голос, который сделать постоянным" },
    },
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const chat = chatOf(ctx);
    if (!chat) return { ok: false, error: "нет чата для отправки" };
    const signal = (ctx as { abortSignal?: AbortSignal })?.abortSignal;
    const set = (input as { set?: unknown }).set;

    if (isVoice(set)) {
      saveVoice(set);
      const sent = await say(chat, "Готово, теперь я буду озвучивать ответы этим голосом.", set,
        { caption: `✅ Голос по умолчанию: ${set} — ${VOICES[set]}` }, signal);
      return sent.ok ? { ok: true, current: set, note: DONE_NOTE } : sent;
    }

    const current = currentVoice();
    for (const [id, about] of Object.entries(VOICES)) {
      const mark = id === current ? " (сейчас)" : "";
      const sent = await say(chat, SAMPLE, id, {
        caption: `${id} — ${about}${mark}`,
        replyMarkup: { inline_keyboard: [[{ text: `Выбрать ${id}`, callback_data: `Голос ${id}` }]] },
      }, signal);
      if (!sent.ok) return sent;
    }
    return { ok: true, current, note: DONE_NOTE };
  },
});
