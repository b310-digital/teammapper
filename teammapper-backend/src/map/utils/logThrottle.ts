interface ThrottleWindow {
  startedAt: number
  suppressed: number
}

/**
 * Limits a log line to one per key and window, and counts the repeats it
 * drops so the next admitted line can report them.
 */
export class LogThrottle {
  private readonly windows = new Map<string, ThrottleWindow>()

  constructor(
    private readonly windowMs: number = 60_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** null: suppress this line. A number: log it, with that many suppressed repeats. */
  admit(key: string): number | null {
    const window = this.windows.get(key)
    if (window && !this.hasEnded(window)) {
      window.suppressed++
      return null
    }
    this.windows.set(key, { startedAt: this.now(), suppressed: 0 })
    return window?.suppressed ?? 0
  }

  /** Drops keys whose window ended; the gateway heartbeat calls it. */
  prune(): void {
    for (const [key, window] of this.windows) {
      if (this.hasEnded(window)) this.windows.delete(key)
    }
  }

  private hasEnded(window: ThrottleWindow): boolean {
    return this.now() - window.startedAt >= this.windowMs
  }
}
