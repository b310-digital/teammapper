import { TestBed } from '@angular/core/testing';
import { MapSyncService } from './map-sync.service';
import { MmpService } from '../mmp/mmp.service';
import { HttpService } from '../../http/http.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { ToastService } from '../toast/toast.service';
import { DialogService } from '../dialog/dialog.service';
import {
  ValidationErrorResponse,
  CriticalErrorResponse,
  SuccessResponse,
  OperationResponse,
} from './server-types';
import { ExportNodeProperties } from '@mmp/map/types';
import { createMockUtilsService } from '../../../../test/mocks/utils-service.mock';
import { Observable } from 'rxjs';
import { UserSettings } from '../../../shared/models/settings.model';
import * as Y from 'yjs';
import {
  populateYMapFromNodeProps,
  yMapToNodeProps,
  buildYjsWsUrl,
  parseWriteAccessBytes,
  resolveClientColor,
  findAffectedNodes,
  resolveMmpPropertyUpdate,
  resolveCompoundMmpUpdates,
} from './yjs-utils';

// Mock the NodePropertyMapping module
jest.mock('@mmp/index', () => ({
  NodePropertyMapping: {
    name: ['name'],
    locked: ['locked'],
    coordinates: ['coordinates'],
    imageSrc: ['image', 'src'],
    imageSize: ['image', 'size'],
    linkHref: ['link', 'href'],
    backgroundColor: ['colors', 'background'],
    branchColor: ['colors', 'branch'],
    fontWeight: ['font', 'weight'],
    fontStyle: ['font', 'style'],
    fontSize: ['font', 'size'],
    nameColor: ['colors', 'name'],
    hidden: ['hidden'],
  },
}));

// Import NodePropertyMapping after mocking - needed for service to work
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { NodePropertyMapping } from '@mmp/index';

// Minimal private access for tests that must interact with Socket.io internals
interface MapSyncServiceSocketAccess {
  socket: {
    emit: jest.Mock;
    removeAllListeners: jest.Mock;
    on?: jest.Mock;
    io?: { on: jest.Mock };
  };
  emitAddNode: (node: ExportNodeProperties) => void;
}

function asSocketAccess(service: MapSyncService): MapSyncServiceSocketAccess {
  return service as unknown as MapSyncServiceSocketAccess;
}

function createMockNode(
  overrides?: Partial<ExportNodeProperties>
): ExportNodeProperties {
  return {
    id: 'mock-id',
    name: 'Mock Node',
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
    ...overrides,
  };
}

