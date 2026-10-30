/** How long a build waits for the tabs of older builds to stop storing. */
export const OLDER_TABS_TIMEOUT_MS = 10_000;

/**
 * The lock every tab of a build holds, shared, while it may store. Every
 * later build depends on this name, so never change it.
 */
const writersLockName = (formatNumber: number): string =>
  `teammapper-offline-writers-${formatNumber}`;

/** False in a browser without the Web Locks API, such as over plain http. */
const hasLocks = (): boolean => 'locks' in navigator;

/**
 * Runs the task while no other tab of the site runs one under the same
 * name. A browser without the Web Locks API runs it at once.
 */
export async function withLock(
  name: string,
  task: () => Promise<void>
): Promise<void> {
  if (!hasLocks()) return task();
  await navigator.locks.request(name, task);
}

/**
 * The shared writer lock of this tab's build. A build that raises the format
 * number waits for it, so a tab holds it until it stores nothing more.
 */
export class WriterLock {
  private releaseLock: (() => void) | null = null;

  /** Resolves once this tab holds the lock, at once when it already does. */
  async acquire(formatNumber: number): Promise<void> {
    if (!hasLocks() || this.releaseLock) return;
    await new Promise<void>((granted, failed) => {
      const held = new Promise<void>(resolve => (this.releaseLock = resolve));
      navigator.locks
        .request(writersLockName(formatNumber), { mode: 'shared' }, () => {
          granted();
          return held;
        })
        .catch((error: unknown) => {
          this.releaseLock = null;
          failed(error);
        });
    });
  }

  release(): void {
    this.releaseLock?.();
    this.releaseLock = null;
  }
}

/**
 * Resolves once no tab of a build older than `formatNumber` holds its writer
 * lock. Rejects with an `AbortError` after `OLDER_TABS_TIMEOUT_MS`.
 */
export async function waitForOlderWriters(formatNumber: number): Promise<void> {
  if (!hasLocks()) return;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), OLDER_TABS_TIMEOUT_MS);
  try {
    for (let older = 1; older < formatNumber; older++) {
      const options = { mode: 'exclusive' as const, signal: timeout.signal };
      await navigator.locks.request(writersLockName(older), options, () => {
        return undefined;
      });
    }
  } finally {
    clearTimeout(timer);
  }
}
