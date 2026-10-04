import { TestBed } from '@angular/core/testing';
import { MmpService, NODE_FONT_FAMILY } from './mmp.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import * as mmp from '@teammapper/mmp';
import { Subject } from 'rxjs';
import type { MapData, MmpMap, OptionParameters } from '@teammapper/mmp';
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
  NodePropertyMapping: {},
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
  batch: change => change(),
  subscribe: () => () => undefined,
};

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
    instance: {
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
    },
    options: {
      update: jest.fn(),
    },
  };

  /** Create the map with no options over `DATA`. */
  const createMap = () =>
    service.create('test-id', document.createElement('div'), undefined, DATA);

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
      const id = 'test-id';
      const element = document.createElement('div');
      const options: OptionParameters = { zoom: true };
      editModeSubject.next(true);

      const created = await service.create(id, element, options, DATA);

      expect(created).toBe(mockMap);
      expect(mmp.create).toHaveBeenCalledWith(
        id,
        element,
        expect.objectContaining({ ...options, edit: true, drag: true }),
        DATA
      );
    });

    it('creates the map with an edit mode reported before it existed', async () => {
      editModeSubject.next(false);

      await service.create(
        'test-id',
        document.createElement('div'),
        { drag: true, edit: true },
        DATA
      );

      expect(mmp.create).toHaveBeenCalledWith(
        'test-id',
        expect.anything(),
        expect.objectContaining({ edit: false, drag: false }),
        DATA
      );
    });

    it('creates a read-only map while the edit mode is unknown', async () => {
      await service.create('test-id', document.createElement('div'), {}, DATA);

      expect(mmp.create).toHaveBeenCalledWith(
        'test-id',
        expect.anything(),
        expect.objectContaining({ edit: false, drag: false }),
        DATA
      );
    });

    it('applies an edit mode reported after the map existed', async () => {
      await service.create('test-id', document.createElement('div'), {}, DATA);

      editModeSubject.next(true);

      expect(mockMap.options.update).toHaveBeenCalledWith('drag', true);
      expect(mockMap.options.update).toHaveBeenCalledWith('edit', true);
    });

    it('creates no map for a create a newer create overtook', async () => {
      const newerMap = {
        ...mockMap,
        instance: { ...mockMap.instance, destroy: jest.fn() },
      };
      (mmp.create as jest.Mock).mockReturnValueOnce(newerMap);

      const late = service.create('a', document.createElement('div'), {}, DATA);
      const newer = service.create(
        'b',
        document.createElement('div'),
        {},
        DATA
      );

      await expect(late).resolves.toBeNull();
      await expect(newer).resolves.toBe(newerMap);
      expect(mmp.create).toHaveBeenCalledTimes(1);
      service.remove();
      expect(newerMap.instance.destroy).toHaveBeenCalled();
    });

    it('creates no map once remove ran during the create', async () => {
      const pending = service.create(
        'a',
        document.createElement('div'),
        {},
        DATA
      );
      service.remove();

      await expect(pending).resolves.toBeNull();
      expect(mmp.create).not.toHaveBeenCalled();
    });

    it('removes a map that is not the current one and keeps the current one', async () => {
      const stale = { instance: { destroy: jest.fn() } };
      await service.create('a', document.createElement('div'), {}, DATA);
      service.markMapCreated();
      const reported: boolean[] = [];
      service.mapCreated$.subscribe(created => reported.push(created));

      service.remove(stale as unknown as MmpMap);

      expect(stale.instance.destroy).toHaveBeenCalled();
      expect(mockMap.instance.destroy).not.toHaveBeenCalled();
      expect(reported).toEqual([true]);
    });

    it('reports the map created once marked, and no longer after remove', async () => {
      const reported: boolean[] = [];
      service.mapCreated$.subscribe(created => reported.push(created));

      await service.create('test-id', document.createElement('div'), {}, DATA);
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
      const id = 'test-id';
      const element = document.createElement('div');

      await service.create(id, element, undefined, DATA);

      const additionalOptions = service.getAdditionalMapOptions();
      expect(additionalOptions).toEqual({
        fontMinSize: 12,
        fontMaxSize: 24,
        fontIncrement: 2,
      });
    });
  });

  describe('remove', () => {
    it('should remove the current map', async () => {
      await createMap();
      service.remove();

      expect(mockMap.instance.destroy).toHaveBeenCalled();
    });

    it('should do nothing if no map exists', () => {
      service.remove();
      expect(mockMap.instance.destroy).not.toHaveBeenCalled();
    });
  });

  describe('node operations', () => {
    beforeEach(async () => {
      await createMap();
    });

    describe('addNode', () => {
      beforeEach(() => {
        mockMap.instance.selectNode.mockReturnValue({ id: 'selected' });
      });

      it('should add a node with default properties', () => {
        service.addNode();
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { name: '' },
          'selected',
          undefined
        );
      });

      it('should add a node with custom properties', () => {
        const props = { name: 'Test Node', id: '123' };
        service.addNode(props);
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          props,
          'selected',
          '123'
        );
      });

      it('selects the new node and edits its name', () => {
        mockMap.instance.addNode.mockReturnValue({ id: 'new' });

        service.addNode();

        expect(mockMap.instance.selectNode).toHaveBeenLastCalledWith('new');
        expect(mockMap.instance.editNode).toHaveBeenCalled();
      });

      it('edits nothing when mmp refuses the node', () => {
        mockMap.instance.addNode.mockReturnValue(null);

        service.addNode();

        expect(mockMap.instance.editNode).not.toHaveBeenCalled();
      });

      it('adds no child with nothing selected', () => {
        mockMap.instance.selectNode.mockReturnValue(null);

        service.addNode();

        expect(mockMap.instance.addNode).not.toHaveBeenCalled();
      });

      it('attaches the new node to a selected root outside the main tree', () => {
        mockMap.instance.selectNode.mockReturnValue({
          id: 'second-root',
          parent: null,
          isRoot: false,
        });
        service.addNode();
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { name: '' },
          'second-root',
          undefined
        );
      });

      it('attaches the new node to the parent it names', () => {
        mockMap.instance.selectNode.mockReturnValue({ id: 'named' });

        service.addNode({ name: '', parent: 'named' });

        expect(mockMap.instance.selectNode).toHaveBeenCalledWith('named');
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { name: '', parent: 'named' },
          'named',
          undefined
        );
      });

      it('adds under the selected node for an empty parent', () => {
        service.addNode({ name: '', parent: '' });

        expect(mockMap.instance.selectNode).toHaveBeenCalledWith(undefined);
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { name: '', parent: '' },
          'selected',
          undefined
        );
      });
    });

    describe('addTree', () => {
      it('lets mmp add the tree and edits the name of its root', () => {
        mockMap.instance.addTree.mockReturnValue({ id: 'tree' });

        service.addTree();

        expect(mockMap.instance.addTree).toHaveBeenCalled();
        expect(mockMap.instance.editNode).toHaveBeenCalled();
      });

      it('edits nothing when mmp adds no tree', () => {
        mockMap.instance.addTree.mockReturnValue(null);

        service.addTree();

        expect(mockMap.instance.editNode).not.toHaveBeenCalled();
      });
    });

    describe('selectNode', () => {
      it('should select node by id', () => {
        const nodeId = 'test-node';
        service.selectNode(nodeId);
        expect(mockMap.instance.selectNode).toHaveBeenCalledWith(nodeId);
      });

      it('should select node by direction', () => {
        service.selectNode('left');
        expect(mockMap.instance.selectNode).toHaveBeenCalledWith('left');
      });
    });

    describe('hasSelectedNode', () => {
      it('reports a selected node', () => {
        mockMap.instance.getSelectedNode.mockReturnValue({ id: 'selected' });

        expect(service.hasSelectedNode()).toBe(true);
      });
    });

    describe('branch protection', () => {
      const notifyProtected = async () => {
        const [, callback] = mockMap.instance.on.mock.calls.find(
          ([event]) => event === 'nodeProtected'
        );
        callback();
        await new Promise(resolve => setTimeout(resolve));
      };

      it('protects the branch of an unprotected node', () => {
        mockMap.instance.protectingNode.mockReturnValue(null);

        service.toggleBranchProtection();

        expect(mockMap.instance.protectBranch).toHaveBeenCalled();
        expect(mockMap.instance.releaseBranch).not.toHaveBeenCalled();
      });

      it('releases the branch of a protected node', () => {
        mockMap.instance.protectingNode.mockReturnValue('parent-id');

        service.toggleBranchProtection();

        expect(mockMap.instance.releaseBranch).toHaveBeenCalled();
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
        mockMap.instance.getSelectedNode.mockReturnValue({ id: 'selected' });
        mockMap.instance.cutNode.mockReturnValue(false);

        await service.cutNode();

        expect(toastrService.success).not.toHaveBeenCalled();
      });
    });

    describe('copyNode and cutNode with nothing selected', () => {
      beforeEach(() => {
        mockMap.instance.getSelectedNode.mockReturnValue(null);
      });

      it('copies nothing and reports no success', async () => {
        await service.copyNode();

        expect(mockMap.instance.copyNode).not.toHaveBeenCalled();
        expect(toastrService.success).not.toHaveBeenCalled();
      });

      it('cuts nothing and reports no success', async () => {
        await service.cutNode();

        expect(mockMap.instance.cutNode).not.toHaveBeenCalled();
        expect(toastrService.success).not.toHaveBeenCalled();
      });

      it('copies a node named by id', async () => {
        await service.copyNode('test-node');

        expect(mockMap.instance.copyNode).toHaveBeenCalledWith('test-node');
      });
    });

    describe('pasteNode', () => {
      it('pastes as a tree with nothing selected', async () => {
        mockMap.instance.getSelectedNode.mockReturnValue(null);

        await service.pasteNode();

        expect(mockMap.instance.pasteTree).toHaveBeenCalled();
        expect(mockMap.instance.pasteNode).not.toHaveBeenCalled();
      });

      it('pastes under the selected node', async () => {
        mockMap.instance.getSelectedNode.mockReturnValue({ id: 'selected' });

        await service.pasteNode();

        expect(mockMap.instance.pasteTree).not.toHaveBeenCalled();
        expect(mockMap.instance.pasteNode).toHaveBeenCalledWith(undefined);
      });

      it('pastes under a node named by id with nothing selected', async () => {
        mockMap.instance.getSelectedNode.mockReturnValue(null);

        await service.pasteNode('target');

        expect(mockMap.instance.pasteNode).toHaveBeenCalledWith('target');
      });

      it('reports an empty clipboard on a tree paste', async () => {
        mockMap.instance.getSelectedNode.mockReturnValue(null);
        mockMap.instance.pasteTree.mockImplementationOnce(() => {
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
        mockMap.instance.selectNode.mockReturnValue(null);

        service.moveNodeTo('left');

        expect(mockMap.instance.updateNode).not.toHaveBeenCalled();
      });

      it('writes the moved coordinates of the selected node to the data', () => {
        mockMap.instance.selectNode.mockReturnValue({
          id: 'selected',
          coordinates: { x: 100, y: 50 },
        });

        service.moveNodeTo('up', 20);

        expect(mockMap.instance.updateNode).toHaveBeenCalledWith(
          'coordinates',
          { x: 100, y: 30 }
        );
      });
    });

    describe('copyNode', () => {
      it('should copy node successfully', async () => {
        await service.copyNode('test-node');
        expect(mockMap.instance.copyNode).toHaveBeenCalledWith('test-node');
        expect(toastrService.success).toHaveBeenCalledWith('translated-text');
      });

      it('should handle root node copy error', async () => {
        mockMap.instance.copyNode.mockImplementation(() => {
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
        mockMap.instance.exportRootProperties.mockReturnValue({
          name: 'Test Map',
        });
      });

      it('exports a map without a main root under an empty name', async () => {
        mockMap.instance.exportRootProperties.mockReturnValue(null);
        mockMap.instance.exportAsJSON.mockReturnValue([]);

        const result = await service.exportMap('json');

        expect(result.success).toBe(true);
        expect(downloadFileSpy.mock.calls[0][0]).toBe('.json');
      });

      it('should export to JSON', async () => {
        mockMap.instance.exportAsJSON.mockReturnValue([{ id: 'root' }]);

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
          mockMap.instance.exportAsJSON.mockReturnValue([
            nodeWith('a', REFERENCE),
            nodeWith('b', DATA_URL),
          ]);

          await service.exportMap('json');

          const json = downloadedJson();
          expect(json).not.toContain('image:');
          expect(JSON.parse(json)).toEqual([
            nodeWith('a', DATA_URL),
            nodeWith('b', DATA_URL),
          ]);
        });

        it('drops an image the endpoint answers with 404', async () => {
          global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: false, status: 404 });
          mockMap.instance.exportAsJSON.mockReturnValue([
            nodeWith('a', REFERENCE),
          ]);

          const result = await service.exportMap('json');

          expect(result.success).toBe(true);
          expect(downloadedJson()).not.toContain('image:');
          expect(JSON.parse(downloadedJson())).toEqual([nodeWith('a', '')]);
        });
      });

      it('should export to PNG', async () => {
        mockMap.instance.exportAsImage.mockImplementation(callback => {
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
          mockMap.instance.exportAsJSON.mockReturnValue([root, second]);

          const result = await service.exportMap('mermaid');

          expect(result.success).toBe(true);
          expect(utilsService.translate).toHaveBeenCalledWith(
            'TOASTS.WARNINGS.MERMAID_SEVERAL_TREES'
          );
          expect(toastrService.info).toHaveBeenCalledWith('translated-text');
        });

        it('shows no warning for a map with one tree', async () => {
          mockMap.instance.exportAsJSON.mockReturnValue([root]);

          await service.exportMap('mermaid');

          expect(toastrService.info).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('distributeNodes', () => {
    beforeEach(async () => {
      await createMap();
    });

    it('should delegate distributing the nodes to the mmp instance', () => {
      service.distributeNodes();

      expect(mockMap.instance.distributeNodes).toHaveBeenCalled();
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
        mockMap.instance.childNodesHidden.mockReturnValue(true);

        expect(service.childNodesHidden()).toBe(true);
        expect(mockMap.instance.childNodesHidden).toHaveBeenCalledWith();
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
      mockMap.instance.getSelectedNode.mockReturnValue({ id: 'node-a' });
      mockMap.instance.existNode.mockReturnValue(true);
    });

    it('sets no image and shows no error when the node was deleted during the upload', async () => {
      mockMap.instance.existNode.mockReturnValue(false);

      await service.addNodeImage(image);

      expect(upload).toHaveBeenCalled();
      expect(mockMap.instance.updateNode).not.toHaveBeenCalled();
      expect(toastrService.error).not.toHaveBeenCalled();
    });

    it('uploads the image and sets the reference on the selected node', async () => {
      await service.addNodeImage(image);

      expect(upload).toHaveBeenCalledWith(image);
      expect(mockMap.instance.updateNode).toHaveBeenCalledWith(
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
      mockMap.instance.getSelectedNode.mockReturnValue({ id: 'node-b' });
      finishUpload(REFERENCE);
      await adding;

      expect(mockMap.instance.updateNode).toHaveBeenCalledTimes(1);
      expect(mockMap.instance.updateNode.mock.calls[0][2]).toBe('node-a');
    });

    it('keeps the image and says the storage is full on a 413', async () => {
      upload.mockRejectedValue(new ImageUploadError(413));

      await service.addNodeImage(image);

      expect(mockMap.instance.updateNode).not.toHaveBeenCalled();
      expect(utilsService.translate).toHaveBeenCalledWith(
        'TOASTS.ERRORS.IMAGE_STORAGE_FULL'
      );
      expect(toastrService.error).toHaveBeenCalled();
    });

    it('shows the generic message for any other failure', async () => {
      upload.mockRejectedValue(new ImageUploadError(0));

      await service.addNodeImage(image);

      expect(mockMap.instance.updateNode).not.toHaveBeenCalled();
      expect(utilsService.translate).toHaveBeenCalledWith(
        'TOASTS.ERRORS.IMAGE_UPLOAD_ERROR'
      );
    });

    it('does nothing when no node is selected', async () => {
      mockMap.instance.getSelectedNode.mockReturnValue(undefined);

      await service.addNodeImage(image);

      expect(upload).not.toHaveBeenCalled();
    });
  });
});
