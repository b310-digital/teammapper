import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { MapConnection } from '../map-connection';
import { DocPersistence, StoredDoc } from './doc-persistence';

/**
 * Keeps the Y.Doc of a map in the browser through a `DocPersistence`.
 * Opening the map merges every update stored for it, so the edits of two tabs
 * on the same map both appear after a reload. Nothing connects to a server:
 * the connection reports connected at once, never closes, and the awareness
 * holds the presence of this tab alone.
 */
export class LocalMapConnection implements MapConnection {
  public readonly awareness: Awareness;
  // Resolves to null when opening failed, which leaves the map closed.
  private readonly stored: Promise<StoredDoc | null>;
  private destroyed = false;

  /** @param release runs on destroy, once the map closes */
  constructor(
    mapId: string,
    doc: Y.Doc,
    docPersistence: () => Promise<DocPersistence>,
    private readonly release: () => void = () => undefined
  ) {
    this.awareness = new Awareness(doc);
    const opened = this.open(docPersistence, mapId, doc);
    this.stored = opened.catch((error: unknown) => {
      console.error('Failed to open the stored map:', error);
      return null;
    });
    window.addEventListener('pagehide', this.flush);
    document.addEventListener('visibilitychange', this.flushWhenHidden);
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

  /** The browser storage never closes, so the listener is never called. */
  onClosed(_listener: (code: number | null) => void): void {
    return;
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
    this.release();
    return closed;
  }

  /**
   * Writes the pending state at once, so a closing tab keeps the edits of
   * the last write debounce.
   */
  private readonly flush = (): void => {
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
    if (this.destroyed) return null;
    return persistence.attach(mapId, doc);
  }
}
