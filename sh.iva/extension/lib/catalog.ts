// The catalog both tools share: ids, descriptions, engine. One place to add a voice.
// The full id is "<bare>.<engine>" — it pins both the voice and the engine.
export type Engine = "cloud" | "local";
export type VoiceEntry = { id: string; bare: string; engine: Engine; about: string; model?: string; wire?: string; format?: "mp3" | "pcm"; speaker?: string; spkModel?: string };
export const VOICE_CATALOG: VoiceEntry[] = [
  // Cloud (OpenRouter; a key is billed).
  { id: "eve.cloud", bare: "eve", engine: "cloud", about: "женский, бодрый, британский акцент (платный)", model: "x-ai/grok-voice-tts-1.0", wire: "eve", format: "mp3" },
  { id: "erinome.cloud", bare: "erinome", engine: "cloud", about: "женский, чёткий (платный)", model: "google/gemini-3.8-flash-tts", wire: "Erinome", format: "pcm" },
  { id: "charon.cloud", bare: "charon", engine: "cloud", about: "мужской, информативный (платный)", model: "google/gemini-3.8-flash-tts", wire: "Charon", format: "pcm" },
  { id: "iapetus.cloud", bare: "iapetus", engine: "cloud", about: "мужской, чёткий (платный)", model: "google/gemini-3.8-flash-tts", wire: "Iapetus", format: "pcm" },
  // Local (Silero v5.5 on this server; free, ~7× faster than real time).
  // All local voices live in the v5.5 model (/home/lnsrtw/tts/v5_5_ru.pt); v5 is retired.
  { id: "kseniya.local", bare: "kseniya", engine: "local", about: "женский (локальный, бесплатный)", speaker: "kseniya", spkModel: "/home/lnsrtw/tts/v5_5_ru.pt" },
  { id: "xenia.local", bare: "xenia", engine: "local", about: "женский, мягкий (локальный, бесплатный)", speaker: "xenia", spkModel: "/home/lnsrtw/tts/v5_5_ru.pt" },
  { id: "eugene.local", bare: "eugene", engine: "local", about: "мужской (локальный, бесплатный)", speaker: "eugene", spkModel: "/home/lnsrtw/tts/v5_5_ru.pt" },
  { id: "aidar.local", bare: "aidar", engine: "local", about: "мужской (локальный, бесплатный)", speaker: "aidar", spkModel: "/home/lnsrtw/tts/v5_5_ru.pt" },
  { id: "baya.local", bare: "baya", engine: "local", about: "женский (локальный, бесплатный)", speaker: "baya", spkModel: "/home/lnsrtw/tts/v5_5_ru.pt" },
];
// What a new setup auditions when the owner picks "платно" or "бесплатно".
export const CLOUD_SHOWCASE = ["eve.cloud", "erinome.cloud", "charon.cloud", "iapetus.cloud"];
export const LOCAL_SHOWCASE = ["kseniya.local", "eugene.local", "xenia.local"];
export const DEFAULT_CLOUD = "eve.cloud";
export const DEFAULT_LOCAL = "kseniya.local";