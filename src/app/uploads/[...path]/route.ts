import { assertSafeStorageKey, getLocalStorage } from "@/lib/storage/local";
import { parseByteRange } from "@/lib/media/byte-range";

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

export async function GET(req: Request, { params }: RouteParams) {
  const key = (await params).path.join("/");
  try {
    assertSafeStorageKey(key);
    const bytes = await getLocalStorage().read(key);
    const extension = key.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXTENSION[extension];
    if (!mime) return new Response(null, { status: 404 });

    const headers = new Headers({
      "Content-Type": mime,
      "Content-Length": String(bytes.byteLength),
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
      const range = parseByteRange(rangeValue, bytes.length);
      if (!range) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${bytes.length}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(bytes.subarray(range.start, range.end + 1), { status: 206, headers });
    }
    return new Response(bytes, { headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}
