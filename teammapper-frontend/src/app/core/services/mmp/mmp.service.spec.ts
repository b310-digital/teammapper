import { TestBed } from '@angular/core/testing';
import { MmpService } from './mmp.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import * as mmp from '@teammapper/mmp';
import { Subject } from 'rxjs';
import { OptionParameters } from '@teammapper/mmp';

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

const downloadFileSpy = jest
  .spyOn(UtilsService, 'downloadFile')
  .mockImplementation(jest.fn());

describe('MmpService', () => {
  let service: MmpService;
  let settingsService: Partial<jest.Mocked<SettingsService>> &
    Pick<jest.Mocked<SettingsService>, 'isMultiTreeEnabled'>;
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
      isMultiTreeEnabled: jest.fn().mockReturnValue(false),
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

      expect(mmp.create).toHaveBeenCalledWith(id, element, options);
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

      it('places a detached node where a new tree goes with nothing selected', () => {
        const coordinates = { x: 1400, y: 0 };
        mockMap.instance.selectNode.mockReturnValue(null);
        mockMap.instance.newTreeCoordinates.mockReturnValue(coordinates);

        service.addNode({ detached: true, name: '' });

        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { detached: true, name: '', coordinates },
          true,
          true,
          undefined,
          undefined
        );
      });

      it('attaches the new node to a selected detached node', () => {
        mockMap.instance.selectNode.mockReturnValue({
          id: 'detached-root',
          detached: true,
        });
        service.addNode();
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { name: '' },
          true,
          true,
          'detached-root',
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
      function enableMultiTree(): void {
        settingsService.isMultiTreeEnabled.mockReturnValue(true);
      }

      it('pastes as a tree with nothing selected and multiTree on', async () => {
        mockMap.instance.getSelectedNode.mockReturnValue(null);
        enableMultiTree();

        await service.pasteNode();

        expect(mockMap.instance.pasteTree).toHaveBeenCalled();
        expect(mockMap.instance.pasteNode).not.toHaveBeenCalled();
      });

      it('pastes no tree with nothing selected and multiTree off', async () => {
        mockMap.instance.getSelectedNode.mockReturnValue(null);

        await service.pasteNode();

        expect(mockMap.instance.pasteTree).not.toHaveBeenCalled();
        expect(mockMap.instance.pasteNode).toHaveBeenCalledWith(undefined);
      });

      it('pastes under the selected node with multiTree on', async () => {
        mockMap.instance.getSelectedNode.mockReturnValue({ id: 'selected' });
        enableMultiTree();

        await service.pasteNode();

        expect(mockMap.instance.pasteTree).not.toHaveBeenCalled();
        expect(mockMap.instance.pasteNode).toHaveBeenCalledWith(undefined);
      });

      it('pastes under a node named by id with nothing selected', async () => {
        mockMap.instance.getSelectedNode.mockReturnValue(null);
        enableMultiTree();

        await service.pasteNode('target');

        expect(mockMap.instance.pasteNode).toHaveBeenCalledWith('target');
      });

      it('reports an empty clipboard on a tree paste', async () => {
        mockMap.instance.getSelectedNode.mockReturnValue(null);
        enableMultiTree();
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
        mockMap.instance.exportAsJSON.mockReturnValue({ some: 'data' });

        const result = await service.exportMap('json');

        expect(result.success).toBe(true);
        expect(downloadFileSpy).toHaveBeenCalled();
      });

      it('should export to PNG', async () => {
        mockMap.instance.exportAsImage.mockImplementation(callback => {
          callback('data:image/png;base64,test');
        });

        const result = await service.exportMap('png');

        expect(result.success).toBe(true);
        expect(downloadFileSpy).toHaveBeenCalled();
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
});
