import { assertSafeStorageKey, getLocalStorage } from "@/lib/storage/local";
import { parseByteRange } from "@/lib/media/byte-range";
import { Readable } from "node:stream";

type RouteParams = { params: Promise<{ path: string[] }> };

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const DOCUMENT_EXTENSIONS = new Set(["pdf", "txt", "md"]);

async function serve(req: Request, { params }: RouteParams, headOnly: boolean) {
  const key = (await params).path.join("/");
  try {
    assertSafeStorageKey(key);
    const storage = getLocalStorage();
    const info = await storage.stat(key);
    if (!info.isFile()) return new Response(null, { status: 404 });
    const extension = key.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXTENSION[extension];
    if (!mime) return new Response(null, { status: 404 });

    const headers = new Headers({
      "Content-Type": mime,
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    });
    if (DOCUMENT_EXTENSIONS.has(extension)) {
      headers.set("Content-Disposition", "attachment");
      headers.set("Content-Security-Policy", "sandbox");
    }
    const rangeValue = req.headers.get("range");
    if (rangeValue) {
      const range = parseByteRange(rangeValue, info.size);
      if (!range) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      const body = headOnly ? null : Readable.toWeb(storage.stream(key, range.start, range.end)) as ReadableStream<Uint8Array>;
      return new Response(body, { status: 206, headers });
    }
    const body = headOnly ? null : Readable.toWeb(storage.stream(key)) as ReadableStream<Uint8Array>;
    return new Response(body, { headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export async function GET(req: Request, context: RouteParams) { return serve(req, context, false); }
export async function HEAD(req: Request, context: RouteParams) { return serve(req, context, true); }
