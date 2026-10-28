import { TestBed } from '@angular/core/testing';
import {
  AdditionalMapOptions,
  MmpService,
  NODE_FONT_FAMILY,
} from './mmp.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import * as mmp from '@teammapper/mmp';
import { Subject } from 'rxjs';
import type { MapData, MmpInstance, OptionParameters } from '@teammapper/mmp';
import type { MapNodeSettings, UserMapOptions } from '@teammapper/shared';
import { ImageUploadError } from './node-images';

jest.mock('dompurify', () => {
  return {
    __esModule: true,
    default: {
      sanitize: jest.fn((str: string) => str),
    },
  };
});

jest.mock('@teammapper/mmp', () => ({
  create: jest.fn(),
}));

const REFERENCE = 'image:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

// mmp is mocked, so the map data only has to be passed through.
const DATA: MapData = {
  node: () => undefined,
  nodes: () => [],
  mainRootId: () => null,
  addNodes: jest.fn(),
  updateNode: jest.fn(),
  removeNode: jest.fn(),
  replaceMap: jest.fn(),
  arrows: () => [],
  addArrows: jest.fn(),
  removeArrow: jest.fn(),
  batch: change => change(),
  subscribe: () => () => undefined,
};

/** The text of a blob, which jsdom cannot read through `Blob.text`. */
const blobText = (blob: Blob | null): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!blob) {
      reject(new Error('The export wrote no blob'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

const downloadFileSpy = jest
  .spyOn(UtilsService, 'downloadFile')
  .mockImplementation(jest.fn());

describe('MmpService', () => {
  let service: MmpService;
  let settingsService: Partial<jest.Mocked<SettingsService>>;
  let utilsService: Partial<jest.Mocked<UtilsService>>;
  let toastrService: Partial<jest.Mocked<ToastrService>>;
  let editModeSubject: Subject<boolean>;

  const mockMap = {
    destroy: jest.fn(),
    new: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    exportAsJSON: jest.fn(),
    exportAsImage: jest.fn(),
    center: jest.fn(),
    on: jest.fn(),
    addNode: jest.fn(),
    selectNode: jest.fn(),
    exportRootProperties: jest.fn(),
    existNode: jest.fn(),
    highlightNode: jest.fn(),
    editNode: jest.fn(),
    getSelectedNode: jest.fn(),
    updateNode: jest.fn(),
    removeNode: jest.fn(),
    copyNode: jest.fn(),
    cutNode: jest.fn(),
    pasteNode: jest.fn(),
    pasteTree: jest.fn(),
    toggleBranchVisibility: jest.fn(),
    childNodesHidden: jest.fn(),
    distributeNodes: jest.fn(),
    nodeChildren: jest.fn(),
    addTree: jest.fn(),
    protectBranch: jest.fn(),
    protectingNode: jest.fn(),
    releaseBranch: jest.fn(),
    updateOption: jest.fn(),
    setEditable: jest.fn(),
    applyCoordinatesToMapSnapshot: jest.fn((nodes: unknown) => nodes),
    getArrows: jest.fn().mockReturnValue([]),
    getSelectedArrow: jest.fn(),
    removeArrow: jest.fn(),
    startArrowMode: jest.fn(),
    stopArrowMode: jest.fn(),
    isArrowMode: jest.fn(),
  };

  /** Create the map with no options over `DATA`. */
  const createMap = () =>
    service.create(document.createElement('div'), undefined, DATA);

  beforeEach(() => {
    (mmp.create as jest.Mock).mockReturnValue(mockMap);
    editModeSubject = new Subject<boolean>();

    settingsService = {
      getEditModeObservable: jest.fn().mockReturnValue(editModeSubject),
      getCachedUserSettings: jest.fn().mockReturnValue({
        mapOptions: {
          autoBranchColors: false,
        },
      }),
      getDefaultSettings: jest.fn().mockResolvedValue({
        userSettings: {
          mapOptions: {
            fontMinSize: 12,
            fontMaxSize: 24,
            fontIncrement: 2,
          },
        },
      }),
    };

    utilsService = {
      translate: jest.fn().mockResolvedValue('translated-text'),
    };

    toastrService = {
      success: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warning: jest.fn(),
      findDuplicate: jest.fn().mockReturnValue(null),
    };

    TestBed.configureTestingModule({
      providers: [
        MmpService,
        { provide: SettingsService, useValue: settingsService },
        { provide: UtilsService, useValue: utilsService },
        { provide: ToastrService, useValue: toastrService },
      ],
    });

    service = TestBed.inject(MmpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    downloadFileSpy.mockClear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('reports no selected node before create', () => {
    expect(service.hasSelectedNode()).toBe(false);
  });

  describe('before create', () => {
    it('answers the template and presence queries with defaults', () => {
      service.highlightNode('node', '#ff0000');
      service.addNode();
      service.moveNodeTo('left');

      expect({
        selected: service.selectNode('left'),
        hasSelected: service.hasSelectedNode(),
        exists: service.existNode('node'),
        protecting: service.protectingNode(),
        hidden: service.childNodesHidden(),
      }).toEqual({
        selected: null,
        hasSelected: false,
        exists: false,
        protecting: null,
        hidden: false,
      });
    });

    it.each([
      ['zoomIn', () => service.zoomIn()],
      ['center', () => service.center()],
      ['addTree', () => service.addTree()],
      ['editNode', () => service.editNode()],
      ['toggleBranchVisibility', () => service.toggleBranchVisibility()],
      ['toggleBranchProtection', () => service.toggleBranchProtection()],
      ['distributeNodes', () => service.distributeNodes()],
      ['getRootNode', () => service.getRootNode()],
    ])(
      'throws for the command %s, which waits for mapCreated$',
      (_, command) => {
        expect(command).toThrow('No mind map has been created yet');
      }
    );

    it.each([
      ['updateNode', () => service.updateNode('fontSize', 14)],
      ['removeNode', () => service.removeNode('node')],
      ['copyNode', () => service.copyNode('node')],
      ['cutNode', () => service.cutNode('node')],
      ['pasteNode', () => service.pasteNode()],
    ])('rejects the command %s without a toast', async (_, command) => {
      await expect(command()).rejects.toThrow(
        'No mind map has been created yet'
      );
      expect(toastrService.error).not.toHaveBeenCalled();
    });

    it('rejects an import and an export', async () => {
      await expect(service.new([])).rejects.toThrow(
        'No mind map has been created yet'
      );
      await expect(service.exportMap('json')).rejects.toThrow(
        'No mind map has been created yet'
      );
      expect(downloadFileSpy).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a new mind map', async () => {
      const element = document.createElement('div');
      const options: OptionParameters = { zoom: true };
      editModeSubject.next(true);

      const created = await service.create(element, options, DATA);

      expect(created).toBe(mockMap);
      expect(mmp.create).toHaveBeenCalledWith(
        element,
        DATA,
        expect.objectContaining({ ...options, edit: true, drag: true })
      );
    });

    it('creates the map with an edit mode reported before it existed', async () => {
      editModeSubject.next(false);

      await service.create(
        document.createElement('div'),
        { drag: true, edit: true },
        DATA
      );

      expect(mmp.create).toHaveBeenCalledWith(
        expect.anything(),
        DATA,
        expect.objectContaining({ edit: false, drag: false })
      );
    });

    it('creates a read-only map while the edit mode is unknown', async () => {
      await service.create(document.createElement('div'), {}, DATA);

      expect(mmp.create).toHaveBeenCalledWith(
        expect.anything(),
        DATA,
        expect.objectContaining({ edit: false, drag: false })
      );
    });

    it('applies an edit mode reported after the map existed', async () => {
      await service.create(document.createElement('div'), {}, DATA);

      editModeSubject.next(true);

      expect(mockMap.setEditable).toHaveBeenCalledWith(true);
    });

    describe('with an instance that offers setEditable', () => {
      // The flat shape `create` of @teammapper/mmp returns after the refactor:
      // the instance itself, with no `instance` or `options` member.
      const makeInstance = () => ({
        destroy: jest.fn(),
        on: jest.fn(),
        setEditable: jest.fn(),
      });

      it('makes the instance editable when the edit mode turns on', async () => {
        const instance = makeInstance();
        (mmp.create as jest.Mock).mockReturnValueOnce(instance);
        await service.create(document.createElement('div'), {}, DATA);

        editModeSubject.next(true);

        expect(instance.setEditable).toHaveBeenCalledWith(true);
      });

      it('makes the instance read-only when the edit mode turns off', async () => {
        const instance = makeInstance();
        (mmp.create as jest.Mock).mockReturnValueOnce(instance);
        await service.create(document.createElement('div'), {}, DATA);

        editModeSubject.next(false);

        expect(instance.setEditable).toHaveBeenCalledWith(false);
      });
    });

    it('creates no map for a create a newer create overtook', async () => {
      const newerMap = { ...mockMap, destroy: jest.fn() };
      (mmp.create as jest.Mock).mockReturnValueOnce(newerMap);

      const late = service.create(document.createElement('div'), {}, DATA);
      const newer = service.create(document.createElement('div'), {}, DATA);

      await expect(late).resolves.toBeNull();
      await expect(newer).resolves.toBe(newerMap);
      expect(mmp.create).toHaveBeenCalledTimes(1);
      service.remove();
      expect(newerMap.destroy).toHaveBeenCalled();
    });

    describe('over a leftover map', () => {
      const secondMap = () => ({ ...mockMap, destroy: jest.fn() });

      it('destroys the leftover map once before it creates the new one', async () => {
        const first = secondMap();
        const second = secondMap();
        (mmp.create as jest.Mock)
          .mockReturnValueOnce(first)
          .mockReturnValueOnce(second);

        await createMap();
        await createMap();

        expect(first.destroy).toHaveBeenCalledTimes(1);
        expect(second.destroy).not.toHaveBeenCalled();
      });

      it('keeps the new map as the current map', async () => {
        const first = secondMap();
        const second = secondMap();
        (mmp.create as jest.Mock)
          .mockReturnValueOnce(first)
          .mockReturnValueOnce(second);
        await createMap();
        await createMap();

        service.remove();

        expect(second.destroy).toHaveBeenCalledTimes(1);
        expect(first.destroy).toHaveBeenCalledTimes(1);
      });
    });

    it('creates no map once remove ran during the create', async () => {
      const pending = service.create(document.createElement('div'), {}, DATA);
      service.remove();

      await expect(pending).resolves.toBeNull();
      expect(mmp.create).not.toHaveBeenCalled();
    });

    it('removes a map that is not the current one and keeps the current one', async () => {
      const stale = { destroy: jest.fn() };
      await service.create(document.createElement('div'), {}, DATA);
      service.markMapCreated();
      const reported: boolean[] = [];
      service.mapCreated$.subscribe(created => reported.push(created));

      service.remove(stale as unknown as MmpInstance);

      expect(stale.destroy).toHaveBeenCalled();
      expect(mockMap.destroy).not.toHaveBeenCalled();
      expect(reported).toEqual([true]);
    });

    it('reports the map created once marked, and no longer after remove', async () => {
      const reported: boolean[] = [];
      service.mapCreated$.subscribe(created => reported.push(created));

      await service.create(document.createElement('div'), {}, DATA);
      service.markMapCreated();
      service.remove();

      expect(reported).toEqual([false, true, false]);
    });

    it('draws node names in the font the app ships', async () => {
      await createMap();
      const passed: OptionParameters = (mmp.create as jest.Mock).mock
        .calls[0][2];

      expect(passed.fontFamily).toBe(NODE_FONT_FAMILY);
    });

    it('passes a resolver that asks the registered image handlers', async () => {
      const resolveUrl = jest.fn().mockReturnValue('api/maps/m/images/i');
      service.registerImageHandlers({ resolveUrl, upload: jest.fn() });

      await createMap();
      const passed: OptionParameters = (mmp.create as jest.Mock).mock
        .calls[0][2];

      expect(passed.resolveImageUrl?.(REFERENCE)).toBe('api/maps/m/images/i');
      expect(resolveUrl).toHaveBeenCalledWith(REFERENCE);
    });

    it('should initialize additional options with defaults', async () => {
      const element = document.createElement('div');

      await service.create(element, undefined, DATA);

      const additionalOptions = service.getAdditionalMapOptions();
      expect(additionalOptions).toEqual({
        fontMinSize: 12,
        fontMaxSize: 24,
        fontIncrement: 2,
      });
    });
  });

  describe('updateAdditionalMapOptions', () => {
    it('keeps the stored map settings and fills missing ones with defaults', async () => {
      await createMap();

      service.updateAdditionalMapOptions({ fontMaxSize: 70, fontIncrement: 5 });

      expect(service.getAdditionalMapOptions()).toEqual({
        fontMinSize: 12,
        fontMaxSize: 70,
        fontIncrement: 5,
      });
    });

    it('resets the map settings of the previous map on the next create', async () => {
      await createMap();
      service.updateAdditionalMapOptions({ fontMaxSize: 70, fontIncrement: 5 });

      await createMap();

      expect(service.getAdditionalMapOptions()).toEqual({
        fontMinSize: 12,
        fontMaxSize: 24,
        fontIncrement: 2,
      });
    });

    it('emits the new map settings to subscribers', async () => {
      await createMap();
      const emitted: (AdditionalMapOptions | null)[] = [];
      service.additionalMapOptions$.subscribe(options => emitted.push(options));

      service.updateAdditionalMapOptions({ fontMaxSize: 70 });

      expect(emitted[emitted.length - 1]?.fontMaxSize).toBe(70);
    });

    it('ignores map settings before a map exists', () => {
      service.updateAdditionalMapOptions({ fontMaxSize: 70 });

      expect(service.getAdditionalMapOptions()).toBeNull();
    });
  });

  describe('updateUserMapOptions', () => {
    const node = (name: string): MapNodeSettings => ({
      name,
      link: { href: '' },
      image: { src: '', size: 60 },
      colors: { name: '', background: '', branch: '', link: '' },
      font: { size: 16, style: 'normal', weight: 'normal' },
    });
    const userMapOptions = (): UserMapOptions => ({
      centerOnResize: true,
      autoBranchColors: false,
      showLinktext: false,
      branchStyle: 'curved',
      fontMaxSize: 70,
      fontMinSize: 15,
      fontIncrement: 5,
      defaultNode: node('New node'),
      rootNode: node('New root'),
    });

    it.each<[string, unknown]>([
      ['centerOnResize', true],
      ['showLinktext', false],
      ['branchStyle', 'curved'],
      ['defaultNode', node('New node')],
      ['rootNode', node('New root')],
    ])('hands %s to the open map', async (property, value) => {
      await createMap();
      mockMap.updateOption.mockClear();

      service.updateUserMapOptions(userMapOptions());

      expect(mockMap.updateOption).toHaveBeenCalledWith(property, value);
    });

    it('ignores the user settings before a map exists', () => {
      expect(() =>
        service.updateUserMapOptions(userMapOptions())
      ).not.toThrow();
      expect(mockMap.updateOption).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove the current map', async () => {
      await createMap();
      service.remove();

      expect(mockMap.destroy).toHaveBeenCalled();
    });

    it('should do nothing if no map exists', () => {
      service.remove();
      expect(mockMap.destroy).not.toHaveBeenCalled();
    });
  });

  describe('importMap', () => {
    let newSpy: jest.SpyInstance;
    const nodes = [{ id: 'a', parent: null, isRoot: true, name: 'Root' }];

    beforeEach(async () => {
      await createMap();
      newSpy = jest.spyOn(service, 'new').mockResolvedValue(undefined);
    });

    it('replaces the map with the nodes of a valid JSON array and no arrows', async () => {
      await service.importMap(JSON.stringify(nodes));

      expect(newSpy).toHaveBeenCalledTimes(1);
      expect(newSpy).toHaveBeenCalledWith(nodes, []);
    });

    it('rejects JSON that does not parse', async () => {
      await expect(service.importMap('{not json')).rejects.toThrow();
    });

    it('does not replace the map with JSON that does not parse', async () => {
      await service.importMap('{not json').catch(() => undefined);

      expect(newSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['an object', '{"id":"a"}'],
      ['a string', '"text"'],
      ['a number', '1'],
      ['null', 'null'],
    ])('rejects JSON that is %s and not an array', async (_, json) => {
      await expect(service.importMap(json)).rejects.toThrow();
    });

    it.each([
      ['null', '[null]'],
      ['a number', '[1]'],
      ['a string', '["a"]'],
    ])('rejects an array with %s as a node', async (_, json) => {
      await expect(service.importMap(json)).rejects.toThrow();
    });

    it('does not replace the map when one element is not a node', async () => {
      const json = JSON.stringify([...nodes, null]);

      await service.importMap(json).catch(() => undefined);

      expect(newSpy).not.toHaveBeenCalled();
    });
  });

  describe('node operations', () => {
    beforeEach(async () => {
      await createMap();
    });

    describe('addNode', () => {
      beforeEach(() => {
        mockMap.selectNode.mockReturnValue({ id: 'selected' });
      });

      it('should add a node with default properties', () => {
        service.addNode();
        expect(mockMap.addNode).toHaveBeenCalledWith({ name: '' }, 'selected');
      });

      it('gives the new node the branch color of the selected node', () => {
        mockMap.selectNode.mockReturnValue({
          id: 'selected',
          colors: { branch: '#123456' },
        });

        service.addNode();

        expect(mockMap.addNode).toHaveBeenCalledWith(
          { name: '', colors: { branch: '#123456' } },
          'selected'
        );
      });

      it('selects the new node and edits its name', () => {
        mockMap.addNode.mockReturnValue({ id: 'new' });

        service.addNode();

        expect(mockMap.selectNode).toHaveBeenLastCalledWith('new');
        expect(mockMap.editNode).toHaveBeenCalled();
      });

      it('edits nothing when mmp refuses the node', () => {
        mockMap.addNode.mockReturnValue(null);

        service.addNode();

        expect(mockMap.editNode).not.toHaveBeenCalled();
      });

      it('adds no child with nothing selected', () => {
        mockMap.selectNode.mockReturnValue(null);

        service.addNode();

        expect(mockMap.addNode).not.toHaveBeenCalled();
      });

      it('attaches the new node to a selected root outside the main tree', () => {
        mockMap.selectNode.mockReturnValue({
          id: 'second-root',
          parent: null,
          isRoot: false,
        });
        service.addNode();
        expect(mockMap.addNode).toHaveBeenCalledWith(
          { name: '' },
          'second-root'
        );
      });
    });

    describe('addTree', () => {
      it('lets mmp add the tree and edits the name of its root', () => {
        mockMap.addTree.mockReturnValue({ id: 'tree' });

        service.addTree();

        expect(mockMap.addTree).toHaveBeenCalled();
        expect(mockMap.editNode).toHaveBeenCalled();
      });

      it('edits nothing when mmp adds no tree', () => {
        mockMap.addTree.mockReturnValue(null);

        service.addTree();

        expect(mockMap.editNode).not.toHaveBeenCalled();
      });
    });

    describe('selectNode', () => {
      it('should select node by id', () => {
        const nodeId = 'test-node';
        service.selectNode(nodeId);
        expect(mockMap.selectNode).toHaveBeenCalledWith(nodeId);
      });

      it('should select node by direction', () => {
        service.selectNode('left');
        expect(mockMap.selectNode).toHaveBeenCalledWith('left');
      });
    });

    describe('hasSelectedNode', () => {
      it('reports a selected node', () => {
        mockMap.getSelectedNode.mockReturnValue({ id: 'selected' });

        expect(service.hasSelectedNode()).toBe(true);
      });
    });

    describe('branch protection', () => {
      const notifyProtected = async () => {
        const [, callback] = mockMap.on.mock.calls.find(
          ([event]) => event === 'nodeProtected'
        );
        callback();
        await new Promise(resolve => setTimeout(resolve));
      };

      it('protects the branch of an unprotected node', () => {
        mockMap.protectingNode.mockReturnValue(null);

        service.toggleBranchProtection();

        expect(mockMap.protectBranch).toHaveBeenCalled();
        expect(mockMap.releaseBranch).not.toHaveBeenCalled();
      });

      it('releases the branch of a protected node', () => {
        mockMap.protectingNode.mockReturnValue('parent-id');

        service.toggleBranchProtection();

        expect(mockMap.releaseBranch).toHaveBeenCalled();
      });

      it('shows the notice when mmp refuses an edit', async () => {
        await notifyProtected();

        expect(utilsService.translate).toHaveBeenCalledWith(
          'TOASTS.WARNINGS.NODE_PROTECTED'
        );
        expect(toastrService.warning).toHaveBeenCalledWith('translated-text');
      });

      it('does not repeat a notice still on screen', async () => {
        toastrService.findDuplicate?.mockReturnValue(
          {} as ReturnType<ToastrService['findDuplicate']>
        );

        await notifyProtected();

        expect(toastrService.warning).not.toHaveBeenCalled();
      });

      it('reports no success for a refused cut', async () => {
        mockMap.getSelectedNode.mockReturnValue({ id: 'selected' });
        mockMap.cutNode.mockReturnValue(false);

        await service.cutNode();

        expect(toastrService.success).not.toHaveBeenCalled();
      });
    });

    describe('copyNode and cutNode with nothing selected', () => {
      beforeEach(() => {
        mockMap.getSelectedNode.mockReturnValue(null);
      });

      it('copies nothing and reports no success', async () => {
        await service.copyNode();

        expect(mockMap.copyNode).not.toHaveBeenCalled();
        expect(toastrService.success).not.toHaveBeenCalled();
      });

      it('cuts nothing and reports no success', async () => {
        await service.cutNode();

        expect(mockMap.cutNode).not.toHaveBeenCalled();
        expect(toastrService.success).not.toHaveBeenCalled();
      });

      it('copies a node named by id', async () => {
        await service.copyNode('test-node');

        expect(mockMap.copyNode).toHaveBeenCalledWith('test-node');
      });
    });

    describe('pasteNode', () => {
      it('pastes as a tree with nothing selected', async () => {
        mockMap.getSelectedNode.mockReturnValue(null);

        await service.pasteNode();

        expect(mockMap.pasteTree).toHaveBeenCalled();
        expect(mockMap.pasteNode).not.toHaveBeenCalled();
      });

      it('pastes under the selected node', async () => {
        mockMap.getSelectedNode.mockReturnValue({ id: 'selected' });

        await service.pasteNode();

        expect(mockMap.pasteTree).not.toHaveBeenCalled();
        expect(mockMap.pasteNode).toHaveBeenCalledWith(undefined);
      });

      it('pastes under a node named by id with nothing selected', async () => {
        mockMap.getSelectedNode.mockReturnValue(null);

        await service.pasteNode('target');

        expect(mockMap.pasteNode).toHaveBeenCalledWith('target');
      });

      it('reports an empty clipboard on a tree paste', async () => {
        mockMap.getSelectedNode.mockReturnValue(null);
        mockMap.pasteTree.mockImplementationOnce(() => {
          throw new Error('There are not nodes in the mmp clipboard');
        });

        await service.pasteNode();

        expect(utilsService.translate).toHaveBeenCalledWith(
          'TOASTS.ERRORS.NO_NODES_IN_CLIPBOARD'
        );
      });
    });

    describe('moveNodeTo', () => {
      it('moves nothing with nothing selected', () => {
        mockMap.selectNode.mockReturnValue(null);

        service.moveNodeTo('left');

        expect(mockMap.updateNode).not.toHaveBeenCalled();
      });

      it('writes the moved coordinates of the selected node to the data', () => {
        mockMap.selectNode.mockReturnValue({
          id: 'selected',
          coordinates: { x: 100, y: 50 },
        });

        service.moveNodeTo('up', 20);

        expect(mockMap.updateNode).toHaveBeenCalledWith('coordinates', {
          x: 100,
          y: 30,
        });
      });
    });

    describe('copyNode', () => {
      it('should copy node successfully', async () => {
        await service.copyNode('test-node');
        expect(mockMap.copyNode).toHaveBeenCalledWith('test-node');
        expect(toastrService.success).toHaveBeenCalledWith('translated-text');
      });

      it('should handle root node copy error', async () => {
        mockMap.copyNode.mockImplementation(() => {
          throw new Error('The root node can not be copied');
        });

        await service.copyNode('root-node');
        expect(toastrService.error).toHaveBeenCalledWith('translated-text');
      });
    });
  });

  describe('export operations', () => {
    beforeEach(async () => {
      await createMap();
    });

    describe('exportMap', () => {
      beforeEach(() => {
        mockMap.exportRootProperties.mockReturnValue({
          name: 'Test Map',
        });
      });

      it('exports a map without a main root under an empty name', async () => {
        mockMap.exportRootProperties.mockReturnValue(null);
        mockMap.exportAsJSON.mockReturnValue([]);

        const result = await service.exportMap('json');

        expect(result.success).toBe(true);
        expect(downloadFileSpy.mock.calls[0][0]).toBe('.json');
      });

      it('should export to JSON', async () => {
        mockMap.exportAsJSON.mockReturnValue([{ id: 'root' }]);

        const result = await service.exportMap('json');

        expect(result.success).toBe(true);
        expect(downloadFileSpy).toHaveBeenCalled();
      });

      describe('JSON with image references', () => {
        const DATA_URL = 'data:image/png;base64,aW1hZ2U=';
        const originalFetch = global.fetch;

        const nodeWith = (id: string, src: string) => ({
          id,
          image: { src, size: 60 },
        });

        const downloadedJson = (): string => {
          const uri: string = downloadFileSpy.mock.calls[0][1];
          return decodeURIComponent(uri.replace(/^data:[^,]*,/, ''));
        };

        beforeEach(async () => {
          await createMap();
          service.registerImageHandlers({
            resolveUrl: jest.fn().mockReturnValue('api/maps/m/images/i'),
            upload: jest.fn(),
          });
        });

        afterEach(() => {
          global.fetch = originalFetch;
        });

        it('inlines each referenced image as a data URL', async () => {
          global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            blob: () =>
              Promise.resolve(new Blob(['image'], { type: 'image/png' })),
          });
          mockMap.exportAsJSON.mockReturnValue([
            nodeWith('a', REFERENCE),
            nodeWith('b', DATA_URL),
          ]);

          await service.exportMap('json');

          const json = downloadedJson();
          expect(json).not.toContain('image:');
          expect(JSON.parse(json)).toEqual({
            nodes: [nodeWith('a', DATA_URL), nodeWith('b', DATA_URL)],
            arrows: [],
          });
        });

        it('drops an image the endpoint answers with 404', async () => {
          global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: false, status: 404 });
          mockMap.exportAsJSON.mockReturnValue([nodeWith('a', REFERENCE)]);

          const result = await service.exportMap('json');

          expect(result.success).toBe(true);
          expect(downloadedJson()).not.toContain('image:');
          expect(JSON.parse(downloadedJson())).toEqual({
            nodes: [nodeWith('a', '')],
            arrows: [],
          });
        });

        it('writes the nodes and every arrow of the map', async () => {
          mockMap.exportAsJSON.mockReturnValue([
            nodeWith('a', DATA_URL),
            nodeWith('b', DATA_URL),
          ]);
          mockMap.getArrows.mockReturnValue([{ source: 'a', target: 'b' }]);

          await service.exportMap('json');

          expect(JSON.parse(downloadedJson()).arrows).toEqual([
            { source: 'a', target: 'b' },
          ]);
          mockMap.getArrows.mockReturnValue([]);
        });

        it('writes the arrows the map held when the export captured its nodes', async () => {
          mockMap.exportAsJSON.mockReturnValue([
            nodeWith('a', REFERENCE),
            nodeWith('b', DATA_URL),
          ]);
          mockMap.getArrows.mockReturnValue([{ source: 'a', target: 'b' }]);
          global.fetch = jest.fn().mockImplementation(() => {
            mockMap.getArrows.mockReturnValue([]);
            return Promise.resolve({ ok: false, status: 404 });
          });

          await service.exportMap('json');

          expect(JSON.parse(downloadedJson()).arrows).toEqual([
            { source: 'a', target: 'b' },
          ]);
        });
      });

      it('should export to PNG', async () => {
        mockMap.exportAsImage.mockImplementation(callback => {
          callback('data:image/png;base64,test');
        });

        const result = await service.exportMap('png');

        expect(result.success).toBe(true);
        expect(downloadFileSpy).toHaveBeenCalled();
      });

      describe('to Mermaid', () => {
        const root = { id: 'root', parent: '', name: 'Root', isRoot: true };
        const second = { id: 'second', parent: '', name: 'Second' };

        let clickSpy: jest.SpyInstance;

        beforeEach(() => {
          URL.createObjectURL = jest.fn().mockReturnValue('blob:test');
          URL.revokeObjectURL = jest.fn();
          clickSpy = jest
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockReturnValue(undefined);
        });

        afterEach(() => {
          clickSpy.mockRestore();
        });

        it('warns that a map with two trees exports two blocks', async () => {
          mockMap.exportAsJSON.mockReturnValue([root, second]);

          const result = await service.exportMap('mermaid');

          expect(result.success).toBe(true);
          expect(utilsService.translate).toHaveBeenCalledWith(
            'TOASTS.WARNINGS.MERMAID_SEVERAL_TREES'
          );
          expect(toastrService.info).toHaveBeenCalledWith('translated-text');
        });

        it('shows no warning for a map with one tree', async () => {
          mockMap.exportAsJSON.mockReturnValue([root]);

          await service.exportMap('mermaid');

          expect(toastrService.info).not.toHaveBeenCalled();
        });

        it('leaves the arrows of the map out of the output', async () => {
          let written: Blob | null = null;
          URL.createObjectURL = jest.fn((blob: Blob) => {
            written = blob;
            return 'blob:test';
          });
          mockMap.exportAsJSON.mockReturnValue([root, second]);
          mockMap.getArrows.mockReturnValue([
            { source: 'root', target: 'second' },
          ]);

          await service.exportMap('mermaid');

          const text = await blobText(written);
          mockMap.getArrows.mockReturnValue([]);
          expect({
            blocks: text.split('mindmap').length - 1,
            hasArrow: text.includes('root:second') || text.includes('->'),
          }).toEqual({ blocks: 2, hasArrow: false });
        });
      });
    });
  });

  describe('on', () => {
    const removeCallback = jest.fn();
    const changeCallbacks = new Set<(payload: string) => void>();

    beforeEach(async () => {
      await createMap();
      changeCallbacks.clear();
      removeCallback.mockClear();
      mockMap.on.mockImplementation(
        (event: string, callback: (payload: string) => void) => {
          if (event !== 'mapChange') return undefined;
          changeCallbacks.add(callback);
          return () => {
            removeCallback();
            changeCallbacks.delete(callback);
          };
        }
      );
    });

    afterEach(() => {
      mockMap.on.mockReset();
    });

    const emitChange = (payload: string) =>
      changeCallbacks.forEach(callback => callback(payload));

    it('gives every subscriber of an event the payload', () => {
      const first = jest.fn();
      const second = jest.fn();
      service.on('mapChange').subscribe(first);
      service.on('mapChange').subscribe(second);

      emitChange('change');

      expect(first).toHaveBeenCalledWith('change');
      expect(second).toHaveBeenCalledWith('change');
    });

    it('removes the mmp callback of an unsubscribed subscriber only', () => {
      const first = jest.fn();
      const second = jest.fn();
      const subscription = service.on('mapChange').subscribe(first);
      service.on('mapChange').subscribe(second);

      subscription.unsubscribe();
      emitChange('change');

      expect(removeCallback).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith('change');
    });
  });

  describe('arrows', () => {
    const arrow = { source: 'a', target: 'b' };

    beforeEach(async () => {
      await createMap();
    });

    const imported = [{ id: '11111111-1111-4111-8111-111111111111' } as never];

    it('imports the nodes together with the arrows', async () => {
      await service.new(imported, [arrow]);

      expect(mockMap.new).toHaveBeenCalledWith(imported, [arrow]);
    });

    it('imports with no arrows when the caller passes none', async () => {
      await service.new(imported);

      expect(mockMap.new).toHaveBeenCalledWith(imported, []);
    });

    it('imports the nodes and arrows of an export file', async () => {
      const a = '11111111-1111-4111-8111-111111111111';
      const b = '22222222-2222-4222-8222-222222222222';
      const c = '33333333-3333-4333-8333-333333333333';
      const list = [
        { id: a, parent: null, isRoot: true },
        { id: b, parent: a },
        { id: c, parent: a },
      ];

      await service.importMap(
        JSON.stringify({ nodes: list, arrows: [{ source: b, target: c }] })
      );

      expect(mockMap.new).toHaveBeenCalledWith(list, [
        { source: b, target: c },
      ]);
    });

    it('reads the arrows of the map', () => {
      mockMap.getArrows.mockReturnValue([arrow]);

      expect(service.getArrows()).toEqual([arrow]);
      mockMap.getArrows.mockReturnValue([]);
    });

    it('reads no arrows before a map exists', () => {
      service.remove();

      expect(service.getArrows()).toEqual([]);
    });

    it.each([
      ['starts', () => service.startArrowMode(), 'startArrowMode'],
      ['stops', () => service.stopArrowMode(), 'stopArrowMode'],
    ])('%s arrow mode in the map', (_, act, method) => {
      act();

      expect(
        mockMap[method as 'startArrowMode' | 'stopArrowMode']
      ).toHaveBeenCalled();
    });

    it('reports whether the map is in arrow mode', () => {
      mockMap.isArrowMode.mockReturnValue(true);

      expect(service.isArrowMode()).toBe(true);
    });

    it('reports no arrow mode before a map exists', () => {
      service.remove();

      expect(service.isArrowMode()).toBe(false);
    });

    describe('removeSelected', () => {
      it('removes the selected arrow and no node', async () => {
        mockMap.getSelectedArrow.mockReturnValue(arrow);

        await service.removeSelected();

        expect(mockMap.removeArrow).toHaveBeenCalledWith();
        expect(mockMap.removeNode).not.toHaveBeenCalled();
      });

      it('removes the selected node when no arrow is selected', async () => {
        mockMap.getSelectedArrow.mockReturnValue(null);

        await service.removeSelected();

        expect(mockMap.removeNode).toHaveBeenCalled();
        expect(mockMap.removeArrow).not.toHaveBeenCalled();
      });
    });

    describe('refused target', () => {
      const refuse = async (reason: string) => {
        const [, callback] = mockMap.on.mock.calls.find(
          ([event]) => event === 'arrowRefused'
        );
        callback(reason);
        await new Promise(resolve => setTimeout(resolve));
      };

      it.each([
        ['self', 'TOASTS.WARNINGS.ARROW_REFUSED.SELF'],
        ['duplicate', 'TOASTS.WARNINGS.ARROW_REFUSED.DUPLICATE'],
        ['parent', 'TOASTS.WARNINGS.ARROW_REFUSED.PARENT'],
        ['missing', 'TOASTS.WARNINGS.ARROW_REFUSED.MISSING'],
      ])('shows a toast for the reason %s', async (reason, key) => {
        await refuse(reason);

        expect(utilsService.translate).toHaveBeenCalledWith(key);
        expect(toastrService.warning).toHaveBeenCalledWith('translated-text');
      });
    });
  });

  describe('distributeNodes', () => {
    beforeEach(async () => {
      await createMap();
    });

    it('should delegate distributing the nodes to the mmp instance', () => {
      service.distributeNodes();

      expect(mockMap.distributeNodes).toHaveBeenCalled();
    });
  });

  describe('view state', () => {
    it('reports no hidden child nodes before create', () => {
      expect(service.childNodesHidden()).toBe(false);
    });

    describe('after create', () => {
      beforeEach(async () => {
        await createMap();
      });

      it('asks the mmp instance whether the selected node hides its child nodes', () => {
        mockMap.childNodesHidden.mockReturnValue(true);

        expect(service.childNodesHidden()).toBe(true);
        expect(mockMap.childNodesHidden).toHaveBeenCalledWith();
      });
    });
  });

  describe('addNodeImage', () => {
    const image = new Blob(['image'], { type: 'image/png' });
    let upload: jest.Mock;

    beforeEach(async () => {
      await createMap();
      upload = jest.fn().mockResolvedValue(REFERENCE);
      service.registerImageHandlers({ resolveUrl: jest.fn(), upload });
      mockMap.getSelectedNode.mockReturnValue({ id: 'node-a' });
      mockMap.existNode.mockReturnValue(true);
    });

    it('sets no image and shows no error when the node was deleted during the upload', async () => {
      mockMap.existNode.mockReturnValue(false);

      await service.addNodeImage(image);

      expect(upload).toHaveBeenCalled();
      expect(mockMap.updateNode).not.toHaveBeenCalled();
      expect(toastrService.error).not.toHaveBeenCalled();
    });

    it('uploads the image and sets the reference on the selected node', async () => {
      await service.addNodeImage(image);

      expect(upload).toHaveBeenCalledWith(image);
      expect(mockMap.updateNode).toHaveBeenCalledWith(
        'imageSrc',
        REFERENCE,
        'node-a'
      );
    });

    it('sets the reference on the node selected when the upload started', async () => {
      let finishUpload: (reference: string) => void = () => undefined;
      upload.mockReturnValue(
        new Promise(resolve => {
          finishUpload = resolve;
        })
      );

      const adding = service.addNodeImage(image);
      mockMap.getSelectedNode.mockReturnValue({ id: 'node-b' });
      finishUpload(REFERENCE);
      await adding;

      expect(mockMap.updateNode).toHaveBeenCalledTimes(1);
      expect(mockMap.updateNode.mock.calls[0][2]).toBe('node-a');
    });

    it('keeps the image and says the storage is full on a 413', async () => {
      upload.mockRejectedValue(new ImageUploadError(413));

      await service.addNodeImage(image);

      expect(mockMap.updateNode).not.toHaveBeenCalled();
      expect(utilsService.translate).toHaveBeenCalledWith(
        'TOASTS.ERRORS.IMAGE_STORAGE_FULL'
      );
      expect(toastrService.error).toHaveBeenCalled();
    });

    it('shows the generic message for any other failure', async () => {
      upload.mockRejectedValue(new ImageUploadError(0));

      await service.addNodeImage(image);

      expect(mockMap.updateNode).not.toHaveBeenCalled();
      expect(utilsService.translate).toHaveBeenCalledWith(
        'TOASTS.ERRORS.IMAGE_UPLOAD_ERROR'
      );
    });

    it('does nothing when no node is selected', async () => {
      mockMap.getSelectedNode.mockReturnValue(undefined);

      await service.addNodeImage(image);

      expect(upload).not.toHaveBeenCalled();
    });
  });
});
