import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  TranslateService,
  TranslateModule,
  TranslateLoader,
} from '@ngx-translate/core';
import { DialogService } from 'src/app/core/services/dialog/dialog.service';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { ToolbarComponent } from './toolbar.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { ExportNodeProperties } from '@mmp/map/types';
import Node, { Font } from 'mmp/src/map/models/node';
import { of, Observable, BehaviorSubject } from 'rxjs';
import { provideRouter } from '@angular/router';

class FakeTranslateLoader implements TranslateLoader {
  getTranslation(): Observable<Record<string, string>> {
    return of({});
  }
}

describe('ToolbarComponent', () => {
  let component: ToolbarComponent;
  let fixture: ComponentFixture<ToolbarComponent>;
  let mockMmpService: jest.Mocked<MmpService>;
  let mockMapSyncService: jest.Mocked<Partial<MapSyncService>>;
  let mockSettingsService: jest.Mocked<Partial<SettingsService>>;
  let mockDialogService: jest.Mocked<DialogService>;
  let mockTranslateService: jest.Mocked<TranslateService>;

  beforeEach(async () => {
    mockMmpService = {
      exportMap: jest.fn(),
      nodeChildren: jest.fn(),
      getSelectedNode: jest.fn(),
      selectNode: jest.fn(),
      updateNode: jest.fn(),
      addNodeLink: jest.fn(),
      addNode: jest.fn(),
      removeNodeLink: jest.fn(),
      toggleBranchVisibility: jest.fn(),
      addNodeImage: jest.fn(),
      importMap: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn(),
    } as unknown as jest.Mocked<MmpService>;

    mockDialogService = {
      openAboutDialog: jest.fn(),
      openShareDialog: jest.fn(),
      openPictogramDialog: jest.fn(),
    } as unknown as jest.Mocked<DialogService>;

    mockMapSyncService = {
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo$: new BehaviorSubject<boolean>(false).asObservable(),
      canRedo$: new BehaviorSubject<boolean>(false).asObservable(),
    } as unknown as jest.Mocked<Partial<MapSyncService>>;

    mockSettingsService = {
      getCachedSystemSettings: jest.fn().mockReturnValue({
        featureFlags: { yjs: false, pictograms: false, ai: false },
      }),
    } as unknown as jest.Mocked<Partial<SettingsService>>;

    await TestBed.configureTestingModule({
      imports: [
        MatMenuModule,
        MatToolbarModule,
        TranslateModule.forRoot({
          loader: { provide: TranslateLoader, useClass: FakeTranslateLoader },
          fallbackLang: 'en',
        }),
        MatIconModule,
        ToolbarComponent,
      ],
      providers: [
        { provide: MmpService, useValue: mockMmpService },
        { provide: MapSyncService, useValue: mockMapSyncService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: DialogService, useValue: mockDialogService },
        provideRouter([]),
      ],
    }).compileComponents();

    mockTranslateService = TestBed.inject(
      TranslateService
    ) as unknown as jest.Mocked<TranslateService>;
    jest.spyOn(mockTranslateService, 'instant').mockReturnValue('translated');
    jest
      .spyOn(mockTranslateService, 'use')
      .mockImplementation(() => of({ lang: 'en' }));

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('exportMap', () => {
    it('should show alert for large JSON files', async () => {
      const mockResult = { success: true, size: 1001 };
      mockMmpService.exportMap.mockResolvedValue(mockResult);
      mockTranslateService.instant.mockReturnValue('Large file warning');
      window.alert = jest.fn();

      await component.exportMap('json');

      expect(window.alert).toHaveBeenCalledWith('Large file warning');
    });
  });

  describe('hasHiddenNodes', () => {
    it('should return true when hidden nodes exist', () => {
      const mockNode: ExportNodeProperties = {
        id: '1',
        name: 'test',
        k: 1,
        parent: null,
        hidden: true,
      };
      const mockNode2: ExportNodeProperties = {
        id: '2',
        name: 'test2',
        k: 1,
        parent: null,
        hidden: false,
      };
      mockMmpService.nodeChildren.mockReturnValue([mockNode, mockNode2]);

      expect(component.hasHiddenNodes).toBeTruthy();
    });

    it('should return false when no hidden nodes exist', () => {
      const mockNode: ExportNodeProperties = {
        id: '1',
        name: 'test',
        k: 1,
        parent: null,
        hidden: false,
      };
      mockMmpService.nodeChildren.mockReturnValue([mockNode]);

      expect(component.hasHiddenNodes).toBeFalsy();
    });
  });

  describe('canHideNodes', () => {
    it('should return false for root node', () => {
      mockMmpService.getSelectedNode.mockReturnValue({
        isRoot: true,
      } as Node);
      expect(component.canHideNodes).toBeFalsy();
    });

    it('should return true for non-root node', () => {
      mockMmpService.getSelectedNode.mockReturnValue({
        isRoot: false,
      } as Node);
      expect(component.canHideNodes).toBeTruthy();
    });
  });

  describe('font style toggle', () => {
    it('should toggle font style between italic and normal', () => {
      const mockFont: Font = {
        size: 14,
        weight: 'normal',
        style: 'normal',
      };
      mockMmpService.selectNode.mockReturnValue({
        font: mockFont,
      } as ExportNodeProperties);
      component.toogleNodeFontStyle();
      expect(mockMmpService.updateNode).toHaveBeenCalledWith(
        'fontStyle',
        'italic'
      );

      mockFont.style = 'italic';
      mockMmpService.selectNode.mockReturnValue({
        font: mockFont,
      } as ExportNodeProperties);
      component.toogleNodeFontStyle();
      expect(mockMmpService.updateNode).toHaveBeenCalledWith(
        'fontStyle',
        'normal'
      );
    });
  });

  describe('link handling', () => {
    it('should add valid link', () => {
      window.prompt = jest.fn().mockReturnValue('https://example.com');
      component.addLink();
      expect(mockMmpService.addNodeLink).toHaveBeenCalledWith(
        'https://example.com'
      );
    });

    it('should not add invalid link', () => {
      window.prompt = jest.fn().mockReturnValue('invalid-url');
      component.addLink();
      expect(mockMmpService.addNodeLink).not.toHaveBeenCalled();
    });
  });

  describe('file upload handling', () => {
    it('should handle image upload', () => {
      const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const mockEvent = {
        target: { files: [mockFile] },
      } as unknown as InputEvent;

      const mockFileReader = {
        readAsDataURL: jest.fn(),
        result: 'data:image/jpeg;base64,test',
        onload: null,
      };
      window.FileReader = jest.fn(
        () => mockFileReader
      ) as unknown as typeof FileReader;

      component.initImageUpload(mockEvent);
      expect(mockFileReader.readAsDataURL).toHaveBeenCalledWith(mockFile);
    });

    it('should handle JSON upload', () => {
      const mockFile = new File(['{}'], 'test.json', {
        type: 'application/json',
      });
      const mockEvent = {
        target: { files: [mockFile] },
      } as unknown as InputEvent;

      const mockFileReader = {
        readAsText: jest.fn(),
        result: '{}',
        onload: null,
      };
      window.FileReader = jest.fn(
        () => mockFileReader
      ) as unknown as typeof FileReader;

      component.initJSONUpload(mockEvent);
      expect(mockFileReader.readAsText).toHaveBeenCalledWith(mockFile);
    });
  });

  describe('undo/redo conditional routing (Yjs disabled)', () => {
    it('handleUndo calls mmpService.undo when yjs disabled', () => {
      component.handleUndo();
      expect(mockMmpService.undo).toHaveBeenCalled();
      expect(mockMapSyncService.undo).not.toHaveBeenCalled();
    });

    it('handleRedo calls mmpService.redo when yjs disabled', () => {
      component.handleRedo();
      expect(mockMmpService.redo).toHaveBeenCalled();
      expect(mockMapSyncService.redo).not.toHaveBeenCalled();
    });

    it('canUndoRedo uses mmpService.history when yjs disabled', () => {
      mockMmpService.history = jest.fn().mockReturnValue({
        snapshots: [[], []],
      });
      expect(component.canUndoRedo).toBe(true);
    });
  });
});

describe('ToolbarComponent (Yjs enabled)', () => {
  let component: ToolbarComponent;
  let fixture: ComponentFixture<ToolbarComponent>;
  let mockMmpService: jest.Mocked<MmpService>;
  let canUndoSubject: BehaviorSubject<boolean>;
  let canRedoSubject: BehaviorSubject<boolean>;
  let mockMapSyncService: jest.Mocked<Partial<MapSyncService>>;

  beforeEach(async () => {
    canUndoSubject = new BehaviorSubject<boolean>(false);
    canRedoSubject = new BehaviorSubject<boolean>(false);

    mockMmpService = {
      exportMap: jest.fn(),
      nodeChildren: jest.fn(),
      getSelectedNode: jest.fn(),
      selectNode: jest.fn(),
      updateNode: jest.fn(),
      addNodeLink: jest.fn(),
      addNode: jest.fn(),
      removeNodeLink: jest.fn(),
      toggleBranchVisibility: jest.fn(),
      addNodeImage: jest.fn(),
      importMap: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn(),
    } as unknown as jest.Mocked<MmpService>;

    mockMapSyncService = {
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo$: canUndoSubject.asObservable(),
      canRedo$: canRedoSubject.asObservable(),
    } as unknown as jest.Mocked<Partial<MapSyncService>>;

    const mockSettingsService = {
      getCachedSystemSettings: jest.fn().mockReturnValue({
        featureFlags: { yjs: true, pictograms: false, ai: false },
      }),
    };

    const mockDialogService = {
      openAboutDialog: jest.fn(),
      openShareDialog: jest.fn(),
      openPictogramDialog: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        MatMenuModule,
        MatToolbarModule,
        TranslateModule.forRoot({
          loader: { provide: TranslateLoader, useClass: FakeTranslateLoader },
          fallbackLang: 'en',
        }),
        MatIconModule,
        ToolbarComponent,
      ],
      providers: [
        { provide: MmpService, useValue: mockMmpService },
        { provide: MapSyncService, useValue: mockMapSyncService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: DialogService, useValue: mockDialogService },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('handleUndo calls mapSyncService.undo when yjs enabled', () => {
    component.handleUndo();
    expect(mockMapSyncService.undo).toHaveBeenCalled();
    expect(mockMmpService.undo).not.toHaveBeenCalled();
  });

  it('handleRedo calls mapSyncService.redo when yjs enabled', () => {
    component.handleRedo();
    expect(mockMapSyncService.redo).toHaveBeenCalled();
    expect(mockMmpService.redo).not.toHaveBeenCalled();
  });

  it('canYjsUndo reflects canUndo$ when yjs enabled', () => {
    expect(component.canYjsUndo).toBe(false);
    canUndoSubject.next(true);
    expect(component.canYjsUndo).toBe(true);
  });

  it('canYjsRedo reflects canRedo$ when yjs enabled', () => {
    expect(component.canYjsRedo).toBe(false);
    canRedoSubject.next(true);
    expect(component.canYjsRedo).toBe(true);
  });
});
