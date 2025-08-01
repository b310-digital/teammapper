import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { DialogService } from 'src/app/core/services/dialog/dialog.service';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { ToolbarComponent } from './toolbar.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { ExportNodeProperties } from '@mmp/map/types';
import Node, { Font } from 'mmp/src/map/models/node';
import { of } from 'rxjs';

describe('ToolbarComponent', () => {
  let component: ToolbarComponent;
  let fixture: ComponentFixture<ToolbarComponent>;
  let mockMmpService: jest.Mocked<MmpService>;
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
    } as unknown as jest.Mocked<MmpService>;

    mockDialogService = {
      openAboutDialog: jest.fn(),
      openShareDialog: jest.fn(),
      openPictogramDialog: jest.fn(),
    } as unknown as jest.Mocked<DialogService>;

    mockTranslateService = {
      use: jest.fn().mockReturnValue(Promise.resolve('en')),
      get: jest.fn().mockReturnValue(of('translated value')),
      instant: jest.fn().mockReturnValue('translated value'),
      onLangChange: of({ lang: 'en' }),
      onTranslationChange: of({}),
      onDefaultLangChange: of({}),
    } as unknown as jest.Mocked<TranslateService>;

    await TestBed.configureTestingModule({
      declarations: [ToolbarComponent],
      imports: [
        MatMenuModule,
        MatToolbarModule,
        TranslateModule.forRoot(),
        MatIconModule,
      ],
      providers: [
        { provide: MmpService, useValue: mockMmpService },
        { provide: DialogService, useValue: mockDialogService },
        { provide: TranslateService, useValue: mockTranslateService },
      ],
    }).compileComponents();

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
      window.FileReader = jest.fn(() => mockFileReader) as any;

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
      window.FileReader = jest.fn(() => mockFileReader) as any;

      component.initJSONUpload(mockEvent);
      expect(mockFileReader.readAsText).toHaveBeenCalledWith(mockFile);
    });
  });
});
