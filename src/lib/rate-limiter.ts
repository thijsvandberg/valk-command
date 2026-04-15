import { NextResponse } from "next/server";

interface RateLimitEntry {
  timestamps: number[];
}

const buckets = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs * 2;
  for (const [key, entry] of buckets) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) buckets.delete(key);
  }
}

/**
 * Check if a request is within rate limits using sliding window.
 * Returns null if allowed, or the number of seconds until retry if limited.
 */
function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): number | null {
  cleanup(windowMs);
  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = buckets.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    buckets.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return Math.max(retryAfter, 1);
  }

  entry.timestamps.push(now);
  return null;
}

type RateLimitTier = "sync" | "story-writer" | "workspace" | "read";

const TIER_CONFIG: Record<RateLimitTier, { maxRequests: number; windowMs: number }> = {
  sync: { maxRequests: 5, windowMs: 60_000 },
  "story-writer": { maxRequests: 10, windowMs: 60_000 },
  workspace: { maxRequests: 10, windowMs: 60_000 },
  read: { maxRequests: 120, windowMs: 60_000 },
};

/**
 * Check rate limit for a tier. Returns a 429 Response if limited, or null if allowed.
 * Call at the top of a route handler and return the response if non-null.
 */
export function applyRateLimit(tier: RateLimitTier): Response | null {
  const config = TIER_CONFIG[tier];
  const retryAfter = checkRateLimit(tier, config.maxRequests, config.windowMs);
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Outbound API call tracking
// ---------------------------------------------------------------------------

interface OutboundCounter {
  timestamps: number[];
  windowMs: number;
  limit: number;
}

const outboundCounters: Record<string, OutboundCounter> = {
  jira: { timestamps: [], windowMs: 60_000, limit: 100 },
  bitbucket: { timestamps: [], windowMs: 3_600_000, limit: 1000 },
  confluence: { timestamps: [], windowMs: 60_000, limit: 100 },
};

export function trackOutboundCall(service: "jira" | "bitbucket" | "confluence"): void {
  const counter = outboundCounters[service];
  const now = Date.now();
  counter.timestamps.push(now);

  // Trim old entries
  const cutoff = now - counter.windowMs;
  counter.timestamps = counter.timestamps.filter((t) => t > cutoff);
}

export function getOutboundUsage(service: "jira" | "bitbucket" | "confluence"): {
  current: number;
  limit: number;
  percentUsed: number;
} {
  const counter = outboundCounters[service];
  const now = Date.now();
  const cutoff = now - counter.windowMs;
  counter.timestamps = counter.timestamps.filter((t) => t > cutoff);

  const current = counter.timestamps.length;
  return {
    current,
    limit: counter.limit,
    percentUsed: Math.round((current / counter.limit) * 100),
  };
}

export function isOutboundLimitApproaching(service: "jira" | "bitbucket" | "confluence"): boolean {
  const usage = getOutboundUsage(service);
  return usage.percentUsed >= 80;
}

/**
 * Reset all rate limit state. Used in tests.
 */
export function resetRateLimits(): void {
  buckets.clear();
  outboundCounters.jira.timestamps = [];
  outboundCounters.bitbucket.timestamps = [];
  outboundCounters.confluence.timestamps = [];
}

// Exported for testing
export { checkRateLimit, buckets };
