import assert from "node:assert/strict";
import test from "node:test";
import { musicSessionKey } from "./netease-session-key";
import { MusicSessions } from "./netease-sessions";

test("two devices logged into the same blog account retain independent music grants", () => {
  const pc = "p".repeat(43), phone = "m".repeat(43);
  const sessions = new MusicSessions(() => ({ token: "" }));
  const pcKey = musicSessionKey("same-blog-reader", pc)!;
  const phoneKey = musicSessionKey("same-blog-reader", phone)!;
  const pcState = sessions.get(pcKey)!;
  pcState.token = "pc-provider-grant";
  const phoneState = sessions.get(phoneKey)!;
  assert.equal(phoneState.token, "");
  phoneState.token = "phone-provider-grant";
  assert.equal(sessions.get(pcKey)?.token, "pc-provider-grant");
  assert.equal(sessions.get(phoneKey)?.token, "phone-provider-grant");
  assert.equal(musicSessionKey("same-blog-reader", pc), pcKey);
  assert.notEqual(musicSessionKey("another-blog-reader", pc), pcKey);
  assert.equal(pcKey.includes(pc), false);
  assert.equal(musicSessionKey("same-blog-reader", undefined), undefined);
  assert.equal(musicSessionKey("same-blog-reader", "malformed"), undefined);
});
