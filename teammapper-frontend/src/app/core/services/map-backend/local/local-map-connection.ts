import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { CLOSE_STORAGE_OUTDATED, MapConnection } from '../map-connection';
import { DocPersistence, StoredDoc } from './doc-persistence';

/**
 * Calls the listener once a later build changed the format of the stored
 * maps, and lets the later build wait until the promise the listener returns
 * settles. The returned function stops the watch.
 */
export type FormatWatch = (onOutdated: () => Promise<void>) => () => void;

/**
 * Keeps the Y.Doc of a map in the browser through a `DocPersistence`.
 * Opening the map merges every update stored for it, so the edits of two tabs
 * on the same map both appear after a reload. Nothing connects to a server:
 * the connection reports connected at once, and the awareness holds the
 * presence of this tab alone. The connection closes only when a later build
 * changed the format of the stored maps: it then stores nothing more, so this
 * tab cannot write the old format over maps the later build updated.
 */
export class LocalMapConnection implements MapConnection {
  public readonly awareness: Awareness;
  // Resolves to null when opening failed, which leaves the map closed.
  private readonly stored: Promise<StoredDoc | null>;
  // The stored doc once it has attached, which `outdate` stops at once.
  private attached: StoredDoc | null = null;
  private readonly stopFormatWatch: () => void;
  private readonly closedListeners: ((code: number | null) => void)[] = [];
  private destroyed = false;
  private outdated = false;
  // Settles once `destroy` wrote the pending state, null before `destroy`.
  private closing: Promise<void> | null = null;

  /**
   * @param release runs on destroy, once the map closes
   * @param watchFormat reports a later build that changed the stored maps
   */
  constructor(
    mapId: string,
    doc: Y.Doc,
    docPersistence: () => Promise<DocPersistence>,
    private readonly release: () => void = () => undefined,
    watchFormat: FormatWatch = () => () => undefined
  ) {
    this.awareness = new Awareness(doc);
    const opened = this.open(docPersistence, mapId, doc);
    this.stored = opened.catch((error: unknown) => {
      console.error('Failed to open the stored map:', error);
      return null;
    });
    window.addEventListener('pagehide', this.flush);
    document.addEventListener('visibilitychange', this.flushWhenHidden);
    // Opening checks the flag only after the persistence loaded, so a watch
    // that reports at once still keeps the doc from attaching.
    this.stopFormatWatch = watchFormat(() => this.outdate());
  }

  /** Calls the listener once the stored updates are in the doc. */
  onSynced(listener: () => void): void {
    void this.stored.then(stored => {
      if (stored && !this.destroyed) listener();
    });
  }

  onStatus(listener: (status: 'connected' | 'disconnected') => void): void {
    listener('connected');
  }

  /**
   * Calls the listener with `CLOSE_STORAGE_OUTDATED` once a later build
   * changed the stored maps, at once when that already happened.
   */
  onClosed(listener: (code: number | null) => void): void {
    if (this.outdated) listener(CLOSE_STORAGE_OUTDATED);
    else this.closedListeners.push(listener);
  }

  /**
   * Stops storing the doc and keeps what was stored. Resolves once the
   * pending state is written, which callers through `MapConnection` need not
   * wait for.
   */
  destroy(): Promise<void> {
    this.destroyed = true;
    window.removeEventListener('pagehide', this.flush);
    document.removeEventListener('visibilitychange', this.flushWhenHidden);
    this.awareness.destroy();
    const closed = this.stored.then(stored => stored?.close());
    // A later build waits for the close, so the watch lasts until it settles.
    this.closing = closed.catch(() => undefined);
    void this.closing.then(this.stopFormatWatch);
    this.release();
    return closed;
  }

  /**
   * Writes the pending state at once, so a closing tab keeps the edits of
   * the last write debounce.
   */
  private readonly flush = (): void => {
    // A later build may be migrating the map, and the doc stores nothing.
    if (this.outdated) return;
    this.stored
      .then(stored => stored?.flush())
      .catch((error: unknown) => {
        console.error('Failed to write the map:', error);
      });
  };

  // A tab turns hidden before it closes, and on mobile often closes unseen.
  private readonly flushWhenHidden = (): void => {
    if (document.visibilityState === 'hidden') this.flush();
  };

  /** Null when the connection was destroyed before the persistence loaded. */
  private async open(
    docPersistence: () => Promise<DocPersistence>,
    mapId: string,
    doc: Y.Doc
  ): Promise<StoredDoc | null> {
    const persistence = await docPersistence();
    if (this.destroyed || this.outdated) return null;
    this.attached = await persistence.attach(mapId, doc);
    return this.attached;
  }

  /**
   * Drops the edits not yet stored and reports the close. A doc that has
   * attached stops storing at once, before the next edit. Resolves once the
   * writes already under way are done, a close under way included.
   */
  private async outdate(): Promise<void> {
    if (this.closing) return this.closing;
    if (this.outdated) return;
    this.outdated = true;
    const discarded = this.attached
      ? this.attached.discard()
      : this.stored.then(stored => stored?.discard());
    this.closedListeners.forEach(listener => listener(CLOSE_STORAGE_OUTDATED));
    await discarded.catch((error: unknown) =>
      console.error('Failed to stop storing the map:', error)
    );
  }
}
