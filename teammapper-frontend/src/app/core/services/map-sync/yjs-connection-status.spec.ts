import { WS_CLOSE_MAP_SYNC_RESET } from '@teammapper/shared';
import { MapSyncContext } from './map-sync-context';
import { SettingsService } from '../settings/settings.service';
import { YjsSyncService } from './yjs-sync.service';
import {
  createMockContext,
  createMockSettingsService,
  createYjsSyncService,
} from '../../../../test/mocks/yjs-sync.mock';
import {
  FakeMapConnection,
  FakeMapConnections,
} from '../../../../test/mocks/map-connection.mock';

describe('YjsSyncService connection status', () => {
  let context: MapSyncContext;
  let connections: FakeMapConnections;
  let service: YjsSyncService;

  beforeEach(() => {
    context = createMockContext();
    connections = new FakeMapConnections();
    service = createYjsSyncService(
      undefined,
      context,
      undefined,
      connections.factory
    );
  });

  function currentConnection(): FakeMapConnection {
    return connections.latest();
  }

  afterEach(() => service.destroy());

  it('opens the connection with the secret of the context', () => {
    service.initMap('test-uuid');

    expect(currentConnection()).toEqual(
      expect.objectContaining({
        mapId: 'test-uuid',
        modificationSecret: 'secret',
      })
    );
  });

  describe('a server map reset', () => {
    let old: FakeMapConnection;
    let fresh: FakeMapConnection;
    const settings =
      createMockSettingsService() as jest.Mocked<SettingsService>;
    beforeEach(() => {
      settings.setEditMode.mockClear();
      service = createYjsSyncService(
        undefined,
        context,
        settings,
        connections.factory
      );
      service.setWritable(true);
      service.initMap('test-uuid');
      old = currentConnection();
      old.doc.getMap('unused').set('payload', 'unrelated data');
      old.emitSynced();
      service.attachMap();
      old.emitClosed(WS_CLOSE_MAP_SYNC_RESET);
      fresh = currentConnection();
    });
    it('replaces the connection', () => {
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
    it('removes the renderer once', () => {
      expect(context.removeMap).toHaveBeenCalledTimes(1);
    });
    describe('after fresh sync', () => {
      beforeEach(() => {
        fresh.emitSynced();
        service.attachMap();
      });
      it('restores editing for a writable map', () => {
        expect(settings.setEditMode).toHaveBeenLastCalledWith(true);
      });
      it('removes the renderer before it recreates the map', () => {
        const removeOrder = jest.mocked(context.removeMap).mock
          .invocationCallOrder[0];
        const secondCreateOrder = jest.mocked(context.createMap).mock
          .invocationCallOrder[1];
        expect(removeOrder).toBeDefined();
        expect(removeOrder).toBeLessThan(secondCreateOrder);
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

  it('ignores a reset from an old connection', () => {
    service.initMap('test-uuid');
    const old = currentConnection();
    service.destroy();
    service.initMap('test-uuid');
    const fresh = currentConnection();
    old.emitClosed(WS_CLOSE_MAP_SYNC_RESET);
    expect(currentConnection()).toBe(fresh);
    service.destroy();
  });

  it('reports a disconnect of the open connection', () => {
    service.initMap('test-uuid');

    currentConnection().emitStatus('disconnected');

    expect(context.setConnectionStatus).toHaveBeenCalledWith('disconnected');
  });

  it('does not report the disconnect that destroy itself causes', () => {
    service.initMap('test-uuid');

    service.destroy();

    expect(currentConnection().destroy).toHaveBeenCalled();
    expect(context.setConnectionStatus).not.toHaveBeenCalledWith(
      'disconnected'
    );
  });

  it('clears the status on destroy so it cannot outlive the connection', () => {
    service.initMap('test-uuid');

    service.destroy();

    expect(context.setConnectionStatus).toHaveBeenLastCalledWith(null);
  });

  it('ignores a sync from a connection a later initMap replaced', () => {
    service.initMap('test-uuid');
    const stale = currentConnection();
    service.destroy();
    service.initMap('test-uuid');
    (context.setConnectionStatus as jest.Mock).mockClear();

    stale.emitSynced();

    expect(context.setConnectionStatus).not.toHaveBeenCalledWith('connected');
  });

  it('ignores an event from a connection a later initMap replaced', () => {
    service.initMap('test-uuid');
    const stale = currentConnection();
    service.destroy();
    service.initMap('test-uuid');
    (context.setConnectionStatus as jest.Mock).mockClear();

    stale.emitStatus('disconnected');

    expect(context.setConnectionStatus).not.toHaveBeenCalled();
  });
});
