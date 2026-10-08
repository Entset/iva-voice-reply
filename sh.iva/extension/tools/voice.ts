// Default voice (and, at install, the paid/free engine choice). The model calls it
// `voice_reply__voice`. Without args: samples of the voices this setup's engine offers, each
// with a "pick this" button (the tap comes back as the owner's message "Голос <id>").
// set — make the voice permanent ("Голос <id>", «поставь голос <id>»).
// engine — the one-time paid/free choice at install ("платный" → cloud, "бесплатный" → local).
import { defineTool } from "eve/tools";
import {
  CLOUD_SHOWCASE,
  DONE_NOTE,
  LOCAL_SHOWCASE,
  chatOf,
  currentEngine,
  currentVoice,
  localReady,
  openrouterKey,
  resolveVoice,
  saveEngine,
  saveVoice,
  say,
  VOICE_CATALOG,
} from "../lib/voice";

const SAMPLE = "Привет! Я Ива. Если тебе нравится, как я звучу, выбери этот голос.";
const aboutOf = (id: string) => VOICE_CATALOG.find((v) => v.id === id)?.about ?? id;

export default defineTool({
  description:
    "Голос озвучки. Без аргументов — прислать образцы доступных голосов с кнопками выбора " +
    "(на «смени голос», «какие есть голоса»). set — сделать голос постоянным " +
    "(на «Голос <id>», «поставь голос <id>»). engine — выбрать режим установки: «cloud» (платный, " +
    "OpenRouter) или «local» (бесплатный, Silero на сервере) — на слова владельца «платный/бесплатный режим озвучки»." +
    "Возвращает { ok, current, engine?, note } или { ok: false, error }.",
  inputSchema: {
    type: "object",
    properties: {
      set: { type: "string", enum: VOICE_CATALOG.map((v) => v.id), description: "Голос, который сделать постоянным" },
      engine: { type: "string", enum: ["cloud", "local"], description: "Режим установки: cloud (платный, OpenRouter) или local (бесплатный, Silero)" },
    },
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const chat = chatOf(ctx);
    if (!chat) return { ok: false, error: "нет чата для отправки" };
    const signal = (ctx as { abortSignal?: AbortSignal })?.abortSignal;
    const { set, engine } = input as { set?: unknown; engine?: unknown };

    // One-time engine choice at install: "платный" / "бесплатный" lands here.
    if (engine === "cloud" || engine === "local") {
      if (engine === "local" && !localReady())
        return {
          ok: false,
          error:
            "локальный движок Silero на этом сервере не установлен — бесплатный режим пока недоступен. " +
            "Скажи владельцу, что нужно установить Silero TTS v5, или предложи облачный (платный) режим.",
        };
      if (engine === "cloud" && !openrouterKey())
        return {
          ok: false,
          error:
            "для платного режима нет ключа OpenRouter. Попроси владельца прислать ключ (sk-or-…) и сохрани его voice_reply__set_key.",
        };
      saveEngine(engine);
      for (const id of engine === "local" ? LOCAL_SHOWCASE : CLOUD_SHOWCASE) {
        const sent = await say(chat, SAMPLE, id, {
          caption: `${id.split(".")[0]} — ${aboutOf(id)}`,
          replyMarkup: { inline_keyboard: [[{ text: `Выбрать ${id.split(".")[0]}`, callback_data: `Голос ${id}` }]] },
        }, signal);
        if (!sent.ok) return sent;
      }
      return {
        ok: true,
        engine,
        current: currentVoice(),
        note:
          DONE_NOTE +
          " После тапа владельца по кнопке выбери голос: вызови этот инструмент с set=<id>. " +
          "Если владелец не выбрал — напомни один раз.",
      };
    }

    if (set !== undefined) {
      const resolved = resolveVoice(String(set));
      if (!resolved)
        return {
          ok: false,
          error: `нет такого голоса: «${String(set)}». Скажи «какие есть голоса», чтобы услышать образцы.`,
        };
      saveVoice(resolved);
      const sent = await say(chat, "Готово, теперь я буду озвучивать ответы этим голосом.", resolved,
        { caption: `✅ Голос по умолчанию: ${resolved.split(".")[0]} — ${aboutOf(resolved)}` },
        signal);
      return sent.ok ? { ok: true, current: resolved, engine: currentEngine(), note: DONE_NOTE } : sent;
    }

    // Samples of the voices for this setup's engine (local if chosen and ready, else cloud).
    const showcase = currentEngine() === "local" ? LOCAL_SHOWCASE : CLOUD_SHOWCASE;
    const current = currentVoice();
    for (const id of showcase) {
      const mark = id === current ? " (сейчас)" : "";
      const sent = await say(chat, SAMPLE, id, {
        caption: `${id.split(".")[0]} — ${aboutOf(id)}${mark}`,
        replyMarkup: { inline_keyboard: [[{ text: `Выбрать ${id.split(".")[0]}`, callback_data: `Голос ${id}` }]] },
      }, signal);
      if (!sent.ok) return sent;
    }
    return {
      ok: true,
      current,
      engine: currentEngine(),
      note:
        DONE_NOTE +
        " Владелец выберет голос тапом по кнопке; после тапа вызови этот инструмент с set=<id> из callback-сообщения.",
    };
  },
});