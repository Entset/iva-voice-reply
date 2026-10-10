// Run: node --test test/*.test.ts
// The phrase watcher: "answer by voice" switches to voice mode, "write in text" back to text.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// The hook itself needs the eve runtime: read the patterns out of the source instead.
// This guards the phrases; keep them in sync with hooks/mode-watcher.ts.
const src = readFileSync(new URL("../sh.iva/extension/hooks/mode-watcher.ts", import.meta.url), "utf8");
const VOICE_RE = eval(src.match(/const VOICE_RE =\s*([\s\S]*?);\n/)?.[1] ?? "(() => /(?:^|$)/)");
const TEXT_RE = eval(src.match(/const TEXT_RE =\s*([\s\S]*?);\n/)?.[1] ?? "(() => /(?:^|$)/)");

test("voice phrases flip to voice mode", () => {
  for (const t of [
    "Отвечай мне голосом",
    "Отвечай голосовыми",
    "говори со мной голосом",
    "весь текст озвучивай",
    "Перейди на голосовые сообщения",
    "Пиши мне войсом",
  ]) assert.ok(VOICE_RE.test(t), t);
});
test("text phrases flip back to text", () => {
  for (const t of [
    "Пиши мне текстом",
    "Отвечай текстом",
    "выключи голосовой режим",
    "Хватит голосовых",
  ]) assert.ok(TEXT_RE.test(t), t);
});
test("one-off requests do NOT flip the mode", () => {
  for (const t of [
    "Озвучь",
    "Озвучь это сообщение",
    "Сделай ответ текстом",
    "какие есть голоса",
    "поставь голос eve",
  ]) {
    assert.equal(VOICE_RE.test(t), false, `voice matched: ${t}`);
    assert.equal(TEXT_RE.test(t), false, `text matched: ${t}`);
  }
});
