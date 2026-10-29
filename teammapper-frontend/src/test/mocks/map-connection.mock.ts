import * as Y from 'yjs';
import { AwarenessUser } from '@teammapper/shared';
import {
  Awareness,
  MapConnection,
  MapConnectionFactory,
} from '../../app/core/services/map-backend/map-connection';
import { ConnectionStatus } from '../../app/core/services/map-sync/map-sync-context';

type Listener<T extends unknown[]> = (...args: T) => void;
type Status = NonNullable<ConnectionStatus>;

/**
 * Stands in for a `MapConnection`. A test emits the connection's events, and
 * peer awareness states go into `states`. A local awareness write stores the
 * state under the doc's client id, as in y-protocols. Destroying the
 * connection reports a close and a disconnect, as the websocket connection
 * does.
 */
export class FakeMapConnection implements MapConnection {
  public readonly states = new Map<number, { user: AwarenessUser }>();
  public readonly fakeAwareness = {
    getStates: () => this.states,
    setLocalStateField: jest.fn((_field: string, user: AwarenessUser) => {
      this.states.set(this.doc.clientID, { user });
    }),
    on: jest.fn(),
    off: jest.fn(),
  };
  public readonly destroy = jest.fn(() => this.disconnect());

  private readonly synced: Listener<[]>[] = [];
  private readonly status: Listener<[Status]>[] = [];
  private readonly closed: Listener<[number | null]>[] = [];
  private connected = true;

  constructor(
    public readonly mapId: string,
    public readonly doc: Y.Doc,
    public readonly modificationSecret: string
  ) {}

  get awareness(): Awareness {
    return this.fakeAwareness as unknown as Awareness;
  }

  onSynced(listener: () => void): void {
    this.synced.push(listener);
  }

  onStatus(listener: (status: Status) => void): void {
    this.status.push(listener);
  }

  onClosed(listener: (code: number | null) => void): void {
    this.closed.push(listener);
  }

  emitSynced(): void {
    this.synced.forEach(listener => listener());
  }

  emitStatus(status: Status): void {
    this.status.forEach(listener => listener(status));
  }

  emitClosed(code: number | null): void {
    this.closed.forEach(listener => listener(code));
  }

  private disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.emitClosed(null);
    this.emitStatus('disconnected');
  }
}

/** A connection factory that keeps every fake connection it opened. */
export class FakeMapConnections {
  public readonly opened: FakeMapConnection[] = [];

  public readonly factory: MapConnectionFactory = (
    mapId,
    doc,
    modificationSecret
  ) => {
    const connection = new FakeMapConnection(mapId, doc, modificationSecret);
    this.opened.push(connection);
    return connection;
  };

  /** The connection opened last. */
  latest(): FakeMapConnection {
    const connection = this.opened[this.opened.length - 1];
    if (!connection) throw new Error('No connection opened');
    return connection;
  }
}
