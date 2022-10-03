import { Injectable } from '@angular/core'
import { MmpService } from '../mmp/mmp.service'
import { Router } from '@angular/router'
import { Hotkey, HotkeysService } from 'angular2-hotkeys'

@Injectable({
  providedIn: 'root'
})
export class ShortcutsService {
  private hotKeys: Hotkey[]

  constructor (private mmpService: MmpService,
    private hotkeysService: HotkeysService,
    private router: Router) {
  }

  /**
     * Add all global hot keys of the application.
     */
  public init () {
    this.hotKeys = [{
      keys: '?',
      description: 'TOOLTIPS.SHORTCUTS',
      callback: () => {
        this.router.navigate(['app', 'shortcuts'])
      }
    }, {
      keys: 'alt+s',
      description: 'TOOLTIPS.SETTINGS',
      callback: () => {
        this.router.navigate(['app', 'settings'])
      }
    }, {
      keys: 'alt+n',
      description: 'TOOLTIPS.NEW_MAP',
      callback: () => {
        // use a full page reload here to reload all singleton services
        window.location.replace('/app')
      }
    }, {
      keys: 'c',
      description: 'TOOLTIPS.CENTER_MAP',
      callback: () => {
        this.mmpService.center()
      }
    }, {
      keys: '+',
      description: 'TOOLTIPS.ADD_NODE',
      callback: () => {
        this.mmpService.addNode()
      }
    }, {
      keys: '-',
      description: 'TOOLTIPS.REMOVE_NODE',
      callback: () => {
        this.mmpService.removeNode()
      }
    }, {
      keys: 'ctrl+c',
      description: 'TOOLTIPS.COPY_NODE',
      callback: () => {
        this.mmpService.copyNode()
      }
    }, {
      keys: 'ctrl+x',
      description: 'TOOLTIPS.CUT_NODE',
      callback: () => {
        this.mmpService.cutNode()
      }
    }, {
      keys: 'ctrl+v',
      description: 'TOOLTIPS.PASTE_NODE',
      callback: () => {
        this.mmpService.pasteNode()
      }
    }, {
      keys: 'ctrl+=',
      description: 'TOOLTIPS.ZOOM_IN_MAP',
      callback: () => {
        this.mmpService.zoomIn()
      }
    }, {
      keys: 'ctrl+-',
      description: 'TOOLTIPS.ZOOM_OUT_MAP',
      callback: () => {
        this.mmpService.zoomOut()
      }
    }, {
      keys: 'left',
      description: 'TOOLTIPS.SELECT_NODE_ON_THE_LEFT',
      callback: () => {
        this.mmpService.selectNode('left')
      }
    }, {
      keys: 'right',
      description: 'TOOLTIPS.SELECT_NODE_ON_THE_RIGHT',
      callback: () => {
        this.mmpService.selectNode('right')
      }
    }, {
      keys: 'up',
      description: 'TOOLTIPS.SELECT_NODE_BELOW',
      callback: () => {
        this.mmpService.selectNode('up')
      }
    }, {
      keys: 'down',
      description: 'TOOLTIPS.SELECT_NODE_ABOVE',
      callback: () => {
        this.mmpService.selectNode('down')
      }
    }, {
      keys: 'enter',
      description: 'TOOLTIPS.START_EDIT_NODE',
      callback: () => {
        this.mmpService.editNode()
      }
    }, {
      keys: 'alt+left',
      description: 'TOOLTIPS.MOVE_NODE_TO_THE_LEFT',
      callback: () => {
        this.mmpService.moveNodeTo('left')
      }
    }, {
      keys: 'alt+right',
      description: 'TOOLTIPS.MOVE_NODE_TO_THE_RIGHT',
      callback: () => {
        this.mmpService.moveNodeTo('right')
      }
    }, {
      keys: 'alt+up',
      description: 'TOOLTIPS.MOVE_NODE_UPWARD',
      callback: () => {
        this.mmpService.moveNodeTo('up')
      }
    }, {
      keys: 'alt+down',
      description: 'TOOLTIPS.MOVE_NODE_DOWN',
      callback: () => {
        this.mmpService.moveNodeTo('down')
      }
    }, {
      keys: 'ctrl+e',
      description: 'TOOLTIPS.EXPORT_MAP',
      callback: () => {
        this.mmpService.exportMap()
      }
    }].map(this.getHotKey)

    this.hotkeysService.add(this.hotKeys)
  }

  /**
     * Return all the shortcuts.
     */
  public getHotKeys (): Hotkey[] {
    return this.hotKeys
  }

  /**
     * Get some shortcut parameters and return the corresponding hot key.
     */
  private getHotKey (options: {
    keys: string | string[];
    description: string;
    callback: (event?: KeyboardEvent) => void;
  }) {
    return new Hotkey(options.keys, (event: KeyboardEvent) => {
      options.callback(event)

      return false
    }, undefined, options.description)
  }
}
