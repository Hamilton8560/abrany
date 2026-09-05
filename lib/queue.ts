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

export type Priority = "interactive" | "background";
type Waiter = { grant: () => void; priority: Priority };

type Limiter = {
  max: number;
  active: number;
  /** slots currently held by background work */
  activeBackground: number;
  queue: Waiter[];
};

/**
 * Background jobs (course builds, section writing) may never take the LAST slot: with a
 * cap of 2, at most 1 is theirs, so a learner's chat reply, answer check or exam grade
 * gets a slot promptly instead of waiting behind a 60-second lesson generation. With a
 * cap of 1 everything shares it (interactive still jumps the queue).
 */
const backgroundLimit = (max: number) => Math.max(1, max - 1);

type Global = typeof globalThis & { __abranyLimiter?: Limiter };
const g = globalThis as Global;

function limiter(): Limiter {
  if (!g.__abranyLimiter) g.__abranyLimiter = { max: MAX, active: 0, activeBackground: 0, queue: [] };
  // allow env changes on reload
  g.__abranyLimiter.max = MAX;
  g.__abranyLimiter.activeBackground ??= 0;
  return g.__abranyLimiter;
}

const canRun = (l: Limiter, priority: Priority) =>
  l.active < l.max && (priority === "interactive" || l.activeBackground < backgroundLimit(l.max));

/** Hand freed capacity to the first waiter that is allowed to run (interactive first). */
function drain(l: Limiter) {
  for (;;) {
    const idx =
      l.queue.findIndex((w) => w.priority === "interactive" && canRun(l, "interactive")) !== -1
        ? l.queue.findIndex((w) => w.priority === "interactive")
        : l.queue.findIndex((w) => canRun(l, w.priority));
    if (idx === -1) return;
    const [next] = l.queue.splice(idx, 1);
    next.grant();
  }
}

function acquire(priority: Priority = "interactive"): Promise<() => void> {
  const l = limiter();
  return new Promise((resolve) => {
    const grant = () => {
      l.active++;
      if (priority === "background") l.activeBackground++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        l.active--;
        if (priority === "background") l.activeBackground--;
        drain(l);
      });
    };
    if (canRun(l, priority)) grant();
    else if (priority === "interactive") {
      // ahead of every background waiter, behind earlier interactive ones
      const firstBg = l.queue.findIndex((w) => w.priority === "background");
      if (firstBg === -1) l.queue.push({ grant, priority });
      else l.queue.splice(firstBg, 0, { grant, priority });
    } else l.queue.push({ grant, priority });
  });
}

/**
 * Acquire a concurrency slot directly, for long-lived operations like streaming
 * where the slot must be held across many awaits. Returns a release fn; the
 * caller MUST call it (use try/finally). Retries are the caller's responsibility.
 */
export async function acquireSlot(priority: Priority = "interactive"): Promise<() => void> {
  return acquire(priority);
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
export async function withQueue<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; priority?: Priority },
): Promise<T> {
  const retries = opts?.retries ?? 3;
  const release = await acquire(opts?.priority ?? "interactive");
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
