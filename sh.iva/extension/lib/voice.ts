// Shared by the tools: TTS (OpenRouter, mp3) -> ffmpeg -> ogg/opus -> Telegram sendVoice,
// plus the owner's chosen voice. Telegram shows a voice bubble only for ogg/opus.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// id -> what OpenRouter needs. Gemini answers only raw pcm (24 kHz, 16-bit, mono).
type Voice = { about: string; model: string; voice: string; format: "mp3" | "pcm" };
const VOICE_LIST: Record<string, Voice> = {
  eve: { about: "женский, бодрый, британский акцент", model: "x-ai/grok-voice-tts-1.0", voice: "eve", format: "mp3" },
  kore: { about: "женский, твёрдый", model: "google/gemini-3.8-flash-tts", voice: "Kore", format: "pcm" },
  charon: { about: "мужской, информативный", model: "google/gemini-3.8-flash-tts", voice: "Charon", format: "pcm" },
  iapetus: { about: "мужской, чёткий", model: "google/gemini-3.8-flash-tts", voice: "Iapetus", format: "pcm" },
};
export const DEFAULT_VOICE = "eve";
export const VOICES: Record<string, string> = Object.fromEntries(
  Object.entries(VOICE_LIST).map(([id, v]) => [id, v.about]),
);

// Own keys only: `in` would also accept "constructor", "toString" and the like.
export const isVoice = (id: unknown): id is string => typeof id === "string" && Object.hasOwn(VOICE_LIST, id);
const voiceOf = (id: string) => VOICE_LIST[isVoice(id) ? id : DEFAULT_VOICE];
// A stuck provider must not hang the turn.
const withTimeout = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000);

export type Chat = { id: string; threadId: string | null };
export type Sent = { ok: true; seconds: number | null } | { ok: false; error: string };

// The choice lives in data/plugin-data/voice-reply/: survives plugin updates and `iva update`.
const voiceFile = () =>
  join(process.env.ASSISTANT_DATA_DIR || "data", "plugin-data", "voice-reply", "voice");

export function currentVoice(): string {
  try {
    const saved = readFileSync(voiceFile(), "utf8").trim();
    if (isVoice(saved)) return saved;
  } catch {
    /* nothing chosen yet */
  }
  const env = process.env.VOICE_REPLY_VOICE ?? "";
  return isVoice(env) ? env : DEFAULT_VOICE;
}

export function saveVoice(voice: string): void {
  const file = voiceFile();
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, voice + "\n");
}

// Same place the core send_file reads the chat from.
export function chatOf(ctx: unknown): Chat | null {
  const attrs = (ctx as { session?: { auth?: { current?: { attributes?: unknown } | null } } })
    ?.session?.auth?.current?.attributes as Record<string, unknown> | undefined;
  const id = attrs?.chat_id;
  if (typeof id !== "string" || !id.trim()) {
    const fallback = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",")[0]?.trim();
    return fallback ? { id: fallback, threadId: null } : null;
  }
  const thread = attrs?.message_thread_id;
  return { id, threadId: typeof thread === "string" && thread ? thread : null };
}

// Markup read aloud is noise: tags, markdown marks, bare links.
export function speakable(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>|~]+/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

async function tts(text: string, id: string, signal?: AbortSignal): Promise<Buffer> {
  const v = voiceOf(id);
  const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: v.model, input: text, voice: v.voice, response_format: v.format }),
    signal: withTimeout(signal),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

const isPcm = (id: string) => voiceOf(id).format === "pcm";

function toOpus(audio: Buffer, pcm: boolean): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-loglevel", "error", ...(pcm ? ["-f", "s16le", "-ar", "24000", "-ac", "1"] : []), "-i", "pipe:0",
      "-c:a", "libopus", "-b:a", "48k", "-ar", "48000", "-ac", "1", "-f", "ogg", "pipe:1",
    ]);
    const out: Buffer[] = [];
    let err = "";
    ff.stdout.on("data", (c: Buffer) => out.push(c));
    ff.stderr.on("data", (c: Buffer) => (err += c));
    ff.on("error", reject);
    ff.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err.slice(0, 300)}`)),
    );
    ff.stdin.end(audio);
  });
}

async function postVoice(
  chat: Chat,
  ogg: Buffer,
  extra: { caption?: string; replyMarkup?: unknown },
  signal?: AbortSignal,
): Promise<Sent> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const form = new FormData();
  form.append("chat_id", chat.id);
  if (chat.threadId) form.append("message_thread_id", chat.threadId);
  if (extra.caption) form.append("caption", extra.caption);
  if (extra.replyMarkup) form.append("reply_markup", JSON.stringify(extra.replyMarkup));
  form.append("voice", new File([new Uint8Array(ogg)], "voice.ogg", { type: "audio/ogg" }));
  const res = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
    method: "POST",
    body: form,
    signal: withTimeout(signal),
  });
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; description?: string; result?: { voice?: { duration?: number } } }
    | null;
  if (body?.ok !== true) return { ok: false, error: `Telegram: ${body?.description ?? res.status}` };
  return { ok: true, seconds: body.result?.voice?.duration ?? null };
}

// The whole path for one message; errors come back as { ok: false } with the token masked.
export async function say(
  chat: Chat,
  text: string,
  voice: string,
  extra: { caption?: string; replyMarkup?: unknown } = {},
  signal?: AbortSignal,
): Promise<Sent> {
  if (!process.env.OPENROUTER_API_KEY) return { ok: false, error: "не задан OPENROUTER_API_KEY в .env" };
  try {
    return await postVoice(chat, await toOpus(await tts(text, voice, signal), isPcm(voice)), extra, signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let masked = message;
    for (const secret of [process.env.TELEGRAM_BOT_TOKEN, process.env.OPENROUTER_API_KEY])
      if (secret) masked = masked.replaceAll(secret, "***");
    return { ok: false, error: masked };
  }
}
