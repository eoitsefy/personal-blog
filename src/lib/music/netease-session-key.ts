import { createHash } from "node:crypto";

// A provider login belongs to one validated blog session. Different devices
// using the same blog account must not replace one another's music grants.
// Neither the raw cookie nor this internal key is sent to the provider/logs.
export function musicSessionKey(userId: string, sessionToken: string | undefined) {
  if (!userId || !sessionToken || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) return undefined;
  return createHash("sha256").update(userId).update("\0").update(sessionToken).digest("hex");
}
