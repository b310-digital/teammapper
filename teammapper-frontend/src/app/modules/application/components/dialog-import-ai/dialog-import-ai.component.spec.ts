import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { MermaidCreateResult } from '@teammapper/shared';
import { DialogImportAiComponent } from './dialog-import-ai.component';
import { HttpService } from 'src/app/core/http/http.service';
import { ImportService } from 'src/app/core/services/import/import.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { UtilsService } from 'src/app/core/services/utils/utils.service';

describe('DialogImportAiComponent', () => {
  let component: DialogImportAiComponent;
  let httpService: { post: jest.Mock };
  let importService: { importFromMermaid: jest.Mock };
  let toastService: {
    success: jest.Mock;
    error: jest.Mock;
    warning: jest.Mock;
    info: jest.Mock;
  };
  let dialogRef: { close: jest.Mock };

  const respondWith = (result: MermaidCreateResult) =>
    httpService.post.mockResolvedValue({
      status: 201,
      json: async () => result,
    });

  beforeEach(async () => {
    httpService = { post: jest.fn() };
    importService = { importFromMermaid: jest.fn().mockResolvedValue(true) };
    toastService = {
      success: jest.fn(),
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
    };
    dialogRef = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), DialogImportAiComponent],
      providers: [
        { provide: HttpService, useValue: httpService },
        { provide: ImportService, useValue: importService },
        { provide: ToastrService, useValue: toastService },
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: SettingsService,
          useValue: {
            getCachedSystemSettings: () => null,
            getLanguage: () => 'en',
          },
        },
        {
          provide: UtilsService,
          useValue: { translate: async (key: string) => key },
        },
      ],
    }).compileComponents();

    component = TestBed.createComponent(
      DialogImportAiComponent
    ).componentInstance;
    component.mindmapDescription = 'A map about testing';
  });

  it('lowers the children per node when more levels exceed the node cap', () => {
    component.setLevels(3);

    expect(component.levels).toBe(3);
    expect(component.childrenPerNode).toBe(2);
  });

  it('lowers the levels when more children per node exceed the node cap', () => {
    component.setLevels(3);
    component.setChildrenPerNode(4);

    expect(component.childrenPerNode).toBe(4);
    expect(component.levels).toBe(2);
  });

  it('shows the error toast when the server returns an empty map', async () => {
    respondWith({ mermaid: '', truncated: false });

    await component.generateAndImport();

    expect(toastService.error).toHaveBeenCalledWith(
      'TOASTS.ERRORS.AI_MERMAID_ERROR'
    );
    expect(importService.importFromMermaid).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('warns about a truncated map even when nothing imports', async () => {
    respondWith({ mermaid: 'mindmap', truncated: true });
    importService.importFromMermaid.mockResolvedValue(false);

    await component.generateAndImport();

    expect(toastService.warning).toHaveBeenCalledWith(
      'TOASTS.AI_MERMAID_TRUNCATED'
    );
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('imports the map and closes the dialog', async () => {
    respondWith({ mermaid: 'mindmap\n  Root', truncated: false });

    await component.generateAndImport();

    expect(importService.importFromMermaid).toHaveBeenCalledWith(
      'mindmap\n  Root'
    );
    expect(toastService.success).toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
