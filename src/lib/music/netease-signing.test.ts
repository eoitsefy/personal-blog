import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import { canonicalNeteaseParameters, signNeteaseParameters } from "./netease-signing";

test("official request canonicalization preserves raw JSON and excludes signature and empty fields", () => {
  assert.equal(canonicalNeteaseParameters({ timestamp: 123, bizContent: '{"keyword":"海 & 风"}', appId: "application", sign: "old", empty: "", nil: null, absent: undefined, zero: 0 }),
    'appId=application&bizContent={"keyword":"海 & 风"}&timestamp=123&zero=0');
});

test("request signature verifies against the paired public key and fails on changed business content", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const parameters = { appId: "application", bizContent: '{"clientId":"application"}', signType: "RSA_SHA256", timestamp: "123" };
  const signature = signNeteaseParameters(parameters, privateKey);
  assert.equal(verify("SHA256", Buffer.from(canonicalNeteaseParameters(parameters)), publicKey, Buffer.from(signature, "base64")), true);
  assert.equal(verify("SHA256", Buffer.from(canonicalNeteaseParameters({ ...parameters, timestamp: "124" })), publicKey, Buffer.from(signature, "base64")), false);
});
