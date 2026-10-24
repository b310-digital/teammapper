import * as Y from 'yjs';
import { WS_CLOSE_MAP_SYNC_RESET } from '@teammapper/shared';
import { WebsocketProvider } from 'y-websocket';
import { MapSyncContext } from './map-sync-context';
import { SettingsService } from '../settings/settings.service';
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

  constructor(public readonly doc: Y.Doc) {
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
    .mockImplementation(
      (_url: string, _mapId: string, doc: Y.Doc) =>
        new FakeWebsocketProvider(doc)
    ),
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

  afterEach(() => service.destroy());

  describe('connection authentication', () => {
    beforeEach(() => service.initMap('test-uuid'));
    it('keeps the secret out of the URL', () => {
      expect(jest.mocked(WebsocketProvider).mock.lastCall?.[0]).not.toContain(
        'secret'
      );
    });
    it('offers the secret as a subprotocol', () => {
      expect(jest.mocked(WebsocketProvider).mock.lastCall?.[3]).toEqual(
        expect.objectContaining({
          protocols: ['teammapper.v2', 'teammapper.secret.secret'],
        })
      );
    });
    it('does not send query parameters', () => {
      expect(
        jest.mocked(WebsocketProvider).mock.lastCall?.[3]
      ).not.toHaveProperty('params');
    });
  });

  describe('a server map reset', () => {
    let old: FakeWebsocketProvider;
    let fresh: FakeWebsocketProvider;
    const settings = { setEditMode: jest.fn() };
    beforeEach(() => {
      settings.setEditMode.mockClear();
      service = createYjsSyncService(
        undefined,
        context,
        settings as unknown as SettingsService
      );
      service.setWritable(true);
      service.initMap('test-uuid');
      old = currentProvider();
      old.doc.getMap('unused').set('payload', 'unrelated data');
      old.emit('sync', true);
      service.attachMap();
      old.emit('connection-close', { code: WS_CLOSE_MAP_SYNC_RESET });
      fresh = currentProvider();
    });
    it('replaces the provider', () => {
      expect(fresh).not.toBe(old);
    });
    it('starts fresh Yjs state without rejected data', () => {
      expect(fresh.doc).not.toBe(old.doc);
      expect(fresh.doc.share.has('unused')).toBe(false);
    });
    it('destroys the old Yjs state', () => {
      expect(old.doc.isDestroyed).toBe(true);
    });
    it('disables editing while waiting for sync', () => {
      expect(settings.setEditMode).toHaveBeenLastCalledWith(false);
    });
    it('clears undo and redo availability', () => {
      expect(context.setCanUndo).toHaveBeenLastCalledWith(false);
      expect(context.setCanRedo).toHaveBeenLastCalledWith(false);
    });
    it('does not report the map as deleted', () => {
      expect(context.mapDeleted).not.toHaveBeenCalled();
    });
    describe('after fresh sync', () => {
      beforeEach(() => {
        fresh.emit('sync', true);
        service.attachMap();
      });
      it('restores editing for a writable map', () => {
        expect(settings.setEditMode).toHaveBeenLastCalledWith(true);
      });
      it('recreates the map', () => {
        expect(context.createMap).toHaveBeenCalledTimes(2);
      });
      it('reports a connected status', () => {
        expect(context.setConnectionStatus).toHaveBeenLastCalledWith(
          'connected'
        );
      });
    });
  });

  it('ignores a reset from an old provider', () => {
    service.initMap('test-uuid');
    const old = currentProvider();
    service.destroy();
    service.initMap('test-uuid');
    const fresh = currentProvider();
    old.emit('connection-close', { code: WS_CLOSE_MAP_SYNC_RESET });
    expect(currentProvider()).toBe(fresh);
    service.destroy();
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
