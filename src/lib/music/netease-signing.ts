import { createSign, type KeyObject } from "node:crypto";

// Matches the canonicalization in the published @music163/ncm-cli 0.1.7
// qu/Hu/jt helpers. Values are signed as strings, before URL encoding.
export function canonicalNeteaseParameters(parameters: Record<string, unknown>) {
  return Object.entries(parameters)
    .filter(([name, value]) => name !== "sign" && value !== null && value !== undefined && value !== "")
    .map(([name, value]) => [name, String(value)])
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`).join("&");
}

export function signNeteaseParameters(parameters: Record<string, unknown>, privateKey: KeyObject) {
  const signer = createSign("SHA256");
  signer.update(canonicalNeteaseParameters(parameters));
  signer.end();
  return signer.sign(privateKey, "base64");
}
