import { Injectable, OnDestroy, inject } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { Router } from '@angular/router';
import { Hotkey, HotkeysService } from 'angular2-hotkeys';
import { distinctUntilChanged, Subscription } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { DialogService } from '../dialog/dialog.service';

/** One shortcut before it becomes a `Hotkey`. */
interface HotkeyOptions {
  keys: string | string[];
  description: string;
  callback: (event?: KeyboardEvent) => void;
}

@Injectable({
  providedIn: 'root',
})
export class ShortcutsService implements OnDestroy {
  private mmpService = inject(MmpService);
  private hotkeysService = inject(HotkeysService);
  private settingsService = inject(SettingsService);
  private router = inject(Router);
  private dialogService = inject(DialogService);

  private hotKeys: Hotkey[] = [];
  private editMode: boolean | null = null;
  private mapCreated = false;
  private readonly subscriptions = new Subscription();

  /**
   * Add all global hot keys of the application. The viewer keys work at once,
   * and the edit keys follow edit mode, which stays unknown until the map
   * connection syncs and can change when a map turns out writable. Every key
   * that acts on the map does nothing until the map exists.
   */
  public init() {
    this.subscriptions.add(
      this.settingsService
        .getEditModeObservable()
        .pipe(distinctUntilChanged())
        .subscribe((result: boolean | null) => {
          this.editMode = result;
          this.registerHotKeys();
        })
    );
    this.subscriptions.add(
      this.mmpService.mapCreated$.subscribe(created => {
        this.mapCreated = created;
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  public registerHotKeys() {
    const appHotkeys: HotkeyOptions[] = [
      {
        keys: '?',
        description: 'TOOLTIPS.SHORTCUTS',
        callback: () => {
          this.dialogService.openAboutDialog();
        },
      },
      {
        keys: 'alt+s',
        description: 'TOOLTIPS.SETTINGS',
        callback: () => {
          this.router.navigate(['app', 'settings']);
        },
      },
      {
        keys: 'alt+n',
        description: 'TOOLTIPS.NEW_MAP',
        callback: () => {
          // use a full page reload here to reload all singleton services
          window.location.replace(`${document.baseURI}/map`);
        },
      },
    ];

    const mapHotkeys: HotkeyOptions[] = [
      {
        keys: 'c',
        description: 'TOOLTIPS.CENTER_MAP',
        callback: () => {
          this.mmpService.center();
        },
      },
      {
        keys: 'ctrl+e',
        description: 'TOOLTIPS.EXPORT_MAP',
        callback: () => {
          this.mmpService.exportMap();
        },
      },
    ];

    const editHotkeys: HotkeyOptions[] = [
      {
        keys: '+',
        description: 'TOOLTIPS.ADD_NODE',
        callback: () => {
          this.mmpService.addNode();
        },
      },
      {
        keys: ['-', 'backspace'],
        description: 'TOOLTIPS.REMOVE_NODE',
        callback: () => {
          this.mmpService.removeNode();
        },
      },
      {
        keys: 'ctrl+c',
        description: 'TOOLTIPS.COPY_NODE',
        callback: () => {
          this.mmpService.copyNode();
        },
      },
      {
        keys: 'ctrl+x',
        description: 'TOOLTIPS.CUT_NODE',
        callback: () => {
          this.mmpService.cutNode();
        },
      },
      {
        keys: 'ctrl+v',
        description: 'TOOLTIPS.PASTE_NODE',
        callback: () => {
          this.mmpService.pasteNode();
        },
      },
      {
        keys: 'ctrl+=',
        description: 'TOOLTIPS.ZOOM_IN_MAP',
        callback: () => {
          this.mmpService.zoomIn();
        },
      },
      {
        keys: 'ctrl+-',
        description: 'TOOLTIPS.ZOOM_OUT_MAP',
        callback: () => {
          this.mmpService.zoomOut();
        },
      },
      {
        keys: 'left',
        description: 'TOOLTIPS.SELECT_NODE_ON_THE_LEFT',
        callback: () => {
          this.mmpService.selectNode('left');
        },
      },
      {
        keys: 'right',
        description: 'TOOLTIPS.SELECT_NODE_ON_THE_RIGHT',
        callback: () => {
          this.mmpService.selectNode('right');
        },
      },
      {
        keys: 'up',
        description: 'TOOLTIPS.SELECT_NODE_BELOW',
        callback: () => {
          this.mmpService.selectNode('up');
        },
      },
      {
        keys: 'down',
        description: 'TOOLTIPS.SELECT_NODE_ABOVE',
        callback: () => {
          this.mmpService.selectNode('down');
        },
      },
      {
        keys: 'enter',
        description: 'TOOLTIPS.START_EDIT_NODE',
        callback: () => {
          this.mmpService.editNode();
        },
      },
      {
        keys: 'alt+left',
        description: 'TOOLTIPS.MOVE_NODE_TO_THE_LEFT',
        callback: () => {
          this.mmpService.moveNodeTo('left');
        },
      },
      {
        keys: 'alt+right',
        description: 'TOOLTIPS.MOVE_NODE_TO_THE_RIGHT',
        callback: () => {
          this.mmpService.moveNodeTo('right');
        },
      },
      {
        keys: 'alt+up',
        description: 'TOOLTIPS.MOVE_NODE_UPWARD',
        callback: () => {
          this.mmpService.moveNodeTo('up');
        },
      },
      {
        keys: 'alt+down',
        description: 'TOOLTIPS.MOVE_NODE_DOWN',
        callback: () => {
          this.mmpService.moveNodeTo('down');
        },
      },
      {
        keys: 'alt+.',
        description: 'TOOLTIPS.FONT_INCREASE',
        callback: () => {
          const size = this.mmpService.selectNode()?.font?.size;
          const options = this.mmpService.getAdditionalMapOptions();
          if (size == null || !options || size >= options.fontMaxSize) return;

          this.mmpService.updateNode(
            'fontSize',
            size + options.fontIncrement,
            false
          );
        },
      },
      {
        keys: 'alt+-',
        description: 'TOOLTIPS.FONT_DECREASE',
        callback: () => {
          const size = this.mmpService.selectNode()?.font?.size;
          const options = this.mmpService.getAdditionalMapOptions();
          if (size == null || !options || size <= options.fontMinSize) return;

          this.mmpService.updateNode(
            'fontSize',
            size - options.fontIncrement,
            false
          );
        },
      },
    ];

    if (this.hotKeys.length > 0) this.hotkeysService.remove(this.hotKeys);

    const mapKeys = this.editMode
      ? [...mapHotkeys, ...editHotkeys]
      : mapHotkeys;
    this.hotKeys = [
      ...appHotkeys,
      ...mapKeys.map(options => this.requireMap(options)),
    ].map(this.getHotKey);

    this.hotkeysService.add(this.hotKeys);
  }

  /** Make the hot key do nothing while no map exists. */
  private requireMap(options: HotkeyOptions): HotkeyOptions {
    return {
      ...options,
      callback: event => {
        if (this.mapCreated) options.callback(event);
      },
    };
  }

  /**
   * Return all the shortcuts.
   */
  public getHotKeys(): Hotkey[] {
    return this.hotKeys;
  }

  /**
   * Get some shortcut parameters and return the corresponding hot key.
   */
  private getHotKey(options: HotkeyOptions) {
    return new Hotkey(
      options.keys,
      (event: KeyboardEvent) => {
        options.callback(event);

        return false;
      },
      undefined,
      options.description
    );
  }
}
