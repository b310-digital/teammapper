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
import { of, Observable, BehaviorSubject } from 'rxjs';
import { provideRouter } from '@angular/router';

class FakeTranslateLoader implements TranslateLoader {
  getTranslation(): Observable<Record<string, string>> {
    return of({});
  }
}

// Stub with only the methods ToolbarComponent actually uses
class MmpServiceStub {
  exportMap = jest.fn();
  nodeChildren = jest.fn().mockReturnValue([]);
  getSelectedNode = jest.fn();
  selectNode = jest.fn();
  updateNode = jest.fn();
  addNodeLink = jest.fn();
  addNode = jest.fn();
  removeNodeLink = jest.fn();
  toggleBranchVisibility = jest.fn();
  addNodeImage = jest.fn();
  importMap = jest.fn();
  undo = jest.fn();
  redo = jest.fn();
  history = jest.fn();
}

interface TestContext {
  component: ToolbarComponent;
  fixture: ComponentFixture<ToolbarComponent>;
  mmpService: MmpServiceStub;
  mapSyncService: {
    undo: jest.Mock;
    redo: jest.Mock;
    canUndo$: Observable<boolean>;
    canRedo$: Observable<boolean>;
  };
  translateService: TranslateService;
  canUndoSubject: BehaviorSubject<boolean>;
  canRedoSubject: BehaviorSubject<boolean>;
}

async function setupTestBed(yjsEnabled: boolean): Promise<TestContext> {
  const mmpService = new MmpServiceStub();
  const canUndoSubject = new BehaviorSubject<boolean>(false);
  const canRedoSubject = new BehaviorSubject<boolean>(false);

  const mapSyncService = {
    undo: jest.fn(),
    redo: jest.fn(),
    canUndo$: canUndoSubject.asObservable(),
    canRedo$: canRedoSubject.asObservable(),
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
      { provide: MmpService, useValue: mmpService },
      { provide: MapSyncService, useValue: mapSyncService },
      {
        provide: SettingsService,
        useValue: {
          getCachedSystemSettings: jest.fn().mockReturnValue({
            featureFlags: { yjs: yjsEnabled, pictograms: false, ai: false },
          }),
        },
      },
      {
        provide: DialogService,
        useValue: {
          openAboutDialog: jest.fn(),
          openShareDialog: jest.fn(),
          openPictogramDialog: jest.fn(),
        },
      },
      provideRouter([]),
    ],
  }).compileComponents();

  const translateService = TestBed.inject(TranslateService);
  jest.spyOn(translateService, 'instant').mockReturnValue('translated');
  jest
    .spyOn(translateService, 'use')
    .mockImplementation(() => of({ lang: 'en' }));

  const fixture = TestBed.createComponent(ToolbarComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();

  return {
    component,
    fixture,
    mmpService,
    mapSyncService,
    translateService,
    canUndoSubject,
    canRedoSubject,
  };
}

