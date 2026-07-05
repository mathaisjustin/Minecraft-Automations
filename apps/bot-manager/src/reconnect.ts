export interface BackoffOptions {
  initialDelayMs: number;
  maxDelayMs: number;
}

/** Exponential backoff: initial * 2^attempt, capped at max. Attempt is 0-based. */
export function backoffDelay(attempt: number, opts: BackoffOptions): number {
  return Math.min(opts.initialDelayMs * 2 ** attempt, opts.maxDelayMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
