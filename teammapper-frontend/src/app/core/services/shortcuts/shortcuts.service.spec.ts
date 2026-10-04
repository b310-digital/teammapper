import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HotkeysService } from 'angular2-hotkeys';
import { BehaviorSubject } from 'rxjs';
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
  let editMode: BehaviorSubject<boolean | null>;
  let hotkeysService: { add: jest.Mock; remove: jest.Mock };
  let mapCreated: BehaviorSubject<boolean>;
  let mmpService: {
    mapCreated$: BehaviorSubject<boolean>;
    center: jest.Mock;
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
    mapCreated = new BehaviorSubject<boolean>(true);
    mmpService = {
      mapCreated$: mapCreated,
      center: jest.fn(),
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
    editMode = new BehaviorSubject<boolean | null>(true);
    hotkeysService = { add: jest.fn(), remove: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        ShortcutsService,
        { provide: MmpService, useValue: mmpService },
        { provide: HotkeysService, useValue: hotkeysService },
        {
          provide: SettingsService,
          useValue: { getEditModeObservable: () => editMode },
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

  describe('before the map exists', () => {
    beforeEach(() => {
      mapCreated.next(false);
      mmpService.selectNode.mockReturnValue({ font: { size: 12 } });
    });

    it('acts on no map key', () => {
      press('c');
      press('alt+.');
      press('left');

      expect({
        center: mmpService.center.mock.calls.length,
        select: mmpService.selectNode.mock.calls.length,
        update: mmpService.updateNode.mock.calls.length,
      }).toEqual({ center: 0, select: 0, update: 0 });
    });

    it('still opens the info dialog on ?', () => {
      press('?');

      expect(dialogService.openAboutDialog).toHaveBeenCalledTimes(1);
    });

    it('acts once the map exists', () => {
      mapCreated.next(true);

      press('c');

      expect(mmpService.center).toHaveBeenCalled();
    });
  });

  describe('before the map connection reports edit mode', () => {
    beforeEach(() => {
      editMode.next(null);
    });

    it('opens the info dialog on ?', () => {
      press('?');

      expect(dialogService.openAboutDialog).toHaveBeenCalledTimes(1);
    });

    it('registers no edit keys', () => {
      expect(() => press('alt+.')).toThrow('No hotkey for alt+.');
    });

    it('registers the edit keys once edit mode turns on', () => {
      editMode.next(true);

      press('alt+.');

      expect(mmpService.selectNode).toHaveBeenCalled();
    });

    it('removes the keys it registered before', () => {
      const registered = service.getHotKeys();

      editMode.next(true);

      expect(hotkeysService.remove).toHaveBeenCalledWith(registered);
    });
  });
});
