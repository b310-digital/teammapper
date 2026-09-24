import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { HotkeysService } from 'angular2-hotkeys';
import { Subject } from 'rxjs';
import { DialogAboutComponent } from 'src/app/modules/application/components/dialog-about/dialog-about.component';
import { DialogService } from './dialog.service';

describe('DialogService', () => {
  let service: DialogService;
  let afterClosed: Subject<void>;
  let dialog: { open: jest.Mock };
  let hotkeysService: { pause: jest.Mock; unpause: jest.Mock };

  beforeEach(() => {
    afterClosed = new Subject<void>();
    dialog = {
      open: jest.fn().mockReturnValue({ afterClosed: () => afterClosed }),
    };
    hotkeysService = { pause: jest.fn(), unpause: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        DialogService,
        { provide: MatDialog, useValue: dialog },
        { provide: HotkeysService, useValue: hotkeysService },
      ],
    });

    service = TestBed.inject(DialogService);
  });

  describe('openAboutDialog', () => {
    it('opens the info dialog', () => {
      service.openAboutDialog();

      expect(dialog.open).toHaveBeenCalledWith(DialogAboutComponent, {
        maxHeight: '90vh',
      });
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
  });
});
