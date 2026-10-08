// Shared by the tools. Two engines:
// - Cloud: OpenRouter TTS (mp3/pcm) -> ffmpeg -> ogg/opus -> Telegram sendVoice (a paid key).
// - Local: Silero TTS v5 through tts_silero.py (stdin -> ogg/opus, no key, free).
// The per-voice catalog lives in catalog.ts; this file owns resolution, engines and the pipelines.
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CLOUD, DEFAULT_LOCAL, LOCAL_SHOWCASE, CLOUD_SHOWCASE, VOICE_CATALOG } from "./catalog.ts";
import type { Engine, VoiceEntry } from "./catalog.ts";

export { VOICE_CATALOG, CLOUD_SHOWCASE, LOCAL_SHOWCASE, DEFAULT_LOCAL, DEFAULT_CLOUD };
export type { Engine, VoiceEntry };

const byId = (id: string) => VOICE_CATALOG.find((v) => v.id === id);
export const isVoice = (id: unknown): id is string => typeof id === "string" && byId(id) !== undefined;

// A bare legacy id ("eve") goes to that voice on the setup's engine when it exists there
// (eve is Cloud-only, zinaida is Local-only); otherwise the setup's default voice.
export function resolveVoice(id: string): string | null {
  const clean = String(id ?? "").trim();
  const direct = byId(clean);
  if (direct) return direct.id;
  if (!clean) return null;
  const bare = clean.replace(/\.(cloud|local)$/, "").trim().toLowerCase();
  if (!bare) return null;
  const wanted = VOICE_CATALOG.find((v) => v.id === `${bare}.${currentEngine()}`);
  if (wanted) return wanted.id;
  const anywhere = VOICE_CATALOG.find((v) => v.bare === bare);
  // an unknown or engine-missing name is not a voice: the caller answers with the list
  return anywhere ? (anywhere.engine === "local" ? DEFAULT_LOCAL : DEFAULT_CLOUD) : null;
}

export const voiceOf = (id: string): VoiceEntry => byId(resolveVoice(id) ?? DEFAULT_CLOUD)!;

const withTimeout = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000);

export type Chat = { id: string; threadId: string | null };
export type Sent = { ok: true; seconds: number | null } | { ok: false; error: string };

// The plugin's own data: data/plugin-data/voice-reply/. Survives plugin and Iva updates;
// the Silero engine itself lives here too (bin/tts_silero.py), so a plugin version bump
// never orphans it.
const dataDir = () => join(process.env.ASSISTANT_DATA_DIR || "data", "plugin-data", "voice-reply");
const dataFile = (name: string) => join(dataDir(), name);
const voiceFile = () => dataFile("voice");
const engineFile = () => dataFile("engine");
const keyFile = () => dataFile("openrouter.key");

// Paths of the local engine; every part is overridable. Read on every call: a late install
// unlocks Local without a rebuild or a restart.
export function localPaths(): { py: string; script: string; model: string } {
  return {
    py: process.env.SILERO_PYTHON || "/home/lnsrtw/tts/venv/bin/python",
    script: process.env.SILERO_SCRIPT || join(dataDir(), "bin", "tts_silero.py"),
    model: process.env.SILERO_MODEL || "/home/lnsrtw/tts/v5_cis_base.pt",
  };
}

// Is the local engine present? Read on every call: a late install unlocks it without a rebuild.
export function localReady(): boolean {
  const { py, script, model } = localPaths();
  return existsSync(py) && existsSync(script) && existsSync(model);
}

// Which engine this installation runs: the saved choice or, before the first choice,
// whatever is actually ready — local when the Silero engine is present, cloud otherwise.
export function currentEngine(): Engine {
  try {
    const saved = readFileSync(engineFile(), "utf8").trim();
    if (saved === "local") return localReady() ? "local" : "cloud";
    if (saved === "cloud") return "cloud";
  } catch {
    /* nothing chosen yet */
  }
  return localReady() ? "local" : "cloud";
}

// One-time choice of the engine ("платный" / "бесплатный" at install). Does not touch the
// saved voice: the voice picker runs right after and saves a voice of that engine.
export function saveEngine(engine: Engine): void {
  const file = engineFile();
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, engine + "\n");
}

export function currentVoice(): string {
  try {
    const saved = readFileSync(voiceFile(), "utf8").trim();
    if (saved && isVoice(saved)) return saved;
  } catch {
    /* nothing chosen yet */
  }
  const env = (process.env.VOICE_REPLY_VOICE ?? "").trim();
  if (env) {
    const resolved = resolveVoice(env);
    if (resolved) return resolved;
  }
  return currentEngine() === "local" ? DEFAULT_LOCAL : DEFAULT_CLOUD;
}

export function saveVoice(voice: string): void {
  const file = voiceFile();
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, voice + "\n");
}

// The key from .env wins; otherwise the one Iva saved with voice_reply__set_key. Read on every
// call, so a saved key works at once, with no restart.
export function openrouterKey(): string {
  const env = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (env) return env;
  try {
    return readFileSync(keyFile(), "utf8").trim();
  } catch {
    return "";
  }
}

// A Local engine needs no key, so an empty one is not an error for it; the callers check per engine.
export const NO_KEY =
  "нет ключа OpenRouter. Попроси владельца прислать ключ (sk-or-…, openrouter.ai/keys) и сохрани его " +
  "voice_reply__set_key — он заработает сразу, без перезапуска. Или выбери бесплатный локальный движок.";

export const KEY_SHAPE = /^sk-or-[A-Za-z0-9_-]{20,200}$/;

