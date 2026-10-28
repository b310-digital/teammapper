import { TestBed } from '@angular/core/testing';
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
  let dialogService: {
    openAboutDialog: jest.Mock;
    openSettingsDialog: jest.Mock;
  };
  let editMode: BehaviorSubject<boolean | null>;
  let featureFlags: { pictograms: boolean; ai: boolean; arrows: boolean };
  let hotkeysService: { add: jest.Mock; remove: jest.Mock };
  let mapCreated: BehaviorSubject<boolean>;
  let mmpService: {
    mapCreated$: BehaviorSubject<boolean>;
    center: jest.Mock;
    selectNode: jest.Mock;
    updateNode: jest.Mock;
    getAdditionalMapOptions: jest.Mock;
    removeSelected: jest.Mock;
    addNode: jest.Mock;
    startArrowMode: jest.Mock;
    stopArrowMode: jest.Mock;
    isArrowMode: jest.Mock;
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
      removeSelected: jest.fn(),
      addNode: jest.fn(),
      startArrowMode: jest.fn(),
      stopArrowMode: jest.fn(),
      isArrowMode: jest.fn().mockReturnValue(false),
      // Limits that would allow either change, so only the selection blocks it.
      getAdditionalMapOptions: jest.fn().mockReturnValue({
        fontMinSize: 6,
        fontMaxSize: 28,
        fontIncrement: 2,
      }),
    };

    dialogService = {
      openAboutDialog: jest.fn(),
      openSettingsDialog: jest.fn(),
    };
    editMode = new BehaviorSubject<boolean | null>(true);
    featureFlags = { pictograms: false, ai: false, arrows: true };
    hotkeysService = { add: jest.fn(), remove: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        ShortcutsService,
        { provide: MmpService, useValue: mmpService },
        { provide: HotkeysService, useValue: hotkeysService },
        {
          provide: SettingsService,
          useValue: {
            getEditModeObservable: () => editMode,
            getCachedSystemSettings: () => ({ featureFlags }),
          },
        },
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

    expect(mmpService.updateNode).toHaveBeenCalledWith('fontSize', 14);
  });

  it('opens the info dialog on ?', () => {
    press('?');

    expect(dialogService.openAboutDialog).toHaveBeenCalledTimes(1);
  });

  it('opens the settings dialog on alt+s', () => {
    press('alt+s');

    expect(dialogService.openSettingsDialog).toHaveBeenCalledTimes(1);
  });

  describe('remove', () => {
    // Mousetrap names the Delete key `del`; it reads `delete` as typed text.
    it.each(['-', 'backspace', 'del'])('removes the selection on %s', combo => {
      press(combo);

      expect(mmpService.removeSelected).toHaveBeenCalledTimes(1);
    });
  });

  describe('arrow mode', () => {
    it('starts arrow mode on alt+a', () => {
      press('alt+a');

      expect(mmpService.startArrowMode).toHaveBeenCalledTimes(1);
    });

    it('registers alt+a for a writable client only', () => {
      editMode.next(false);

      expect(() => press('alt+a')).toThrow('No hotkey for alt+a');
    });

    it.each(['alt+a', 'esc'])(
      'registers no %s while the arrows flag is off',
      combo => {
        featureFlags.arrows = false;
        service.registerHotKeys();

        expect(() => press(combo)).toThrow(`No hotkey for ${combo}`);
      }
    );

    describe('while active', () => {
      beforeEach(() => {
        mmpService.isArrowMode.mockReturnValue(true);
        mmpService.selectNode.mockReturnValue({ font: { size: 12 } });
      });

      it.each(['-', 'backspace', 'del', '+', 'left', 'c', 'alt+a'])(
        'ignores the shortcut %s',
        combo => {
          press(combo);

          expect({
            removed: mmpService.removeSelected.mock.calls.length,
            added: mmpService.addNode.mock.calls.length,
            selected: mmpService.selectNode.mock.calls.length,
            centered: mmpService.center.mock.calls.length,
            started: mmpService.startArrowMode.mock.calls.length,
          }).toEqual({
            removed: 0,
            added: 0,
            selected: 0,
            centered: 0,
            started: 0,
          });
        }
      );

      it('stops arrow mode on Escape', () => {
        press('esc');

        expect(mmpService.stopArrowMode).toHaveBeenCalledTimes(1);
      });

      it('still opens the info dialog on ?', () => {
        press('?');

        expect(dialogService.openAboutDialog).toHaveBeenCalledTimes(1);
      });
    });

    it('does nothing on Escape outside arrow mode', () => {
      press('esc');

      expect(mmpService.stopArrowMode).not.toHaveBeenCalled();
    });
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
