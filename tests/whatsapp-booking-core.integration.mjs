import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalWhatsAppPhone,
  isStaleWhatsAppMessage,
  whatsappProviderTimestamp,
} from "../lib/phone.ts";

test("canonicalizes the verified WhatsApp sender without suffix matching", () => {
  assert.equal(canonicalWhatsAppPhone("+91 73878 91015"), "917387891015");
  assert.equal(canonicalWhatsAppPhone("7387891015"), "917387891015");
  assert.equal(canonicalWhatsAppPhone("0044 7700 900123"), "447700900123");
  assert.equal(canonicalWhatsAppPhone("+44 7700 900123"), "447700900123");
  assert.equal(canonicalWhatsAppPhone("123"), null);
});

test("parses Meta timestamps in seconds or milliseconds", () => {
  assert.equal(
    whatsappProviderTimestamp("1786627860")?.toISOString(),
    "2026-08-13T13:31:00.000Z",
  );
  assert.equal(
    whatsappProviderTimestamp("1786627860000")?.toISOString(),
    "2026-08-13T13:31:00.000Z",
  );
  assert.equal(whatsappProviderTimestamp("not-a-timestamp"), null);
  assert.equal(whatsappProviderTimestamp("17866224000"), null);
  assert.equal(whatsappProviderTimestamp("178662240000"), null);
});

test("suppresses workflow effects only when an inbound Meta event is over ten minutes old", () => {
  const now = new Date("2026-08-13T14:00:00.000Z");
  assert.equal(isStaleWhatsAppMessage("1786629000", now), false);
  assert.equal(isStaleWhatsAppMessage("1786628999", now), true);
  assert.equal(isStaleWhatsAppMessage("1786630200", now), false);
  assert.equal(isStaleWhatsAppMessage(undefined, now), false);
  assert.equal(isStaleWhatsAppMessage("invalid", now), false);
});
