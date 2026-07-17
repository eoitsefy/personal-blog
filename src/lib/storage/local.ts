import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StorageAdapter {
  write(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_-]*\.(?:jpg|jpeg|png|webp|mp3|wav|ogg|opus|pdf|txt|md)$/;

export function assertSafeStorageKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("\\")) {
    throw new Error("Unsafe storage key");
  }
}

export function getUploadRoot() {
  if (process.env.UPLOAD_ROOT) return path.resolve(process.env.UPLOAD_ROOT);
  return process.env.NODE_ENV === "production"
    ? "/app/uploads"
    : path.join(process.cwd(), "uploads");
}

function resolveKey(root: string, key: string) {
  assertSafeStorageKey(key);
  const resolved = path.resolve(root, ...key.split("/"));
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Storage path escaped root");
  return resolved;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root = getUploadRoot()) {}

  async write(key: string, bytes: Uint8Array) {
    const destination = resolveKey(this.root, key);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o750 });
    await writeFile(destination, bytes, { flag: "wx", mode: 0o640 });
  }

  read(key: string) {
    return readFile(resolveKey(this.root, key));
  }

  async delete(key: string) {
    await rm(resolveKey(this.root, key), { force: true });
  }
}

export function createAssetKey(extension: string, now = new Date()) {
  if (!/^(?:jpg|png|webp|mp3|wav|ogg|opus|pdf|txt|md)$/.test(extension)) throw new Error("Unsupported asset extension");
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `media/${year}/${month}/${randomUUID().replace(/-/g, "")}.${extension}`;
}

export function publicAssetUrl(key: string) {
  assertSafeStorageKey(key);
  return `/uploads/${key}`;
}

export function getLocalStorage() {
  return new LocalStorageAdapter();
}
