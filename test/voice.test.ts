// Run: node --test test/*.test.ts   (Node 22.6+ strips the types itself)
import assert from "node:assert/strict";
import { test } from "node:test";
import { isVoice, speakable } from "../sh.iva/extension/lib/voice.ts";

test("only listed voices pass, prototype keys do not", () => {
  for (const id of ["erinome", "eve", "charon", "iapetus"]) assert.ok(isVoice(id));
  for (const id of ["constructor", "toString", "__proto__", "ara", "kore", "", 1]) assert.ok(!isVoice(id));
});

test("markup and links are not read aloud", () => {
  assert.equal(speakable("**Итог:** <b>три</b> пункта, см. https://x.com/a"), "Итог: три пункта, см.");
});
