/** The channel on which the tabs of the site announce their format number. */
const CHANNEL_NAME = 'teammapper-offline-format';

interface FormatMessage {
  formatNumber: number;
}

/** A format number is a positive integer, so Infinity blocks no tab. */
const isFormatMessage = (data: unknown): data is FormatMessage =>
  typeof data === 'object' &&
  data !== null &&
  'formatNumber' in data &&
  Number.isSafeInteger(data.formatNumber) &&
  Number(data.formatNumber) > 0;

/**
 * Calls `onNewer` when a later build raised the format number of the stored
 * maps. The channel learns of the raise from these sources:
 * - the format number a later build announces on a `BroadcastChannel`
 * - the stored format number, which the channel reads again each time the
 *   page becomes visible, since a frozen or hidden tab can miss an
 *   announcement
 */
export class FormatChannel {
  private channel: BroadcastChannel | null = null;
  private watching = false;

  /**
   * @param readStored reads the stored format number
   * @param onNewer runs for each signal of a higher format number
   */
  constructor(
    private readonly formatNumber: number,
    private readonly readStored: () => Promise<number | null>,
    private readonly onNewer: () => void
  ) {}

  /** Starts listening for a higher format number, once. */
  watch(): void {
    if (this.watching) return;
    this.watching = true;
    this.channel = openChannel();
    if (this.channel) this.channel.onmessage = this.onMessage;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Tells the other tabs the format number of this build. */
  announce(): void {
    const message: FormatMessage = { formatNumber: this.formatNumber };
    this.channel?.postMessage(message);
  }

  close(): void {
    this.channel?.close();
    this.channel = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onMessage = ({ data }: MessageEvent<unknown>): void => {
    if (isFormatMessage(data) && data.formatNumber > this.formatNumber) {
      this.onNewer();
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return;
    this.readStored()
      .then(stored => {
        if (stored !== null && stored > this.formatNumber) this.onNewer();
      })
      .catch((error: unknown) =>
        console.error('Failed to read the stored format number:', error)
      );
  };
}

/** Null in a browser without `BroadcastChannel`. */
function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel(CHANNEL_NAME);
}
