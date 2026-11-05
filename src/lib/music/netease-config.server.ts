import "server-only";
import { createPrivateKey, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";

export type NeteaseConfig = { appId: string; appSecret?: string; privateKey: KeyObject };

export function readNeteaseConfiguration(): { config?: NeteaseConfig; missing: string[]; message: string } {
  const appId = process.env.NETEASE_MUSIC_APP_ID?.trim();
  const keyFile = process.env.NETEASE_MUSIC_PRIVATE_KEY_FILE?.trim();
  const keyText = process.env.NETEASE_MUSIC_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const missing: string[] = [];
  if (!appId) missing.push("应用 AppID");
  if (!keyFile && !keyText) missing.push("应用 RSA 签名私钥");
  if (missing.length) return { missing, message: `尚需配置：${missing.join("、")}。私钥仅从本机后台读取。` };
  try {
    const privateKey = createPrivateKey(keyFile ? readFileSync(keyFile, "utf8") : keyText!);
    if (privateKey.asymmetricKeyType !== "rsa" || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
      return { missing: ["有效的 RSA 私钥"], message: "私钥必须为至少 2048 位的 RSA 私钥，并与平台登记的公钥配对。" };
    }
    return { config: { appId: appId!, appSecret: process.env.NETEASE_MUSIC_APP_SECRET, privateKey }, missing: [], message: "后台凭据已配置，可以发起小量接入测试。" };
  } catch {
    return { missing: ["可读取的 RSA 私钥"], message: "后台无法读取有效私钥，请检查本机私钥文件路径和格式。" };
  }
}