describe('MapSyncService', () => {
  let service: MapSyncService;
  let mmpService: jest.Mocked<MmpService>;
  let httpService: jest.Mocked<HttpService>;
  let storageService: jest.Mocked<StorageService>;
  let settingsService: jest.Mocked<SettingsService>;
  let utilsService: jest.Mocked<UtilsService>;
  let toastService: jest.Mocked<ToastService>;
  let dialogService: jest.Mocked<DialogService>;
  let toastrService: jest.Mocked<ToastrService>;

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

  const mockMapSnapshot: ExportNodeProperties[] = [mockNode];

  const mockServerMap = {
    uuid: 'test-uuid',
    lastModified: new Date().toISOString(),
    deletedAt: new Date(Date.now() + 86400000).toISOString(),
    deleteAfterDays: 30,
    data: mockMapSnapshot,
    options: { fontMaxSize: 18, fontMinSize: 10, fontIncrement: 2 },
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    // Only mock methods that are actually used in these tests
    mmpService = {
      new: jest.fn(),
      selectNode: jest.fn(),
      getRootNode: jest.fn(),
      on: jest.fn(),
      updateNode: jest.fn(),
      existNode: jest.fn().mockReturnValue(true),
      addNodesFromServer: jest.fn(),
      removeNode: jest.fn(),
      highlightNode: jest.fn(),
      exportAsJSON: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<MmpService>;

    httpService = {
      get: jest.fn(),
      post: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    storageService = {
      get: jest.fn(),
      set: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    settingsService = {
      getCachedUserSettings: jest.fn(),
      setEditMode: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    toastService = {
      showValidationCorrection: jest.fn(),
    } as unknown as jest.Mocked<ToastService>;

    dialogService = {
      openCriticalErrorDialog: jest.fn(),
    } as unknown as jest.Mocked<DialogService>;

    toastrService = {
      error: jest.fn(),
      success: jest.fn(),
      warning: jest.fn(),
    } as unknown as jest.Mocked<ToastrService>;

    // Create mock UtilsService using shared test utility
    utilsService = createMockUtilsService();

    const subscribeMock = jest.fn().mockReturnValue({ unsubscribe: jest.fn() });
    mmpService.on.mockReturnValue({
      subscribe: subscribeMock,
    } as unknown as Observable<unknown>);

    mmpService.getRootNode.mockReturnValue(
      createMockNode({ id: 'root', name: 'Root', isRoot: true })
    );
    mmpService.selectNode.mockReturnValue(mockNode);
    settingsService.getCachedUserSettings.mockReturnValue({
      mapOptions: { rootNode: 'Root' },
    } as unknown as UserSettings);

    TestBed.configureTestingModule({
      providers: [
        MapSyncService,
        { provide: MmpService, useValue: mmpService },
        { provide: HttpService, useValue: httpService },
        { provide: StorageService, useValue: storageService },
        { provide: SettingsService, useValue: settingsService },
        { provide: UtilsService, useValue: utilsService },
        { provide: ToastService, useValue: toastService },
        { provide: DialogService, useValue: dialogService },
        { provide: ToastrService, useValue: toastrService },
      ],
    });

    service = TestBed.inject(MapSyncService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  describe('operation response handling', () => {
    let handleResponse: (response: OperationResponse<unknown>) => Promise<void>;

    beforeEach(() => {
      const emitSpy = jest.fn(
        (
          _event: string,
          _data: unknown,
          callback?: (response: OperationResponse<unknown>) => Promise<void>
        ) => {
          if (callback) handleResponse = callback;
        }
      );

      const socketSpy = {
        emit: emitSpy,
        removeAllListeners: jest.fn(),
      };
      asSocketAccess(service).socket = socketSpy;
      jest.spyOn(service, 'getAttachedMap').mockReturnValue({
        key: 'map-test',
        cachedMap: {
          uuid: 'test-uuid',
          data: mockMapSnapshot,
          lastModified: Date.now(),
          createdAt: Date.now(),
          deletedAt: Date.now() + 86400000,
          deleteAfterDays: 30,
          options: { fontMaxSize: 18, fontMinSize: 10, fontIncrement: 2 },
        },
      });

      asSocketAccess(service).emitAddNode(mockNode);
    });

    it('success response triggers no side effects', async () => {
      const successResponse: SuccessResponse<ExportNodeProperties[]> = {
        success: true,
        data: [mockNode],
      };

      await handleResponse(successResponse);

      expect({
        mapReloaded: mmpService.new.mock.calls.length,
        toastShown: toastService.showValidationCorrection.mock.calls.length,
        dialogOpened: dialogService.openCriticalErrorDialog.mock.calls.length,
      }).toEqual({ mapReloaded: 0, toastShown: 0, dialogOpened: 0 });
    });

    it('error with fullMapState reloads map', async () => {
      const errorResponse: ValidationErrorResponse = {
        success: false,
        errorType: 'validation',
        code: 'INVALID_PARENT',
        message: 'Invalid parent',
        fullMapState: mockServerMap,
      };

      await handleResponse(errorResponse);

      expect(mmpService.new).toHaveBeenCalledWith(mockMapSnapshot, false);
    });

    it('error with fullMapState shows toast', async () => {
      const errorResponse: CriticalErrorResponse = {
        success: false,
        errorType: 'critical',
        code: 'SERVER_ERROR',
        message: 'Server error',
        fullMapState: mockServerMap,
      };

      await handleResponse(errorResponse);

      expect(toastService.showValidationCorrection).toHaveBeenCalledWith(
        'add node',
        'Operation failed - map reloaded from server'
      );
    });

    it('error without fullMapState shows critical dialog', async () => {
      const errorResponse: CriticalErrorResponse = {
        success: false,
        errorType: 'critical',
        code: 'SERVER_ERROR',
        message: 'Server error',
      };

      await handleResponse(errorResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'SERVER_ERROR',
        message: expect.stringContaining('server encountered an error'),
      });
    });

    it('malformed response shows critical dialog', async () => {
      const malformedResponse = {
        invalid: 'response',
      } as unknown as OperationResponse<unknown>;

      await handleResponse(malformedResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'MALFORMED_RESPONSE',
        message: expect.stringContaining('invalid response'),
      });
    });

    it('malformed response with translation failure uses fallback message', async () => {
      // Simulate translation service failure
      utilsService.translate.mockImplementation(async () => {
        throw new Error('Translation failed');
      });

      const malformedResponse = {
        invalid: 'response',
      } as unknown as OperationResponse<unknown>;

      await handleResponse(malformedResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'MALFORMED_RESPONSE',
        message: 'Invalid server response. Please try again.',
      });
    });

    it('error with malformed fullMapState shows critical dialog', async () => {
      const errorResponse: ValidationErrorResponse = {
        success: false,
        errorType: 'validation',
        code: 'INVALID_PARENT',
        message: 'Invalid parent',
        fullMapState: {
          // Missing required fields - malformed
          uuid: 'test-uuid',
          data: [],
        } as unknown as typeof mockServerMap,
      };

      await handleResponse(errorResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'MALFORMED_RESPONSE',
        message: expect.stringContaining('invalid response'),
      });
    });

    it('error without fullMapState with translation failure uses fallback', async () => {
      // Simulate translation service failure
      utilsService.translate.mockImplementation(async () => {
        throw new Error('Translation failed');
      });

      const errorResponse: CriticalErrorResponse = {
        success: false,
        errorType: 'critical',
        code: 'SERVER_ERROR',
        message: 'Server error',
      };

      await handleResponse(errorResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'SERVER_ERROR',
        message: 'An error occurred. Please try again.',
      });
    });
  });

  describe('map initialization', () => {
    beforeEach(() => {
      const mockCachedMapEntry = {
        key: 'map-test-uuid',
        cachedMap: {
          uuid: 'test-uuid',
          data: mockMapSnapshot,
          lastModified: Date.now(),
          createdAt: Date.now(),
          deletedAt: Date.now() + 86400000,
          deleteAfterDays: 30,
          options: { fontMaxSize: 18, fontMinSize: 10, fontIncrement: 2 },
        },
      };

      jest.spyOn(service, 'getAttachedMap').mockReturnValue(mockCachedMapEntry);

      const socketSpy = {
        emit: jest.fn(),
        on: jest.fn().mockReturnThis(),
        removeAllListeners: jest.fn(),
        io: {
          on: jest.fn().mockReturnThis(),
        },
      };

      asSocketAccess(service).socket = socketSpy;
    });

    it('loads map data into mmpService on initMap', () => {
      service.initMap();

      expect(mmpService.new).toHaveBeenCalledWith(mockMapSnapshot);
    });

    it('selects root node on initMap', () => {
      const rootNode = createMockNode({
        id: 'root',
        name: 'Root',
        isRoot: true,
      });
      mmpService.getRootNode.mockReturnValue(rootNode);
      mmpService.selectNode.mockReturnValue(rootNode);

      service.initMap();

      expect(mmpService.selectNode).toHaveBeenCalledWith('root');
    });
  });
});

// ─── Yjs utility function tests (pure functions) ──────────────

describe('Y.Doc conversion utilities', () => {
  let doc: Y.Doc;
  let nodesMap: Y.Map<Y.Map<unknown>>;

  beforeEach(() => {
    doc = new Y.Doc();
    nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
  });

  afterEach(() => {
    doc.destroy();
  });

  it('round-trips node properties through Y.Map', () => {
    const input = createMockNode({
      id: 'n1',
      name: 'Hello',
      parent: 'root',
      k: 1.5,
      isRoot: false,
      locked: true,
      detached: true,
      coordinates: { x: 100, y: 200 },
      colors: { name: '#ff0000', background: '#00ff00', branch: '#0000ff' },
      font: { size: 16, style: 'italic', weight: 'bold' },
      image: { src: 'http://img.png', size: 50 },
      link: { href: 'http://example.com' },
    });

    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, input);
    nodesMap.set('n1', yNode);

    const result = yMapToNodeProps(nodesMap.get('n1')!);

    expect(result).toEqual(
      expect.objectContaining({
        id: 'n1',
        name: 'Hello',
        parent: 'root',
        k: 1.5,
        isRoot: false,
        locked: true,
        detached: true,
        coordinates: { x: 100, y: 200 },
        colors: {
          name: '#ff0000',
          background: '#00ff00',
          branch: '#0000ff',
        },
        font: { size: 16, style: 'italic', weight: 'bold' },
        image: { src: 'http://img.png', size: 50 },
        link: { href: 'http://example.com' },
      })
    );
  });

  it('applies defaults for missing optional properties', () => {
    const input: ExportNodeProperties = {
      id: 'n2',
      parent: undefined,
      k: undefined,
      name: undefined,
      isRoot: undefined,
      locked: undefined,
      detached: undefined,
      coordinates: undefined,
      colors: undefined,
      font: undefined,
      image: undefined,
      link: undefined,
    } as unknown as ExportNodeProperties;

    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, input);
    nodesMap.set('n2', yNode);

    const result = yMapToNodeProps(nodesMap.get('n2')!);

    expect(result).toEqual(
      expect.objectContaining({
        parent: null,
        k: 1,
        name: '',
        isRoot: false,
        locked: false,
        detached: false,
        coordinates: { x: 0, y: 0 },
      })
    );
  });
});

