import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { buildYjsProtocols, buildYjsWsUrl } from '../../map-sync/yjs-utils';
import { ConnectionStatus } from '../../map-sync/map-sync-context';
import { Awareness, MapConnection } from '../map-connection';

/**
 * Keeps the Y.Doc of a map in sync with the backend over a Yjs websocket. The
 * secret travels as a subprotocol, never in the URL.
 */
export class WebsocketMapConnection implements MapConnection {
  private readonly provider: WebsocketProvider;

  constructor(mapId: string, doc: Y.Doc, modificationSecret: string) {
    this.provider = new WebsocketProvider(buildYjsWsUrl(), mapId, doc, {
      protocols: buildYjsProtocols(modificationSecret),
      maxBackoffTime: 5000,
      disableBc: true,
    });
  }

  get awareness(): Awareness {
    return this.provider.awareness;
  }

  onSynced(listener: () => void): void {
    this.provider.on('sync', (synced: boolean) => {
      if (synced) listener();
    });
  }

  /** Reports connected and disconnected; connecting reports nothing. */
  onStatus(listener: (status: NonNullable<ConnectionStatus>) => void): void {
    this.provider.on(
      'status',
      (event: { status: 'connected' | 'disconnected' | 'connecting' }) => {
        if (event.status !== 'connecting') listener(event.status);
      }
    );
  }

  onClosed(listener: (code: number | null) => void): void {
    this.provider.on('connection-close', (event: CloseEvent | null) =>
      listener(event?.code ?? null)
    );
  }

  /**
   * Disconnecting emits 'status' and 'connection-close', so the listeners
   * hear of this connection once more after the call.
   */
  destroy(): void {
    this.provider.disconnect();
    this.provider.destroy();
  }
}