describe('ToolbarComponent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('with Yjs disabled', () => {
    let ctx: TestContext;
    const originalFileReader = window.FileReader;

    beforeEach(async () => {
      ctx = await setupTestBed(false);
    });

    afterEach(() => {
      ctx.fixture.destroy();
      window.FileReader = originalFileReader;
    });

    it('should create', () => {
      expect(ctx.component).toBeTruthy();
    });

    it('should show alert for large JSON export', async () => {
      ctx.mmpService.exportMap.mockResolvedValue({
        success: true,
        size: 1001,
      });
      (ctx.translateService.instant as jest.Mock).mockReturnValue(
        'Large file warning'
      );
      const alertSpy = jest
        .spyOn(window, 'alert')
        .mockImplementation(jest.fn());

      await ctx.component.exportMap('json');

      expect(alertSpy).toHaveBeenCalledWith('Large file warning');
    });

    it('should detect hidden nodes', () => {
      ctx.mmpService.nodeChildren.mockReturnValue([
        { id: '1', hidden: true } as ExportNodeProperties,
        { id: '2', hidden: false } as ExportNodeProperties,
      ]);

      expect(ctx.component.hasHiddenNodes).toBe(true);
    });

    it('should detect no hidden nodes', () => {
      ctx.mmpService.nodeChildren.mockReturnValue([
        { id: '1', hidden: false } as ExportNodeProperties,
      ]);

      expect(ctx.component.hasHiddenNodes).toBe(false);
    });

    it('should not allow hiding root node', () => {
      ctx.mmpService.getSelectedNode.mockReturnValue({ isRoot: true });

      expect(ctx.component.canHideNodes).toBeFalsy();
    });

    it('should allow hiding non-root node', () => {
      ctx.mmpService.getSelectedNode.mockReturnValue({ isRoot: false });

      expect(ctx.component.canHideNodes).toBeTruthy();
    });

    it('should toggle font style from normal to italic', () => {
      ctx.mmpService.selectNode.mockReturnValue({
        font: { style: 'normal' },
      } as ExportNodeProperties);

      ctx.component.toogleNodeFontStyle();

      expect(ctx.mmpService.updateNode).toHaveBeenCalledWith(
        'fontStyle',
        'italic'
      );
    });

    it('should toggle font style from italic to normal', () => {
      ctx.mmpService.selectNode.mockReturnValue({
        font: { style: 'italic' },
      } as ExportNodeProperties);

      ctx.component.toogleNodeFontStyle();

      expect(ctx.mmpService.updateNode).toHaveBeenCalledWith(
        'fontStyle',
        'normal'
      );
    });

    it('should add valid link', () => {
      jest.spyOn(window, 'prompt').mockReturnValue('https://example.com');

      ctx.component.addLink();

      expect(ctx.mmpService.addNodeLink).toHaveBeenCalledWith(
        'https://example.com'
      );
    });

    it('should reject invalid link', () => {
      jest.spyOn(window, 'prompt').mockReturnValue('invalid-url');

      ctx.component.addLink();

      expect(ctx.mmpService.addNodeLink).not.toHaveBeenCalled();
    });

    it('should read image file as data URL', () => {
      const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const mockFileReader = {
        readAsDataURL: jest.fn(),
        result: '',
        onload: null,
      };
      window.FileReader = jest.fn(
        () => mockFileReader
      ) as unknown as typeof FileReader;

      ctx.component.initImageUpload({
        target: { files: [mockFile] },
      } as unknown as InputEvent);

      expect(mockFileReader.readAsDataURL).toHaveBeenCalledWith(mockFile);
    });

    it('should read JSON file as text', () => {
      const mockFile = new File(['{}'], 'test.json', {
        type: 'application/json',
      });
      const mockFileReader = {
        readAsText: jest.fn(),
        result: '{}',
        onload: null,
      };
      window.FileReader = jest.fn(
        () => mockFileReader
      ) as unknown as typeof FileReader;

      ctx.component.initJSONUpload({
        target: { files: [mockFile] },
      } as unknown as InputEvent);

      expect(mockFileReader.readAsText).toHaveBeenCalledWith(mockFile);
    });

    it('should call mmpService.undo when Yjs disabled', () => {
      ctx.component.handleUndo();

      expect(ctx.mmpService.undo).toHaveBeenCalled();
      expect(ctx.mapSyncService.undo).not.toHaveBeenCalled();
    });

    it('should call mmpService.redo when Yjs disabled', () => {
      ctx.component.handleRedo();

      expect(ctx.mmpService.redo).toHaveBeenCalled();
      expect(ctx.mapSyncService.redo).not.toHaveBeenCalled();
    });

    it('should report canUndoRedo when history has multiple snapshots', () => {
      ctx.mmpService.history.mockReturnValue({ snapshots: [[], []] });

      expect(ctx.component.canUndoRedo).toBe(true);
    });
  });

  describe('with Yjs enabled', () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestBed(true);
    });

    afterEach(() => {
      ctx.fixture.destroy();
    });

    it('should call mapSyncService.undo when Yjs enabled', () => {
      ctx.component.handleUndo();

      expect(ctx.mapSyncService.undo).toHaveBeenCalled();
      expect(ctx.mmpService.undo).not.toHaveBeenCalled();
    });

    it('should call mapSyncService.redo when Yjs enabled', () => {
      ctx.component.handleRedo();

      expect(ctx.mapSyncService.redo).toHaveBeenCalled();
      expect(ctx.mmpService.redo).not.toHaveBeenCalled();
    });

    it('should reflect canUndo$ observable in canYjsUndo', () => {
      expect(ctx.component.canYjsUndo).toBe(false);

      ctx.canUndoSubject.next(true);

      expect(ctx.component.canYjsUndo).toBe(true);
    });

    it('should reflect canRedo$ observable in canYjsRedo', () => {
      expect(ctx.component.canYjsRedo).toBe(false);

      ctx.canRedoSubject.next(true);

      expect(ctx.component.canYjsRedo).toBe(true);
    });
  });
});
