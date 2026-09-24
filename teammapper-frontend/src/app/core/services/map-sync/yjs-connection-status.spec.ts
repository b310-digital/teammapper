import { WebsocketProvider } from 'y-websocket';
import { MapSyncContext } from './map-sync-context';
import { YjsSyncService } from './yjs-sync.service';
import {
  createMockContext,
  createYjsSyncService,
} from '../../../../test/mocks/yjs-sync.mock';

/**
 * Stands in for the real provider and reproduces the one behavior these tests
 * depend on: disconnecting emits 'connection-close' and 'status' disconnected,
 * the same as y-websocket's closeWebsocketConnection.
 */
class FakeWebsocketProvider {
  public static instances: FakeWebsocketProvider[] = [];

  public readonly awareness = {
    getStates: () => new Map(),
    setLocalStateField: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };

  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  private connected = true;

  constructor() {
    FakeWebsocketProvider.instances.push(this);
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  emit(event: string, arg: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(arg);
  }

  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.emit('connection-close', null);
    this.emit('status', { status: 'disconnected' });
  }

  destroy(): void {
    this.disconnect();
  }
}

jest.mock('y-websocket', () => ({
  WebsocketProvider: jest
    .fn()
    .mockImplementation(() => new FakeWebsocketProvider()),
}));

describe('YjsSyncService connection status', () => {
  let context: MapSyncContext;
  let service: YjsSyncService;

  beforeEach(() => {
    FakeWebsocketProvider.instances = [];
    context = createMockContext();
    service = createYjsSyncService(undefined, context);
  });

  function currentProvider(): FakeWebsocketProvider {
    return FakeWebsocketProvider.instances[
      FakeWebsocketProvider.instances.length - 1
    ];
  }

  it('offers the secret as a subprotocol and keeps it out of the URL', () => {
    service.initMap('test-uuid');

    const call = jest.mocked(WebsocketProvider).mock.lastCall;
    expect(call?.[0]).not.toContain('secret');
    expect(call?.[3]).toEqual(
      expect.objectContaining({
        protocols: ['teammapper.v1', 'teammapper.secret.secret'],
      })
    );
    expect(call?.[3]).not.toHaveProperty('params');
  });

  it('reports a disconnect of the open connection', () => {
    service.initMap('test-uuid');

    currentProvider().emit('status', { status: 'disconnected' });

    expect(context.setConnectionStatus).toHaveBeenCalledWith('disconnected');
  });

  it('does not report the disconnect that destroy itself causes', () => {
    service.initMap('test-uuid');

    service.destroy();

    expect(context.setConnectionStatus).not.toHaveBeenCalledWith(
      'disconnected'
    );
  });

  it('clears the status on destroy so it cannot outlive the connection', () => {
    service.initMap('test-uuid');

    service.destroy();

    expect(context.setConnectionStatus).toHaveBeenLastCalledWith(null);
  });

  it('ignores a sync from a provider a later initMap replaced', () => {
    service.initMap('test-uuid');
    const stale = currentProvider();
    service.destroy();
    service.initMap('test-uuid');
    (context.setConnectionStatus as jest.Mock).mockClear();

    stale.emit('sync', true);

    expect(context.setConnectionStatus).not.toHaveBeenCalledWith('connected');
  });

  it('ignores an event from a provider a later initMap replaced', () => {
    service.initMap('test-uuid');
    const stale = currentProvider();
    service.destroy();
    service.initMap('test-uuid');
    (context.setConnectionStatus as jest.Mock).mockClear();

    stale.emit('status', { status: 'disconnected' });

    expect(context.setConnectionStatus).not.toHaveBeenCalled();
  });
});
