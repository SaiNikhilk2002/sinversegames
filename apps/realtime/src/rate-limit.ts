/**
 * Per-connection token buckets. Each event category has its own refill rate
 * and burst size; exceeding it rejects the event with RATE_LIMITED.
 */
export const RATE_LIMITS = {
  room: { perSecond: 4, burst: 10 },
  create: { perSecond: 0.2, burst: 3 },
  /** Joining by code is limited hard to make brute-forcing room codes impractical. */
  join: { perSecond: 0.2, burst: 6 },
  action: { perSecond: 6, burst: 12 },
  guess: { perSecond: 2, burst: 5 },
  stroke: { perSecond: 60, burst: 120 },
  /** Arena steering: clients send input on change, at most ~20 times a second. */
  input: { perSecond: 30, burst: 45 },
  /** Cooking: gestures alone can reach about seven a second. */
  cook: { perSecond: 14, burst: 28 },
} as const;
export type RateCategory = keyof typeof RATE_LIMITS;

export class RateLimiter {
  private buckets = new Map<RateCategory, { tokens: number; at: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  take(category: RateCategory): boolean {
    const { perSecond, burst } = RATE_LIMITS[category];
    const t = this.now();
    const b = this.buckets.get(category) ?? { tokens: burst, at: t };
    b.tokens = Math.min(burst, b.tokens + ((t - b.at) / 1000) * perSecond);
    b.at = t;
    this.buckets.set(category, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

export const categoryFor = (event: string): RateCategory => {
  if (event === "room:create" || event === "match:queue") return "create";
  if (event === "room:join") return "join";
  if (event === "doodle:stroke" || event === "doodle:undo" || event === "doodle:clear") return "stroke";
  if (event === "doodle:guess") return "guess";
  if (event === "arena:input") return "input";
  if (event === "kitchen:act" || event === "kitchen:tap") return "cook";
  if (event.startsWith("card:") || event.startsWith("trail:") || event === "doodle:select-word") return "action";
  return "room";
};
