// Save the owner's OpenRouter key for voicing. The model calls it `voice_reply__set_key`.
// The key is checked with OpenRouter first and stored owner-only in the plugin's data; it is
// never returned, so it cannot leak into a reply.
import { defineTool } from "eve/tools";
import { checkKey, KEY_SHAPE, saveKey } from "../lib/voice";

export default defineTool({
  description:
    "Сохранить ключ OpenRouter для озвучки, когда владелец прислал его в чат (sk-or-…). " +
    "Ключ проверяется в OpenRouter и работает сразу, без перезапуска. Никогда не повторяй ключ в ответе. " +
    "Возвращает { ok, remaining_usd } или { ok: false, error }.",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Ключ OpenRouter целиком, sk-or-…" },
    },
    required: ["key"],
    additionalProperties: false,
  },
  async execute(input) {
    const key = String((input as { key?: unknown }).key ?? "").trim();
    if (!KEY_SHAPE.test(key)) return { ok: false, error: "это не похоже на ключ OpenRouter: он начинается с sk-or-" };
    try {
      const checked = await checkKey(key);
      if (!checked.ok) return checked;
      saveKey(key);
      return {
        ok: true,
        remaining_usd: checked.remaining,
        note:
          "Ключ сохранён. Скажи владельцу, что озвучка готова, и посоветуй удалить сообщение с ключом из чата. " +
          "Если владелец хотел бесплатную озвучку — напомни, что режим можно пересмотреть (" +
          "voice_reply__voice engine=local, если установлен локальный движок Silero).",
      };
    } catch (error) {
      return { ok: false, error: `ключ не сохранён: ${error instanceof Error ? error.message : String(error)}` };
    }
  },
});