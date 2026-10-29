import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WS_CLOSE_MAP_SYNC_RESET } from '@teammapper/shared';
import { WebsocketMapConnection } from './websocket-map-connection';

/**
 * Stands in for the real provider: it records its listeners, lets a test emit
 * provider events, and disconnects the way y-websocket's
 * closeWebsocketConnection does, emitting 'connection-close' and 'status'.
 */
class FakeWebsocketProvider {
  public static latest: FakeWebsocketProvider | null = null;

  public readonly awareness = { getStates: () => new Map() };
  public readonly destroy = jest.fn(() => this.disconnect());
  public readonly disconnect = jest.fn(() => {
    this.emit('connection-close', null);
    this.emit('status', { status: 'disconnected' });
  });

  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  constructor() {
    FakeWebsocketProvider.latest = this;
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  emit(event: string, arg: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(arg);
  }
}

jest.mock('y-websocket', () => ({
  WebsocketProvider: jest
    .fn()
    .mockImplementation(() => new FakeWebsocketProvider()),
}));

describe('WebsocketMapConnection', () => {
  let doc: Y.Doc;
  let connection: WebsocketMapConnection;

  function provider(): FakeWebsocketProvider {
    if (!FakeWebsocketProvider.latest) throw new Error('No provider created');
    return FakeWebsocketProvider.latest;
  }

  function providerArgs(): unknown[] {
    return jest.mocked(WebsocketProvider).mock.lastCall ?? [];
  }

  beforeEach(() => {
    doc = new Y.Doc();
    connection = new WebsocketMapConnection('test-uuid', doc, 'secret');
  });

  afterEach(() => doc.destroy());

  describe('connection authentication', () => {
    it('keeps the secret out of the URL', () => {
      expect(providerArgs()[0]).not.toContain('secret');
    });

    it('offers the secret as a subprotocol', () => {
      expect(providerArgs()[3]).toEqual(
        expect.objectContaining({
          protocols: ['teammapper.v2', 'teammapper.secret.secret'],
        })
      );
    });

    it('does not send query parameters', () => {
      expect(providerArgs()[3]).not.toHaveProperty('params');
    });
  });

  it('syncs the given doc in the room of the map', () => {
    expect(providerArgs()[1]).toBe('test-uuid');
    expect(providerArgs()[2]).toBe(doc);
  });

  it('keeps the reconnect backoff and the broadcast channel setting', () => {
    expect(providerArgs()[3]).toEqual(
      expect.objectContaining({ maxBackoffTime: 5000, disableBc: true })
    );
  });

  it('exposes the awareness of the provider', () => {
    expect(connection.awareness).toBe(provider().awareness);
  });

  it('reports each sync of the doc', () => {
    const synced = jest.fn();
    connection.onSynced(synced);

    provider().emit('sync', false);
    provider().emit('sync', true);

    expect(synced).toHaveBeenCalledTimes(1);
  });

  it('reports connected and disconnected, and skips connecting', () => {
    const statuses: string[] = [];
    connection.onStatus(status => statuses.push(status));

    provider().emit('status', { status: 'connecting' });
    provider().emit('status', { status: 'connected' });
    provider().emit('status', { status: 'disconnected' });

    expect(statuses).toEqual(['connected', 'disconnected']);
  });

  it('reports the close code', () => {
    const codes: (number | null)[] = [];
    connection.onClosed(code => codes.push(code));

    provider().emit('connection-close', { code: WS_CLOSE_MAP_SYNC_RESET });
    provider().emit('connection-close', null);

    expect(codes).toEqual([WS_CLOSE_MAP_SYNC_RESET, null]);
  });

  it('disconnects and destroys the provider on destroy', () => {
    connection.destroy();

    expect(provider().disconnect).toHaveBeenCalled();
    expect(provider().destroy).toHaveBeenCalled();
  });
});
