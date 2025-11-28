import { TestBed } from '@angular/core/testing';
import { MmpService } from './mmp.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import * as mmp from '@mmp/index';
import { Subject } from 'rxjs';
import { OptionParameters } from '@mmp/map/types';

jest.mock('dompurify', () => {
  return {
    __esModule: true,
    default: {
      sanitize: jest.fn((str: string) => str),
    },
  };
});

jest.mock('@mmp/index', () => ({
  create: jest.fn(),
  NodePropertyMapping: {},
}));

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
      updateOptions: jest.fn(),
      exportAsJSON: jest.fn(),
      exportAsImage: jest.fn(),
      history: jest.fn(),
      save: jest.fn(),
      center: jest.fn(),
      on: jest.fn(),
      addNodes: jest.fn(),
      addNode: jest.fn(),
      selectNode: jest.fn(),
      exportRootProperties: jest.fn(),
      exportNodeProperties: jest.fn(),
      existNode: jest.fn(),
      highlightNode: jest.fn(),
      editNode: jest.fn(),
      getSelectedNode: jest.fn(),
      deselectNode: jest.fn(),
      updateNode: jest.fn(),
      removeNode: jest.fn(),
      copyNode: jest.fn(),
      cutNode: jest.fn(),
      pasteNode: jest.fn(),
      toggleBranchVisibility: jest.fn(),
      nodeChildren: jest.fn(),
      exportSelectedNode: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn(),
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
      it('should add a node with default properties', () => {
        service.addNode();
        expect(mockMap.instance.addNode).toHaveBeenCalledWith(
          { name: '' },
          true,
          true,
          undefined,
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
          undefined,
          '123'
        );
      });

      it('should not add node if selected node is detached', () => {
        mockMap.instance.selectNode.mockReturnValue({ detached: true });
        service.addNode();
        expect(mockMap.instance.addNode).not.toHaveBeenCalled();
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
});
