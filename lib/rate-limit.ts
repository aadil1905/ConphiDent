type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function requestIdentity(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim().slice(0, 80);
}

/** A bounded in-process guard. Provider/WAF limits remain the outer distributed layer. */
export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (buckets.size > MAX_BUCKETS) for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) { const next = { count: 1, resetAt: now + windowMs }; buckets.set(key, next); return { allowed: true, remaining: limit - 1, resetAt: next.resetAt }; }
  current.count += 1;
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

export function rateLimitResponse(result: { resetAt: number }) {
  return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))), "Cache-Control": "no-store" } });
}
