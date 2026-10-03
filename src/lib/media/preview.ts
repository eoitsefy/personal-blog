// Images may be local relative URLs or HTTP(S), never active/data/blob URLs.
export function imagePreviewUrl(source: string | undefined): string | null {
  if (!source || /[\u0000-\u0020\u007f\\]/.test(source) || /^[?#]/.test(source)) return null;
  try {
    const url = new URL(source, "https://image-preview.invalid/");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? source : null;
  } catch {
    return null;
  }
}

export function fitImage(width: number, height: number, viewportWidth: number, viewportHeight: number) {
  if (![width, height, viewportWidth, viewportHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.min(1, viewportWidth / width, viewportHeight / height);
  return { width: width * scale, height: height * scale };
}
