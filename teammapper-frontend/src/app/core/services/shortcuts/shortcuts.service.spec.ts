import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HotkeysService } from 'angular2-hotkeys';
import { of } from 'rxjs';
import { DialogService } from '../dialog/dialog.service';
import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { ShortcutsService } from './shortcuts.service';

/**
 * The font size keys act on the selected node, so with nothing selected they
 * change nothing.
 */
describe('ShortcutsService', () => {
  let service: ShortcutsService;
  let dialogService: { openAboutDialog: jest.Mock };
  let mmpService: {
    selectNode: jest.Mock;
    updateNode: jest.Mock;
    getAdditionalMapOptions: jest.Mock;
  };

  /** Run the callback of the hotkey bound to `combo`. */
  function press(combo: string): void {
    const hotkey = service
      .getHotKeys()
      .find(candidate => candidate.combo.includes(combo));
    if (!hotkey) throw new Error(`No hotkey for ${combo}`);

    hotkey.callback(new KeyboardEvent('keydown'), combo);
  }

  beforeEach(() => {
    mmpService = {
      selectNode: jest.fn().mockReturnValue(null),
      updateNode: jest.fn(),
      // Limits that would allow either change, so only the selection blocks it.
      getAdditionalMapOptions: jest.fn().mockReturnValue({
        fontMinSize: 6,
        fontMaxSize: 28,
        fontIncrement: 2,
      }),
    };

    dialogService = { openAboutDialog: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        ShortcutsService,
        { provide: MmpService, useValue: mmpService },
        { provide: HotkeysService, useValue: { add: jest.fn() } },
        {
          provide: SettingsService,
          useValue: { getEditModeObservable: () => of(true) },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: DialogService, useValue: dialogService },
      ],
    });

    service = TestBed.inject(ShortcutsService);
    service.init();
  });

  it('changes no font size on alt+. with nothing selected', () => {
    press('alt+.');

    expect(mmpService.updateNode).not.toHaveBeenCalled();
  });

  it('changes no font size on alt+- with nothing selected', () => {
    press('alt+-');

    expect(mmpService.updateNode).not.toHaveBeenCalled();
  });

  it('increases the font size of a selected node on alt+.', () => {
    mmpService.selectNode.mockReturnValue({ font: { size: 12 } });

    press('alt+.');

    expect(mmpService.updateNode).toHaveBeenCalledWith('fontSize', 14, false);
  });

  it('opens the info dialog on ?', () => {
    press('?');

    expect(dialogService.openAboutDialog).toHaveBeenCalledTimes(1);
  });
});
