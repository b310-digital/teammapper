import { ChangeDetectorRef } from '@angular/core';
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
import { ExportNodeProperties } from '@teammapper/shared';
import { of, Observable, BehaviorSubject } from 'rxjs';
import { provideRouter } from '@angular/router';

class FakeTranslateLoader implements TranslateLoader {
  getTranslation(): Observable<Record<string, string>> {
    return of({});
  }
}

class MmpServiceStub {
  exportMap = jest.fn();
  nodeChildren = jest.fn().mockReturnValue([]);
  getSelectedNode = jest.fn();
  hasSelectedNode = jest.fn().mockReturnValue(true);
  selectNode = jest.fn();
  updateNode = jest.fn();
  addNodeLink = jest.fn();
  addNode = jest.fn();
  addTree = jest.fn();
  removeNodeLink = jest.fn();
  toggleBranchVisibility = jest.fn();
  distributeNodes = jest.fn();
  addNodeImage = jest.fn();
  importMap = jest.fn();
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

async function setupTestBed(): Promise<TestContext> {
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
            featureFlags: { pictograms: false, ai: false },
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

/**
 * Re-render after a stub changes what the selection getters return. The test
 * bed runs zoneless, so nothing marks the view dirty on its own.
 */
function refresh(ctx: TestContext): void {
  ctx.fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
  ctx.fixture.detectChanges();
}

describe('ToolbarComponent', () => {
  let ctx: TestContext;
  const originalFileReader = window.FileReader;

  beforeEach(async () => {
    ctx = await setupTestBed();
  });

  afterEach(() => {
    ctx.fixture.destroy();
    window.FileReader = originalFileReader;
    jest.restoreAllMocks();
  });

  it('should create', () => {
    expect(ctx.component).toBeTruthy();
  });

  it('should initialize featureFlagAI from settings', () => {
    expect(ctx.component.featureFlagAI).toBe(false);
  });

  it('should initialize featureFlagPictograms from settings', () => {
    expect(ctx.component.featureFlagPictograms).toBe(false);
  });

  it('should show alert for large JSON export', async () => {
    ctx.mmpService.exportMap.mockResolvedValue({
      success: true,
      size: 1001,
    });
    (ctx.translateService.instant as jest.Mock).mockReturnValue(
      'Large file warning'
    );
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(jest.fn());

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

  it('should reject javascript: protocol link', () => {
    jest.spyOn(window, 'prompt').mockReturnValue('javascript:alert(1)');

    ctx.component.addLink();

    expect(ctx.mmpService.addNodeLink).not.toHaveBeenCalled();
  });

  it('should reject data: protocol link', () => {
    jest
      .spyOn(window, 'prompt')
      .mockReturnValue('data:text/html,<script>alert(1)</script>');

    ctx.component.addLink();

    expect(ctx.mmpService.addNodeLink).not.toHaveBeenCalled();
  });

  it('should reject SVG file type in image upload', () => {
    const mockFile = new File([''], 'test.svg', { type: 'image/svg+xml' });
    const mockFileReader = {
      readAsDataURL: jest.fn(),
      result: '',
      onload: null as FileReader['onload'],
    };
    window.FileReader = jest.fn(
      () => mockFileReader
    ) as unknown as typeof FileReader;

    ctx.component.initImageUpload({
      target: { files: [mockFile] },
    } as unknown as Event);

    expect(mockFileReader.readAsDataURL).not.toHaveBeenCalled();
  });

  it('should read image file as data URL', () => {
    const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
    const mockFileReader = {
      readAsDataURL: jest.fn(),
      result: '',
      onload: null as FileReader['onload'],
    };
    window.FileReader = jest.fn(
      () => mockFileReader
    ) as unknown as typeof FileReader;

    ctx.component.initImageUpload({
      target: { files: [mockFile] },
    } as unknown as Event);

    expect(mockFileReader.readAsDataURL).toHaveBeenCalledWith(mockFile);
  });

  it('should read JSON file as text', () => {
    const mockFile = new File(['{}'], 'test.json', {
      type: 'application/json',
    });
    const mockFileReader = {
      readAsText: jest.fn(),
      result: '{}',
      onload: null as FileReader['onload'],
    };
    window.FileReader = jest.fn(
      () => mockFileReader
    ) as unknown as typeof FileReader;

    ctx.component.initJSONUpload({
      target: { files: [mockFile] },
    } as unknown as Event);

    expect(mockFileReader.readAsText).toHaveBeenCalledWith(mockFile);
  });

  describe('undo/redo', () => {
    it('should delegate undo to mapSyncService', () => {
      ctx.component.handleUndo();

      expect(ctx.mapSyncService.undo).toHaveBeenCalled();
    });

    it('should delegate redo to mapSyncService', () => {
      ctx.component.handleRedo();

      expect(ctx.mapSyncService.redo).toHaveBeenCalled();
    });

    it('should reflect canUndo$ observable', () => {
      ctx.canUndoSubject.next(true);
      ctx.fixture.detectChanges();

      const undoButton =
        ctx.fixture.nativeElement.querySelector('#undo-button');
      expect(undoButton.disabled).toBe(false);
    });

    it('should reflect canRedo$ observable', () => {
      ctx.canRedoSubject.next(true);
      ctx.fixture.detectChanges();

      const redoButton =
        ctx.fixture.nativeElement.querySelector('#redo-button');
      expect(redoButton.disabled).toBe(false);
    });

    it('should disable undo when canUndo$ is false', () => {
      ctx.canUndoSubject.next(false);
      ctx.fixture.detectChanges();

      const undoButton =
        ctx.fixture.nativeElement.querySelector('#undo-button');
      expect(undoButton.disabled).toBe(true);
    });
  });

  describe('distribute nodes', () => {
    it('should render a button for distributing the nodes evenly', () => {
      const button = ctx.fixture.nativeElement.querySelector(
        '#distribute-nodes-button'
      );

      expect(button).not.toBeNull();
    });

    it('should distribute the nodes when the button is clicked', () => {
      const button = ctx.fixture.nativeElement.querySelector(
        '#distribute-nodes-button'
      );

      button.click();

      expect(ctx.mmpService.distributeNodes).toHaveBeenCalled();
    });
  });

  describe('with nothing selected', () => {
    const disabled = (selector: string): boolean | undefined =>
      ctx.fixture.nativeElement.querySelector(selector)?.disabled;

    beforeEach(() => {
      ctx.mmpService.hasSelectedNode.mockReturnValue(false);
      ctx.mmpService.selectNode.mockReturnValue(null);
      refresh(ctx);
    });

    it('disables the buttons that act on the selected node', () => {
      for (const selector of [
        '#copy-node-button',
        '#cut-node-button',
        '#hide-child-nodes-button',
        '#lock-node-button',
        '#node-image-button',
        '#image-upload',
        '#bold-button',
        '#italic-button',
        '#add-link-button',
      ]) {
        expect(disabled(selector)).toBe(true);
      }
    });

    it('keeps paste, add tree and distribute enabled', () => {
      for (const selector of [
        '#paste-node-button',
        '#add-tree-button',
        '#distribute-nodes-button',
      ]) {
        expect(disabled(selector)).toBe(false);
      }
    });

    it('enables the node buttons again once a node is selected', () => {
      ctx.mmpService.hasSelectedNode.mockReturnValue(true);
      refresh(ctx);

      expect(disabled('#copy-node-button')).toBe(false);
    });

    it('changes no font style or weight', () => {
      ctx.component.toogleNodeFontStyle();
      ctx.component.toogleNodeFontWeight();

      expect(ctx.mmpService.updateNode).not.toHaveBeenCalled();
    });
  });

  describe('add tree', () => {
    const query = (selector: string): HTMLButtonElement | null =>
      ctx.fixture.nativeElement.querySelector(selector);

    it('shows the add-tree button and no detached-node button', () => {
      expect(query('#add-tree-button')).not.toBeNull();
      expect(query('#add-detached-node-button')).toBeNull();
    });

    it('adds a tree when the add-tree button is clicked', () => {
      query('#add-tree-button')?.click();

      expect(ctx.mmpService.addTree).toHaveBeenCalled();
      expect(ctx.mmpService.addNode).not.toHaveBeenCalled();
    });

    it('keeps the add-tree button enabled with nothing selected', () => {
      ctx.mmpService.hasSelectedNode.mockReturnValue(false);
      refresh(ctx);

      expect(query('#add-tree-button')?.disabled).toBe(false);
    });
  });
});
