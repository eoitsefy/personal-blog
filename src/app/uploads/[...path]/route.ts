import { assertSafeStorageKey, getLocalStorage } from "@/lib/storage/local";

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
};

const DOCUMENT_EXTENSIONS = new Set(["pdf", "txt", "md"]);

export async function GET(_req: Request, { params }: RouteParams) {
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
    });
    if (DOCUMENT_EXTENSIONS.has(extension)) {
      headers.set("Content-Disposition", "attachment");
      headers.set("Content-Security-Policy", "sandbox");
    }
    return new Response(bytes, { headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}
