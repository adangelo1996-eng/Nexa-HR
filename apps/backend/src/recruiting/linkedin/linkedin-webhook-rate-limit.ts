import { HttpException, HttpStatus } from "@nestjs/common";

const WINDOW_MS = 60_000;

/** Sliding window per IP — adatto a istanza singola (MVP). */
export class LinkedInWebhookRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly maxPerMinute: number) {}

  consume(key: string): void {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const prev = this.hits.get(key) ?? [];
    const inWindow = prev.filter((t) => t >= windowStart);
    if (inWindow.length >= this.maxPerMinute) {
      throw new HttpException("Troppe richieste al webhook", HttpStatus.TOO_MANY_REQUESTS);
    }
    inWindow.push(now);
    this.hits.set(key, inWindow);
  }
}