// Ask OpenRouter about the key before keeping it: a typo must not look like a working setup.
export async function checkKey(key: string): Promise<{ ok: true; remaining: number | null } | { ok: false; error: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${key}` },
    signal: withTimeout(),
  });
  if (res.status === 401) return { ok: false, error: "OpenRouter не принял ключ (401): проверь, что он скопирован целиком" };
  if (!res.ok) return { ok: false, error: `OpenRouter ${res.status}: ключ не проверен, попробуй позже` };
  const data = ((await res.json().catch(() => null)) as { data?: { limit_remaining?: unknown } } | null)?.data;
  return { ok: true, remaining: typeof data?.limit_remaining === "number" ? data.limit_remaining : null };
}

// Owner-only file: the key is a credential.
export function saveKey(key: string): void {
  const file = keyFile();
  mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
  writeFileSync(file, key + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
}

// Same place the core send_file reads the chat from; a chatless (background) turn goes to the owner.
export function chatOf(ctx: unknown): Chat | null {
  const attrs = (ctx as { session?: { auth?: { current?: { attributes?: unknown } | null } } })
    ?.session?.auth?.current?.attributes as Record<string, unknown> | undefined;
  const id = attrs?.chat_id;
  if (typeof id !== "string" || !id.trim()) {
    const owner = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",")[0]?.trim();
    return owner ? { id: owner, threadId: null } : null;
  }
  const thread = attrs?.message_thread_id;
  return { id, threadId: typeof thread === "string" && thread ? thread : null };
}

// The model's reply after a voice message: Iva strips this line, nothing is left to send,
// and eve still gets a non-empty answer (an empty one fails the turn).
export const SILENT = "<!-- iva:silent -->";
export const DONE_NOTE =
  `Голосовое уже в чате. Твой финальный ответ — ровно строка ${SILENT} и ничего больше: ` +
  "она не отправляется. Никакого текста, эмодзи и кнопок.";

// Attach «🔊 Озвучить» under the reply Iva has just delivered. The core drops the reply's
// message_id, but in a chat ids grow one by one: the reply sits a few ids above the owner's
// message. Walk down from the top: "not found" means no message there yet; the first bot
// message that takes the button is the reply's last chunk. Any other error (a user's message,
// a reply that cannot be edited) stops the walk, so the button never lands on an older message.
// ponytail: guessed ids; upgrade to the real message_id if the core ever exposes it.
const LOOKAHEAD = 15;
const SPEAK_MARKUP = { inline_keyboard: [[{ text: "🔊 Озвучить", callback_data: "Озвучь" }]] };

export async function attachSpeakButton(chatId: string, afterMessageId: number): Promise<number | null> {
  for (let id = afterMessageId + LOOKAHEAD; id > afterMessageId; id--) {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: id, reply_markup: SPEAK_MARKUP }),
      signal: withTimeout(),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (body?.ok) return id;
    if (!/not found/i.test(body?.description ?? "")) return null;
  }
  return null;
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

async function ttsCloud(text: string, id: string, signal?: AbortSignal): Promise<Buffer> {
  const v = voiceOf(id);
  const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: v.model, input: text, voice: v.wire, response_format: v.format }),
    signal: withTimeout(signal),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

// Silero on the server: plain text in, ogg/opus out (ffmpeg inside tts_silero.py).
function ttsLocal(text: string, id: string): Promise<Buffer> {
  const { py, script } = localPaths();
  const speaker = voiceOf(id).speaker ?? "ru_zinaida";
  const rate = process.env.SILERO_RATE || "48000";
  return new Promise((resolve, reject) => {
    const proc = spawn(py, [script, "--speaker", speaker, "--rate", rate], { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => (err += c));
    proc.on("error", (e: NodeJS.ErrnoException) =>
      reject(e.code === "ENOENT" ? new Error(`локальный движок не найден: ${py}`) : e),
    );
    proc.on("close", (code) => {
      const clean = err
        .replace(/<torch_package_\d+>\.[^\n]*\n/g, "")
        .replace(/SyntaxWarning[^\n]*\n/g, "")
        .trim();
      if (code === 0 && !clean) {
        resolve(Buffer.concat(out));
        return;
      }
      reject(new Error(`Silero: ${clean.slice(0, 300) || `код ${code}, пустой вывод`}`));
    });
    proc.stdin.end(text, "utf8");
  });
}

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
    ff.on("error", (e: NodeJS.ErrnoException) =>
      reject(e.code === "ENOENT" ? new Error("на сервере нет ffmpeg: владелец ставит его сам (sudo apt install ffmpeg)") : e),
    );
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
  if (voiceOf(voice).engine === "cloud") {
    if (!openrouterKey()) return { ok: false, error: NO_KEY };
    try {
      return await postVoice(
        chat,
        await toOpus(await ttsCloud(text, voice, signal), voiceOf(voice).format === "pcm"),
        extra,
        signal,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let masked = message;
      for (const secret of [process.env.TELEGRAM_BOT_TOKEN, openrouterKey()])
        if (secret) masked = masked.replaceAll(secret, "***");
      return { ok: false, error: masked };
    }
  }
  if (!localReady())
    return {
      ok: false,
      error:
        "локальный движок Silero на этом сервере не установлен (нужен " +
        `${localPaths().py} и ${localPaths().script}). Поставь Silero TTS v5 или выбери облачный (платный) режим.`,
    };
  try {
    return await postVoice(chat, await ttsLocal(text, voice), extra, signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
    return { ok: false, error: token ? message.replaceAll(token, "***") : message };
  }
}