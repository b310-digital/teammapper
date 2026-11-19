import {
  WS_CLOSE_MAP_SYNC_RESET,
  WS_CLOSE_MAP_UPDATE_REJECTED,
  WS_CLOSE_MESSAGE_TOO_BIG,
} from '@teammapper/shared';
import { CLOSE_STORAGE_OUTDATED } from '../map-backend/map-connection';
import { MapSyncContext } from './map-sync-context';
import { SettingsService } from '../settings/settings.service';
import { YjsSyncService } from './yjs-sync.service';
import {
  createMockContext,
  createMockSettingsService,
  createRecordingToastr,
  createYjsSyncService,
  RecordingToastr,
} from '../../../../test/mocks/yjs-sync.mock';
import { createMockUtilsService } from '../../../../test/mocks/utils-service.mock';
import {
  FakeMapConnection,
  FakeMapConnections,
} from '../../../../test/mocks/map-connection.mock';

/** Lets the translation promise of a toast resolve. */
function flushToasts(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve));
}

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

  /** A service whose toasts `toasts` records. */
  function createToastingService(
    settings: SettingsService,
    toasts: RecordingToastr
  ): YjsSyncService {
    return createYjsSyncService(
      undefined,
      context,
      settings,
      connections.factory,
      createMockUtilsService(),
      toasts.toastr
    );
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
    let toasts: RecordingToastr;
    beforeEach(async () => {
      settings.setEditMode.mockClear();
      toasts = createRecordingToastr();
      service = createToastingService(settings, toasts);
      service.setWritable(true);
      service.initMap('test-uuid');
      old = currentConnection();
      old.doc.getMap('unused').set('payload', 'unrelated data');
      old.emitSynced();
      service.attachMap();
      old.emitClosed(WS_CLOSE_MAP_SYNC_RESET, 'invalidContent');
      fresh = currentConnection();
      await flushToasts();
    });
    it('explains the reset in a toast', () => {
      expect(toasts.messages()).toEqual(['TOASTS.MAP_RESET']);
    });
    it('lets the reset toast close by itself', () => {
      expect(toasts.shown()[0]?.options?.disableTimeOut).toBeFalsy();
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

  describe('a change the server rejected', () => {
    let connection: FakeMapConnection;
    let toasts: RecordingToastr;
    const settings =
      createMockSettingsService() as jest.Mocked<SettingsService>;

    function openSynced(): void {
      service.setWritable(true);
      service.initMap('test-uuid');
      connection = currentConnection();
      connection.emitSynced();
      service.attachMap();
      settings.setEditMode.mockClear();
      (context.setConnectionStatus as jest.Mock).mockClear();
    }

    beforeEach(() => {
      toasts = createRecordingToastr();
      service = createToastingService(settings, toasts);
    });

    describe('with the reason mapTooLarge', () => {
      beforeEach(async () => {
        openSynced();
        connection.emitClosed(WS_CLOSE_MAP_UPDATE_REJECTED, 'mapTooLarge');
        await flushToasts();
      });
      it('turns edit mode off', () => {
        expect(settings.setEditMode).toHaveBeenLastCalledWith(false);
      });
      it('shows the size limit message', () => {
        expect(toasts.messages()).toEqual(['TOASTS.MAP_TOO_LARGE']);
      });
      it('keeps the toast on screen until the visitor reloads', () => {
        expect(toasts.shown()[0]?.options).toEqual(
          expect.objectContaining({
            disableTimeOut: true,
            tapToDismiss: false,
          })
        );
      });
      it('clears the connection status', () => {
        expect(context.setConnectionStatus).toHaveBeenLastCalledWith(null);
      });
      it('opens no new connection', () => {
        expect(connections.opened).toHaveLength(1);
      });
      it('keeps the map on screen', () => {
        expect(context.removeMap).not.toHaveBeenCalled();
      });
      it('leaves the status empty when the provider reports a disconnect', () => {
        connection.emitStatus('disconnected');

        expect(context.setConnectionStatus).toHaveBeenLastCalledWith(null);
        expect(context.setConnectionStatus).not.toHaveBeenCalledWith(
          'disconnected'
        );
      });
    });

    it.each([
      [
        'the general message for any other reason',
        WS_CLOSE_MAP_UPDATE_REJECTED,
        'invalidContent',
        'TOASTS.MAP_UPDATE_REJECTED',
      ],
      [
        'the size limit message for a message too big close',
        WS_CLOSE_MESSAGE_TOO_BIG,
        '',
        'TOASTS.MAP_TOO_LARGE',
      ],
    ])('shows %s', async (_name, code, reason, message) => {
      openSynced();

      connection.emitClosed(code, reason);
      await flushToasts();

      expect(toasts.messages()).toEqual([message]);
    });

    it('turns edit mode off for a message too big close', () => {
      openSynced();

      connection.emitClosed(WS_CLOSE_MESSAGE_TOO_BIG);

      expect(settings.setEditMode).toHaveBeenLastCalledWith(false);
    });

    it('keeps edit mode off after a close before the first sync', () => {
      service.setWritable(true);
      service.initMap('test-uuid');
      connection = currentConnection();
      connection.emitClosed(WS_CLOSE_MAP_UPDATE_REJECTED, 'mapTooLarge');
      settings.setEditMode.mockClear();

      connection.emitSynced();
      service.attachMap();

      expect(settings.setEditMode).toHaveBeenLastCalledWith(false);
    });

    it('shows nothing for a close from a replaced connection', async () => {
      service.initMap('test-uuid');
      const stale = currentConnection();
      service.destroy();
      service.initMap('test-uuid');

      stale.emitClosed(WS_CLOSE_MAP_UPDATE_REJECTED, 'mapTooLarge');
      await flushToasts();

      expect(toasts.shown()).toEqual([]);
    });

    it('reports the status of a connection opened after the rejection', () => {
      openSynced();
      connection.emitClosed(WS_CLOSE_MAP_UPDATE_REJECTED, 'mapTooLarge');
      service.destroy();
      service.initMap('test-uuid');

      currentConnection().emitStatus('disconnected');

      expect(context.setConnectionStatus).toHaveBeenLastCalledWith(
        'disconnected'
      );
    });
  });

  describe('a browser storage that a later build updated', () => {
    let connection: FakeMapConnection;
    const settings =
      createMockSettingsService() as jest.Mocked<SettingsService>;
    beforeEach(() => {
      service = createYjsSyncService(
        undefined,
        context,
        settings,
        connections.factory
      );
      service.setWritable(true);
      service.initMap('test-uuid');
      connection = currentConnection();
      connection.emitSynced();
      service.attachMap();
      settings.setEditMode.mockClear();
      connection.emitClosed(CLOSE_STORAGE_OUTDATED);
    });
    it('turns edit mode off', () => {
      expect(settings.setEditMode).toHaveBeenLastCalledWith(false);
    });
    it('keeps the map on screen', () => {
      expect(currentConnection()).toBe(connection);
      expect(context.removeMap).not.toHaveBeenCalled();
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