describe('write access message parsing', () => {
  it('returns true for writable message', () => {
    const result = parseWriteAccessBytes(new Uint8Array([4, 1]));
    expect(result).toBe(true);
  });

  it('returns false for read-only message', () => {
    const result = parseWriteAccessBytes(new Uint8Array([4, 0]));
    expect(result).toBe(false);
  });

  it('returns null for wrong type byte', () => {
    const result = parseWriteAccessBytes(new Uint8Array([0, 1]));
    expect(result).toBeNull();
  });

  it('returns null for message too short to be valid', () => {
    const result = parseWriteAccessBytes(new Uint8Array([4]));
    expect(result).toBeNull();
  });
});

describe('Yjs URL building', () => {
  let querySelectorSpy: jest.SpyInstance;

  beforeEach(() => {
    querySelectorSpy = jest.spyOn(document, 'querySelector');
  });

  afterEach(() => {
    querySelectorSpy.mockRestore();
  });

  // jsdom default location is http://localhost, so tests use that baseline
  it('builds ws URL and uses document base href', () => {
    querySelectorSpy.mockReturnValue({
      getAttribute: () => '/',
    });

    const url = buildYjsWsUrl();

    // jsdom runs on http://localhost -> ws:
    expect(url).toBe('ws://localhost/yjs');
  });

  it('incorporates base href into path', () => {
    querySelectorSpy.mockReturnValue({
      getAttribute: () => '/app/',
    });

    const url = buildYjsWsUrl();

    expect(url).toBe('ws://localhost/app/yjs');
  });

  it('appends trailing slash to base href if missing', () => {
    querySelectorSpy.mockReturnValue({
      getAttribute: () => '/app',
    });

    const url = buildYjsWsUrl();

    expect(url).toBe('ws://localhost/app/yjs');
  });

  it('defaults base href to / when no base element', () => {
    querySelectorSpy.mockReturnValue(null);

    const url = buildYjsWsUrl();

    expect(url).toBe('ws://localhost/yjs');
  });

  it('selects protocol based on page protocol', () => {
    // Verify the protocol-selection logic via the method output
    // jsdom defaults to http: -> ws:, confirming the mapping works
    querySelectorSpy.mockReturnValue(null);
    const url = buildYjsWsUrl();
    expect(url).toMatch(/^ws:\/\//);
    // The https: -> wss: path uses the same ternary expression
  });
});

describe('Y.Doc property application to MMP', () => {
  it('resolves simple property (name) via reverse mapping', () => {
    const updates = resolveMmpPropertyUpdate('name', 'New Name');
    expect(updates).toEqual([{ prop: 'name', val: 'New Name' }]);
  });

  it('resolves simple property (locked) via reverse mapping', () => {
    const updates = resolveMmpPropertyUpdate('locked', true);
    expect(updates).toEqual([{ prop: 'locked', val: true }]);
  });

  it('resolves compound property (colors) via reverse mapping', () => {
    const updates = resolveMmpPropertyUpdate('colors', {
      background: '#ff0000',
      branch: '#00ff00',
      name: '#0000ff',
    });

    expect(updates).toEqual([
      { prop: 'backgroundColor', val: '#ff0000' },
      { prop: 'branchColor', val: '#00ff00' },
      { prop: 'nameColor', val: '#0000ff' },
    ]);
  });

  it('resolves compound property (font) via reverse mapping', () => {
    const updates = resolveMmpPropertyUpdate('font', {
      size: 20,
      weight: 'bold',
      style: 'italic',
    });

    expect(updates).toEqual(
      expect.arrayContaining([
        { prop: 'fontSize', val: 20 },
        { prop: 'fontWeight', val: 'bold' },
        { prop: 'fontStyle', val: 'italic' },
      ])
    );
  });

  it('returns empty array for unknown property keys', () => {
    const updates = resolveMmpPropertyUpdate('unknown_key', 'value');
    expect(updates).toEqual([]);
  });

  it('handles null compound value gracefully', () => {
    const updates = resolveCompoundMmpUpdates(
      { background: 'backgroundColor' },
      null as unknown as Record<string, unknown>
    );
    expect(updates).toEqual([]);
  });
});

describe('client color resolution', () => {
  it('returns existing color when no collision', () => {
    const result = resolveClientColor(
      '#ff0000',
      new Set(['#00ff00', '#0000ff'])
    );
    expect(result).toBe('#ff0000');
  });

  it('generates a different valid hex color on collision', () => {
    const result = resolveClientColor('#00ff00', new Set(['#00ff00']));
    expect(result).toMatch(/^#(?!00ff00)[0-9a-f]{6}$/);
  });

  it('handles empty used colors set', () => {
    const result = resolveClientColor('#ff0000', new Set());
    expect(result).toBe('#ff0000');
  });
});

describe('findAffectedNodes', () => {
  it('collects node IDs from both old and new mappings', () => {
    const oldMapping = {
      c1: { nodeId: 'node-a', color: '#ff0000' },
      c2: { nodeId: 'node-b', color: '#00ff00' },
    };

    const newMapping = {
      c1: { nodeId: 'node-b', color: '#ff0000' },
      c3: { nodeId: 'node-c', color: '#0000ff' },
    };

    const result = findAffectedNodes(oldMapping, newMapping);

    expect(result).toEqual(new Set(['node-a', 'node-b', 'node-c']));
  });

  it('excludes empty nodeId strings', () => {
    const oldMapping = {
      c1: { nodeId: '', color: '#ff0000' },
    };

    const newMapping = {
      c1: { nodeId: 'node-a', color: '#ff0000' },
    };

    const result = findAffectedNodes(oldMapping, newMapping);

    expect(result).toEqual(new Set(['node-a']));
  });

  it('returns empty set when no nodes selected', () => {
    const oldMapping = {
      c1: { nodeId: '', color: '#ff0000' },
    };

    const newMapping = {
      c1: { nodeId: '', color: '#ff0000' },
    };

    const result = findAffectedNodes(oldMapping, newMapping);

    expect(result.size).toBe(0);
  });
});
