// Run: node --test test/*.test.ts   (Node 22.6+ strips the types itself)
import assert from "node:assert/strict";
import { test } from "node:test";
import { isVoice, resolveVoice, speakable } from "../sh.iva/extension/lib/voice.ts";

test("only listed voices pass, prototype keys do not", () => {
  for (const id of ["eve.cloud", "erinome.cloud", "charon.cloud", "iapetus.cloud", "zinaida.local", "eduard.local"]) assert.ok(isVoice(id));
  for (const id of ["constructor", "toString", "__proto__", "ara", "kore", "", 1]) assert.ok(!isVoice(id));
});

test("bare legacy ids resolve against the current engine", () => {
  for (const id of ["eve", "erinome", "zinaida"]) assert.ok(resolveVoice(id));
  for (const id of ["constructor", "toString", "__proto__", "ara", "kore", ""]) assert.ok(!resolveVoice(id));
});

test("markup and links are not read aloud", () => {
  assert.equal(speakable("**Итог:** <b>три</b> пункта, см. https://x.com/a"), "Итог: три пункта, см.");
});

test("only OpenRouter-shaped keys are accepted", async () => {
  const { KEY_SHAPE } = await import("../sh.iva/extension/lib/voice.ts");
  assert.ok(KEY_SHAPE.test("sk-or-v1-" + "a".repeat(64)));
  for (const k of ["sk-proj-abc", "sk-or-short", "sk-or-v1-abc def" + "a".repeat(30), ""]) assert.ok(!KEY_SHAPE.test(k));
});
