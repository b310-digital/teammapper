import { TestBed } from '@angular/core/testing';
import { MmpService } from './mmp.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import * as mmp from '@teammapper/mmp';
import { Subject } from 'rxjs';
import { OptionParameters } from '@teammapper/mmp';
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

const REFERENCE = 'image:3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b';

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
      unsubscribeAll: jest.fn(),
      remove: jest.fn(),
      new: jest.fn(),
      zoomIn: jest.fn(),
      zoomOut: jest.fn(),
      exportAsJSON: jest.fn(),
      exportAsImage: jest.fn(),
      center: jest.fn(),
      on: jest.fn(),
      addNodes: jest.fn(),
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
      distributeNodes: jest.fn(),
      nodeChildren: jest.fn(),
      newTreeCoordinates: jest.fn(),
    },
    options: {
      update: jest.fn(),
    },
  };

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

  describe('create', () => {
    it('should create a new mind map', async () => {
      const id = 'test-id';
      const element = document.createElement('div');
      const options: OptionParameters = { drag: true };

      await service.create(id, element, options);

      expect(mmp.create).toHaveBeenCalledWith(
        id,
        element,
        expect.objectContaining(options)
      );
    });

    it('passes a resolver that asks the registered image handlers', async () => {
      const resolveUrl = jest.fn().mockReturnValue('api/maps/m/images/i');
      service.registerImageHandlers({ resolveUrl, upload: jest.fn() });

      await service.create('test-id', document.createElement('div'));
      const passed: OptionParameters = (mmp.create as jest.Mock).mock
        .calls[0][2];

      expect(passed.resolveImageUrl?.(REFERENCE)).toBe('api/maps/m/images/i');
      expect(resolveUrl).toHaveBeenCalledWith(REFERENCE);
    });

    it('should initialize additional options with defaults', async () => {
      const id = 'test-id';
      const element = document.createElement('div');

      await service.create(id, element);

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
      await service.create('test-id', document.createElement('div'));
      service.remove();

      expect(mockMap.instance.unsubscribeAll).toHaveBeenCalled();
      expect(mockMap.instance.remove).toHaveBeenCalled();
    });

    it('should do nothing if no map exists', () => {
      service.remove();
      expect(mockMap.instance.unsubscribeAll).not.toHaveBeenCalled();
    });
  });

  describe('node operations', () => {
    beforeEach(async () => {
      await service.create('test-id', document.createElement('div'));
    });

    describe('addNode', () => {
      beforeEach(() => {
        mockMap.instance.selectNode.mockReturnValue({ id: 'selected' });
      });

      it('should add a node with default properties', () => {
        service.addNode();
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { name: '' },
          true,
          true,
          'selected',
          undefined
        );
      });

      it('should add a node with custom properties', () => {
        const props = { name: 'Test Node', id: '123' };
        service.addNode(props);
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          props,
          true,
          true,
          'selected',
          '123'
        );
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
          true,
          true,
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
          true,
          true,
          'named',
          undefined
        );
      });

      it('adds under the selected node for an empty parent', () => {
        service.addNode({ name: '', parent: '' });

        expect(mockMap.instance.selectNode).toHaveBeenCalledWith(undefined);
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { name: '', parent: '' },
          true,
          true,
          'selected',
          undefined
        );
      });
    });

    describe('addTree', () => {
      it('adds a root with no parent at the coordinates mmp picks', () => {
        const coordinates = { x: 1400, y: 0 };
        mockMap.instance.newTreeCoordinates.mockReturnValue(coordinates);

        service.addTree();

        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { name: '', coordinates },
          true,
          true,
          null
        );
      });

      it('never sets the main-root mark on the new root', () => {
        mockMap.instance.newTreeCoordinates.mockReturnValue({ x: 0, y: 0 });

        service.addTree();

        const [properties] = mockMap.instance.addNode.mock.calls[0];
        expect(properties).not.toHaveProperty('isRoot');
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
      await service.create('test-id', document.createElement('div'));
    });

    describe('exportMap', () => {
      beforeEach(() => {
        mockMap.instance.exportRootProperties.mockReturnValue({
          name: 'Test Map',
        });
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
          await service.create('test-id', document.createElement('div'));
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
      await service.create('test-id', document.createElement('div'));
    });

    it('should delegate distributing the nodes to the mmp instance', () => {
      service.distributeNodes();

      expect(mockMap.instance.distributeNodes).toHaveBeenCalled();
    });
  });

  describe('addNodeImage', () => {
    const image = new Blob(['image'], { type: 'image/png' });
    let upload: jest.Mock;

    beforeEach(async () => {
      await service.create('test-id', document.createElement('div'));
      upload = jest.fn().mockResolvedValue(REFERENCE);
      service.registerImageHandlers({ resolveUrl: jest.fn(), upload });
      mockMap.instance.getSelectedNode.mockReturnValue({ id: 'node-a' });
    });

    it('uploads the image and sets the reference on the selected node', async () => {
      await service.addNodeImage(image);

      expect(upload).toHaveBeenCalledWith(image);
      expect(mockMap.instance.updateNode).toHaveBeenCalledWith(
        'imageSrc',
        REFERENCE,
        true,
        true,
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
      expect(mockMap.instance.updateNode.mock.calls[0][4]).toBe('node-a');
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
