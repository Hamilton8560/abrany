/**
 * Process-global FIFO concurrency limiter for MiniMax calls.
 *
 * MiniMax enforces a concurrency limit that is SHARED across several of David's
 * apps, so this app must be a good citizen: never run more than `MAX` requests
 * at once, queue the rest in arrival order, and back off + retry on 429/5xx.
 *
 * The limiter is cached on globalThis so Next.js dev hot-reloads reuse the same
 * gate rather than resetting the in-flight count.
 */

const MAX = Math.max(1, Number(process.env.MINIMAX_MAX_CONCURRENCY ?? "2") || 2);

type Waiter = () => void;

type Limiter = {
  max: number;
  active: number;
  queue: Waiter[];
};

type Global = typeof globalThis & { __abranyLimiter?: Limiter };
const g = globalThis as Global;

function limiter(): Limiter {
  if (!g.__abranyLimiter) g.__abranyLimiter = { max: MAX, active: 0, queue: [] };
  // allow env changes on reload
  g.__abranyLimiter.max = MAX;
  return g.__abranyLimiter;
}

function acquire(): Promise<() => void> {
  const l = limiter();
  return new Promise((resolve) => {
    const grant = () => {
      l.active++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        l.active--;
        const next = l.queue.shift();
        if (next) next();
      });
    };
    if (l.active < l.max) grant();
    else l.queue.push(grant);
  });
}

/**
 * Acquire a concurrency slot directly, for long-lived operations like streaming
 * where the slot must be held across many awaits. Returns a release fn; the
 * caller MUST call it (use try/finally). Retries are the caller's responsibility.
 */
export async function acquireSlot(): Promise<() => void> {
  return acquire();
}

export function queueState(): { active: number; queued: number; max: number } {
  const l = limiter();
  return { active: l.active, queued: l.queue.length, max: l.max };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

/**
 * Run `fn` while holding a concurrency slot. Retries retryable failures with
 * jittered exponential backoff. The slot is always released, even on throw.
 */
export async function withQueue<T>(fn: () => Promise<T>, opts?: { retries?: number }): Promise<T> {
  const retries = opts?.retries ?? 3;
  const release = await acquire();
  try {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (err) {
        if (attempt >= retries || !isRetryable(err)) throw err;
        const backoff = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        attempt++;
        await sleep(backoff);
      }
    }
  } finally {
    release();
  }
}
