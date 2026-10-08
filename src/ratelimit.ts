// Fixed-window rate limiter keyed by client IP (in memory, single instance).
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(private limit: number, private windowMs: number) {}

  /** Returns true if the request is allowed. */
  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now >= h.reset) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(now);
      return true;
    }
    h.count++;
    return h.count <= this.limit;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (now >= v.reset) this.hits.delete(k);
  }
}
