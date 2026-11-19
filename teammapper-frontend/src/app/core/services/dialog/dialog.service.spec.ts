import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Event, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { HotkeysService } from 'angular2-hotkeys';
import { Subject } from 'rxjs';
import { DialogAboutComponent } from 'src/app/modules/application/components/dialog-about/dialog-about.component';
import { DialogConnectionInfoComponent } from 'src/app/modules/application/components/dialog-connection-info/dialog-connection-info.component';
import { DialogDisplayNameComponent } from 'src/app/modules/application/components/dialog-display-name/dialog-display-name.component';
import { DialogImportAiComponent } from 'src/app/modules/application/components/dialog-import-ai/dialog-import-ai.component';
import { DialogImportMermaidComponent } from 'src/app/modules/application/components/dialog-import-mermaid/dialog-import-mermaid.component';
import { DialogPictogramsComponent } from 'src/app/modules/application/components/dialog-pictograms/dialog-pictograms.component';
import { DialogSettingsComponent } from 'src/app/modules/application/components/dialog-settings/dialog-settings.component';
import { DialogShareComponent } from 'src/app/modules/application/components/dialog-share/dialog-share.component';
import { DialogService } from './dialog.service';

describe('DialogService', () => {
  let service: DialogService;
  let afterClosed: Subject<void>;
  let routerEvents: Subject<Event>;
  let dialog: { open: jest.Mock };
  let dialogRef: {
    afterClosed: () => Subject<void>;
    close: jest.Mock;
    componentInstance: { onPictogramAdd: Subject<void> };
  };
  let hotkeysService: { pause: jest.Mock; unpause: jest.Mock };

  beforeEach(() => {
    afterClosed = new Subject<void>();
    routerEvents = new Subject<Event>();
    dialogRef = {
      afterClosed: () => afterClosed,
      close: jest.fn(() => afterClosed.next()),
      componentInstance: { onPictogramAdd: new Subject<void>() },
    };
    dialog = { open: jest.fn().mockReturnValue(dialogRef) };
    hotkeysService = { pause: jest.fn(), unpause: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        DialogService,
        { provide: MatDialog, useValue: dialog },
        { provide: HotkeysService, useValue: hotkeysService },
        { provide: Router, useValue: { events: routerEvents } },
      ],
    });

    service = TestBed.inject(DialogService);
  });

  describe('openAboutDialog', () => {
    it('opens the info dialog', () => {
      service.openAboutDialog();

      expect(dialog.open).toHaveBeenCalledWith(
        DialogAboutComponent,
        expect.anything()
      );
    });

    it('opens the info dialog in the size of the settings dialog', () => {
      service.openSettingsDialog();
      afterClosed.next();
      service.openAboutDialog();

      const [[, settingsConfig], [, aboutConfig]] = dialog.open.mock.calls;
      expect(aboutConfig).toEqual(settingsConfig);
    });

    it('opens no second dialog while one is open', () => {
      service.openAboutDialog();
      service.openAboutDialog();

      expect(dialog.open).toHaveBeenCalledTimes(1);
    });

    it('opens the dialog again once it is closed', () => {
      service.openAboutDialog();
      afterClosed.next();
      service.openAboutDialog();

      expect(dialog.open).toHaveBeenCalledTimes(2);
    });

    it('pauses the hotkeys while the dialog is open', () => {
      service.openAboutDialog();

      expect(hotkeysService.pause).toHaveBeenCalledTimes(1);
      expect(hotkeysService.unpause).not.toHaveBeenCalled();
    });

    it('resumes the hotkeys once the dialog is closed', () => {
      service.openAboutDialog();
      afterClosed.next();

      expect(hotkeysService.unpause).toHaveBeenCalledTimes(1);
    });

    it('closes the open info dialog on request', () => {
      service.openAboutDialog();
      service.closeAboutDialog();

      expect(dialogRef.close).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    {
      name: 'import mermaid',
      component: DialogImportMermaidComponent,
      open: (s: DialogService) => s.openImportMermaidDialog(),
      close: (s: DialogService) => s.closeImportMermaidDialog(),
    },
    {
      name: 'import ai',
      component: DialogImportAiComponent,
      open: (s: DialogService) => s.openImportAiDialog(),
      close: (s: DialogService) => s.closeImportAiDialog(),
    },
    {
      name: 'connection info',
      component: DialogConnectionInfoComponent,
      open: (s: DialogService) => s.openDisconnectDialog(),
      close: (s: DialogService) => s.closeDisconnectDialog(),
    },
    {
      name: 'share',
      component: DialogShareComponent,
      open: (s: DialogService) => s.openShareDialog(),
      close: (s: DialogService) => s.closeShareDialog(),
    },
    {
      name: 'pictograms',
      component: DialogPictogramsComponent,
      open: (s: DialogService) => s.openPictogramDialog(),
      close: (s: DialogService) => s.closePictogramDialog(),
    },
  ])('the $name dialog', ({ component, open, close }) => {
    it('opens the dialog', () => {
      open(service);

      expect(dialog.open).toHaveBeenCalledWith(component);
    });

    it('closes the open dialog on request', () => {
      open(service);
      close(service);

      expect(dialogRef.close).toHaveBeenCalledTimes(1);
    });

    it('ignores a close request while no dialog is open', () => {
      close(service);

      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  it('closes the pictograms dialog once the user adds a pictogram', () => {
    service.openPictogramDialog();

    dialogRef.componentInstance.onPictogramAdd.next();

    expect(dialogRef.close).toHaveBeenCalledTimes(1);
  });

  describe('openDisplayNameDialog', () => {
    it('opens the display name dialog', () => {
      service.openDisplayNameDialog();

      expect(dialog.open).toHaveBeenCalledWith(
        DialogDisplayNameComponent,
        expect.anything()
      );
    });

    it('opens no second dialog while one is open', () => {
      service.openDisplayNameDialog();
      service.openDisplayNameDialog();

      expect(dialog.open).toHaveBeenCalledTimes(1);
    });

    it('opens the dialog again once it is closed', () => {
      service.openDisplayNameDialog();
      afterClosed.next();
      service.openDisplayNameDialog();

      expect(dialog.open).toHaveBeenCalledTimes(2);
    });

    // Typing a name holding `-` must not remove the selected node.
    it('pauses the hotkeys while the dialog is open', () => {
      service.openDisplayNameDialog();

      expect(hotkeysService.pause).toHaveBeenCalledTimes(1);
      expect(hotkeysService.unpause).not.toHaveBeenCalled();
    });

    it('resumes the hotkeys once the dialog is closed', () => {
      service.openDisplayNameDialog();
      afterClosed.next();

      expect(hotkeysService.unpause).toHaveBeenCalledTimes(1);
    });
  });

  describe('openSettingsDialog', () => {
    it('opens the settings dialog', () => {
      service.openSettingsDialog();

      expect(dialog.open).toHaveBeenCalledWith(
        DialogSettingsComponent,
        expect.objectContaining({
          height: '720px',
          maxHeight: '90vh',
          panelClass: 'large-dialog-panel',
        })
      );
    });

    it('opens no second dialog while one is open', () => {
      service.openSettingsDialog();
      service.openSettingsDialog();

      expect(dialog.open).toHaveBeenCalledTimes(1);
    });

    it('opens the dialog again once it is closed', () => {
      service.openSettingsDialog();
      afterClosed.next();
      service.openSettingsDialog();

      expect(dialog.open).toHaveBeenCalledTimes(2);
    });

    it('pauses the hotkeys while the dialog is open', () => {
      service.openSettingsDialog();

      expect(hotkeysService.pause).toHaveBeenCalledTimes(1);
      expect(hotkeysService.unpause).not.toHaveBeenCalled();
    });

    it('resumes the hotkeys once the dialog is closed', () => {
      service.openSettingsDialog();
      afterClosed.next();

      expect(hotkeysService.unpause).toHaveBeenCalledTimes(1);
    });

    // Deleting the open map from the dialog sends the user to the start page.
    it('closes the dialog when the router starts a navigation', () => {
      service.openSettingsDialog();

      routerEvents.next(new NavigationStart(1, '/'));

      expect(dialogRef.close).toHaveBeenCalledTimes(1);
    });

    it('resumes the hotkeys after a navigation closes the dialog', () => {
      service.openSettingsDialog();

      routerEvents.next(new NavigationStart(1, '/'));

      expect(hotkeysService.unpause).toHaveBeenCalledTimes(1);
    });

    it('ignores other router events', () => {
      service.openSettingsDialog();

      routerEvents.next(new NavigationEnd(1, '/', '/'));

      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('stops watching the router once the dialog is closed', () => {
      service.openSettingsDialog();
      afterClosed.next();
      dialogRef.close.mockClear();

      routerEvents.next(new NavigationStart(2, '/'));

      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });
});
