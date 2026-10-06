import { NEVER, Observable } from 'rxjs';
import { MmpService } from '../../app/core/services/mmp/mmp.service';
import { SettingsService } from '../../app/core/services/settings/settings.service';
import { UtilsService } from '../../app/core/services/utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { MapSyncContext } from '../../app/core/services/map-sync/map-sync-context';
import { YjsSyncService } from '../../app/core/services/map-sync/yjs-sync.service';

/**
 * The collaborators YjsSyncService is constructed with. Every suite around the
 * service needs the same ones, so this file defines them for all of them.
 */
export function createMockContext(): MapSyncContext {
  return {
    getModificationSecret: jest.fn().mockReturnValue('secret'),
    getColorMapping: jest.fn().mockReturnValue({}),
    getClientColor: jest.fn().mockReturnValue('#ff0000'),
    colorForNode: jest.fn().mockReturnValue(''),
    setConnectionStatus: jest.fn(),
    setColorMapping: jest.fn(),
    setAttachedNode: jest.fn(),
    setClientColor: jest.fn(),
    setCanUndo: jest.fn(),
    setCanRedo: jest.fn(),
    updateAttachedMap: jest.fn(),
    emitClientList: jest.fn(),
    createMap: jest.fn(),
    mapDeleted: jest.fn(),
  };
}

function createMockMmpService(): jest.Mocked<MmpService> {
  return {
    on: jest.fn().mockReturnValue(NEVER),
    selectNode: jest.fn().mockReturnValue(null),
    existNode: jest.fn().mockReturnValue(true),
    updateAdditionalMapOptions: jest.fn(),
  } as unknown as jest.Mocked<MmpService>;
}

/** The mmp callback of each event, by event name. */
export type MmpHandlers = Record<string, (payload?: unknown) => void>;

/**
 * An MmpService whose `on` registers every subscriber of an event, as mmp
 * does. `handlers[event]` calls all live subscribers of that event, and an
 * unsubscribe drops its subscriber.
 */
export function capturingMmpService(
  handlers: MmpHandlers
): jest.Mocked<MmpService> {
  const observers: Record<string, Set<(payload?: unknown) => void>> = {};
  return {
    on: jest.fn(
      (event: string) =>
        new Observable<unknown>(observer => {
          const set = (observers[event] ??= new Set());
          const next = (payload?: unknown) => observer.next(payload);
          set.add(next);
          handlers[event] = payload => [...set].forEach(fn => fn(payload));
          return () => set.delete(next);
        })
    ),
    selectNode: jest.fn().mockReturnValue(null),
    existNode: jest.fn().mockReturnValue(true),
    highlightNode: jest.fn(),
    updateAdditionalMapOptions: jest.fn(),
  } as unknown as jest.Mocked<MmpService>;
}

function createMockSettingsService(): SettingsService {
  return { setEditMode: jest.fn() } as unknown as SettingsService;
}

export function createYjsSyncService(
  mmpService: jest.Mocked<MmpService> = createMockMmpService(),
  context: MapSyncContext = createMockContext(),
  settingsService: SettingsService = createMockSettingsService()
): YjsSyncService {
  return new YjsSyncService(
    context,
    mmpService,
    settingsService,
    {} as UtilsService,
    {} as ToastrService
  );
}
