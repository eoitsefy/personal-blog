import { z } from "zod";

export const MapClientEventSchema = z.object({
  provider: z.literal("amap"),
  kind: z.enum([
    "loader_ready",
    "loader_error",
    "map_ready",
    "coordinate_conversion_partial",
    "map_runtime_error",
  ]),
  pointCount: z.number().int().min(0).max(100_000),
  omittedCount: z.number().int().min(0).max(100_000).default(0),
  durationMs: z.number().int().min(0).max(120_000),
}).strict();

export type MapClientEvent = z.infer<typeof MapClientEventSchema>;

export class MapEventRateLimiter {
  private readonly windows = new Map<string, { count: number; startedAt: number }>();

  constructor(
    private readonly limit = 12,
    private readonly windowMs = 10 * 60 * 1000,
    private readonly maximumKeys = 5_000,
  ) {}

  allow(key: string, now = Date.now()) {
    const current = this.windows.get(key);
    if (!current || current.startedAt + this.windowMs <= now) {
      if (!current && this.windows.size >= this.maximumKeys) {
        const oldest = this.windows.keys().next().value;
        if (oldest) this.windows.delete(oldest);
      }
      this.windows.set(key, { count: 1, startedAt: now });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }
}
