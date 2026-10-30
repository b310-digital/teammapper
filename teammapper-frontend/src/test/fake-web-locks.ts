type LockMode = 'shared' | 'exclusive';

interface LockRequestOptions {
  mode?: LockMode;
  signal?: AbortSignal;
}

type LockTask = (lock: { name: string; mode: LockMode }) => unknown;

interface PendingRequest {
  mode: LockMode;
  grant: () => void;
}

/**
 * The Web Locks API as tabs of one origin share it, for jsdom, which has
 * none. A lock name grants its requests in order: shared requests together,
 * an exclusive one alone. An aborted request leaves the queue and rejects
 * with an `AbortError`.
 */
export class FakeLockManager {
  // Who holds each lock right now. One entry per task that holds it:
  // 'shared' lets other shared tasks hold it too, 'exclusive' lets no one.
  private readonly grantedModes = new Map<string, LockMode[]>();
  // The requests still waiting for each lock, first come first.
  private readonly queues = new Map<string, PendingRequest[]>();

  /** Waits for the lock, runs the task, and resolves with its result. */
  request(
    name: string,
    optionsOrTask: LockRequestOptions | LockTask,
    maybeTask?: LockTask
  ): Promise<unknown> {
    const options = typeof optionsOrTask === 'function' ? {} : optionsOrTask;
    const task =
      typeof optionsOrTask === 'function' ? optionsOrTask : maybeTask;
    if (!task) throw new TypeError('A lock request needs a task');
    const mode = options.mode ?? 'exclusive';
    return new Promise((resolve, reject) => {
      const request: PendingRequest = {
        mode,
        grant: () => this.run(name, mode, task).then(resolve, reject),
      };
      options.signal?.addEventListener('abort', () => {
        if (this.cancelWaiting(name, request)) {
          reject(new DOMException('The request was aborted', 'AbortError'));
        }
      });
      this.queueOf(name).push(request);
      this.grantWaiting(name);
    });
  }

  /** Holds the lock while the task runs, then lets the next waiting one in. */
  private async run(name: string, mode: LockMode, task: LockTask) {
    this.grantedModesOf(name).push(mode);
    try {
      return await task({ name, mode });
    } finally {
      const granted = this.grantedModesOf(name);
      granted.splice(granted.indexOf(mode), 1);
      this.grantWaiting(name);
    }
  }

  /**
   * Gives the lock to waiting requests, in order. Stops at the first one
   * that has to wait: an exclusive request waits until no one holds the
   * lock, a shared one until no exclusive task holds it.
   */
  private grantWaiting(name: string): void {
    const queue = this.queueOf(name);
    for (let next = queue[0]; next; next = queue[0]) {
      const granted = this.grantedModesOf(name);
      const grantable =
        granted.length === 0 ||
        (next.mode === 'shared' && !granted.includes('exclusive'));
      if (!grantable) return;
      queue.shift();
      next.grant();
    }
  }

  /**
   * Removes an aborted request from the waiting line. Returns false when it
   * no longer waits, because it already got the lock.
   */
  private cancelWaiting(name: string, request: PendingRequest): boolean {
    const queue = this.queueOf(name);
    const index = queue.indexOf(request);
    if (index === -1) return false;
    queue.splice(index, 1);
    this.grantWaiting(name);
    return true;
  }

  /** Who holds this lock right now, as in `grantedModes`. */
  private grantedModesOf(name: string): LockMode[] {
    const granted = this.grantedModes.get(name) ?? [];
    this.grantedModes.set(name, granted);
    return granted;
  }

  /** The requests still waiting for this lock. */
  private queueOf(name: string): PendingRequest[] {
    const queue = this.queues.get(name) ?? [];
    this.queues.set(name, queue);
    return queue;
  }
}

/** Gives `navigator` a fresh fake lock manager until `removeFakeLocks`. */
export function installFakeLocks(): FakeLockManager {
  const locks = new FakeLockManager();
  Object.defineProperty(navigator, 'locks', {
    value: locks,
    configurable: true,
  });
  return locks;
}

export function removeFakeLocks(): void {
  Reflect.deleteProperty(navigator, 'locks');
}
