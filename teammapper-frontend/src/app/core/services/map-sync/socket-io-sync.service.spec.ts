import { Subject } from 'rxjs';
import { SocketIoSyncService } from './socket-io-sync.service';
import { MapSyncContext } from './map-sync-context';
import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { MapSyncErrorHandler } from './map-sync-error-handler';
import { ExportNodeProperties, MapCreateEvent } from '@mmp/map/types';
import { MapSnapshot } from '@mmp/map/handlers/history';

describe('SocketIoSyncService', () => {
  let service: SocketIoSyncService;
  let ctx: jest.Mocked<MapSyncContext>;
  let mmpService: jest.Mocked<MmpService>;
  let settingsService: jest.Mocked<SettingsService>;
  let utilsService: jest.Mocked<UtilsService>;
  let toastrService: jest.Mocked<ToastrService>;
  let errorHandler: jest.Mocked<MapSyncErrorHandler>;

  // Subjects to simulate MMP events
  let createSubject: Subject<MapCreateEvent>;
  let nodeUpdateSubject: Subject<unknown>;
  let nodeCreateSubject: Subject<ExportNodeProperties>;
  let nodePasteSubject: Subject<ExportNodeProperties[]>;
  let nodeRemoveSubject: Subject<ExportNodeProperties>;
  let undoSubject: Subject<unknown>;
  let redoSubject: Subject<unknown>;
  let nodeSelectSubject: Subject<ExportNodeProperties>;
  let nodeDeselectSubject: Subject<ExportNodeProperties>;

  const mockNode: ExportNodeProperties = {
    id: 'node-1',
    name: 'Test Node',
    parent: 'root',
    k: 1,
    colors: { branch: '#000000' },
    font: { size: 14, style: 'normal', weight: 'normal' },
    locked: false,
    hidden: false,
    coordinates: undefined,
    image: undefined,
    link: undefined,
    isRoot: false,
    detached: false,
  };

  beforeEach(() => {
    createSubject = new Subject();
    nodeUpdateSubject = new Subject();
    nodeCreateSubject = new Subject();
    nodePasteSubject = new Subject();
    nodeRemoveSubject = new Subject();
    undoSubject = new Subject();
    redoSubject = new Subject();
    nodeSelectSubject = new Subject();
    nodeDeselectSubject = new Subject();

    const subjectMap: Record<string, Subject<unknown>> = {
      create: createSubject,
      nodeUpdate: nodeUpdateSubject,
      nodeCreate: nodeCreateSubject,
      nodePaste: nodePasteSubject,
      nodeRemove: nodeRemoveSubject,
      undo: undoSubject,
      redo: redoSubject,
      nodeSelect: nodeSelectSubject,
      nodeDeselect: nodeDeselectSubject,
    };

    mmpService = {
      on: jest.fn((event: string) => subjectMap[event] ?? new Subject()),
      selectNode: jest.fn().mockReturnValue(mockNode),
      editNode: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn(),
      history: jest.fn().mockReturnValue({
        snapshots: [[], [], []] as MapSnapshot[],
        index: 2,
      }),
      highlightNode: jest.fn(),
      exportAsJSON: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<MmpService>;

    ctx = {
      getAttachedMap: jest.fn().mockReturnValue({
        key: 'map-test',
        cachedMap: { uuid: 'test-uuid', data: [] },
      }),
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
      updateAttachedMap: jest.fn().mockResolvedValue(undefined),
      emitClientList: jest.fn(),
    } as jest.Mocked<MapSyncContext>;

    settingsService = {
      setEditMode: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    utilsService = {} as unknown as jest.Mocked<UtilsService>;

    toastrService = {
      error: jest.fn(),
      success: jest.fn(),
      warning: jest.fn(),
    } as unknown as jest.Mocked<ToastrService>;

    errorHandler = {
      handleOperationResponse: jest.fn(),
    } as unknown as jest.Mocked<MapSyncErrorHandler>;

    service = new SocketIoSyncService(
      ctx,
      mmpService,
      settingsService,
      utilsService,
      toastrService,
      errorHandler
    );

    // initMap calls createListeners which sets up all the subscriptions
    // We need to mock the socket operations, so we call initMap indirectly
    // by invoking the private createListeners through initMap
    // But initMap also calls listenServerEvents which needs a socket.
    // Let's just call createListeners directly via the public initMap path.
    // We need to stub socket first.

    // Since connect() creates the socket and initMap needs it,
    // we'll test at the unit level by calling initMap after mocking connect.
  });

  describe('updateCanUndoRedo after node mutations', () => {
    beforeEach(() => {
      // Inject mock socket before setting up listeners
      const mockSocket = {
        emit: jest.fn(),
        on: jest.fn(),
        io: { on: jest.fn() },
        id: 'mock-socket-id',
      };
      (service as unknown as { socket: unknown }).socket = mockSocket;
      (service as unknown as { createListeners: () => void }).createListeners();
    });

    it('calls setCanUndo and setCanRedo after create event', () => {
      createSubject.next({} as MapCreateEvent);

      expect(ctx.setCanUndo).toHaveBeenCalledWith(true);
      expect(ctx.setCanRedo).toHaveBeenCalledWith(false);
    });

    it('calls setCanUndo and setCanRedo after nodeUpdate event', () => {
      nodeUpdateSubject.next({
        nodeProperties: mockNode,
        changedProperty: 'name',
      });

      expect(ctx.setCanUndo).toHaveBeenCalledWith(true);
      expect(ctx.setCanRedo).toHaveBeenCalledWith(false);
    });

    it('calls setCanUndo and setCanRedo after nodeCreate event', () => {
      nodeCreateSubject.next(mockNode);

      expect(ctx.setCanUndo).toHaveBeenCalledWith(true);
      expect(ctx.setCanRedo).toHaveBeenCalledWith(false);
    });

    it('calls setCanUndo and setCanRedo after nodePaste event', () => {
      nodePasteSubject.next([mockNode]);

      expect(ctx.setCanUndo).toHaveBeenCalledWith(true);
      expect(ctx.setCanRedo).toHaveBeenCalledWith(false);
    });

    it('calls setCanUndo and setCanRedo after nodeRemove event', () => {
      nodeRemoveSubject.next(mockNode);

      expect(ctx.setCanUndo).toHaveBeenCalledWith(true);
      expect(ctx.setCanRedo).toHaveBeenCalledWith(false);
    });
  });

  describe('undo and redo', () => {
    it('calls mmpService.undo and updates canUndoRedo state', () => {
      service.undo();

      expect(mmpService.undo).toHaveBeenCalled();
      expect(ctx.setCanUndo).toHaveBeenCalled();
      expect(ctx.setCanRedo).toHaveBeenCalled();
    });

    it('calls mmpService.redo and updates canUndoRedo state', () => {
      service.redo();

      expect(mmpService.redo).toHaveBeenCalled();
      expect(ctx.setCanUndo).toHaveBeenCalled();
      expect(ctx.setCanRedo).toHaveBeenCalled();
    });
  });

  describe('canUndo/canRedo values from history state', () => {
    beforeEach(() => {
      const mockSocket = {
        emit: jest.fn(),
        on: jest.fn(),
        io: { on: jest.fn() },
        id: 'mock-socket-id',
      };
      (service as unknown as { socket: unknown }).socket = mockSocket;
      (service as unknown as { createListeners: () => void }).createListeners();
    });

    it('sets canUndo=false when history index is at start', () => {
      mmpService.history.mockReturnValue({
        snapshots: [[]] as MapSnapshot[],
        index: 0,
      });
      createSubject.next({} as MapCreateEvent);

      expect(ctx.setCanUndo).toHaveBeenCalledWith(false);
      expect(ctx.setCanRedo).toHaveBeenCalledWith(false);
    });

    it('sets canRedo=true when history index is before end', () => {
      mmpService.history.mockReturnValue({
        snapshots: [[], [], []] as MapSnapshot[],
        index: 1,
      });
      createSubject.next({} as MapCreateEvent);

      expect(ctx.setCanUndo).toHaveBeenCalledWith(false);
      expect(ctx.setCanRedo).toHaveBeenCalledWith(true);
    });
  });
});
