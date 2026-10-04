// One RFC 7233 range; multipart ranges are rejected, not concatenated into memory.
export function parseByteRange(value: string, length: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !length || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, length - suffix), end: length - 1 } : null;
  }
  const start = Number(match[1]), requestedEnd = match[2] ? Number(match[2]) : length - 1;
  if (!Number.isSafeInteger(requestedEnd)) return null;
  const end = Math.min(requestedEnd, length - 1);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < length && end >= start ? { start, end } : null;
}
