// Provider tokens are private to an authenticated blog user and live only in
// this application process. A restart requires a new provider authorization.
export class MusicSessions<T> {
  private readonly entries = new Map<string, { value: T; touchedAt: number }>();

  constructor(private readonly create: () => T, private readonly maximum = 100,
    private readonly lifetimeMs = 60 * 60_000) {}

  peek(userId: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(userId);
    return entry && now - entry.touchedAt < this.lifetimeMs ? entry.value : undefined;
  }

  get(userId: string, now = Date.now()): T | undefined {
    if (!userId) return undefined;
    for (const [key, entry] of this.entries) {
      if (now - entry.touchedAt >= this.lifetimeMs) this.entries.delete(key);
    }
    const existing = this.entries.get(userId);
    if (existing) { existing.touchedAt = now; return existing.value; }
    if (this.entries.size >= this.maximum) return undefined;
    const value = this.create();
    this.entries.set(userId, { value, touchedAt: now });
    return value;
  }
}

export type MusicBudget = { windowStart: number; calls: number };

export function consumeMusicBudget(budget: MusicBudget, limit: number, windowMs: number, now = Date.now()) {
  if (now - budget.windowStart >= windowMs) { budget.windowStart = now; budget.calls = 0; }
  if (budget.calls >= limit) return false;
  budget.calls += 1;
  return true;
}
