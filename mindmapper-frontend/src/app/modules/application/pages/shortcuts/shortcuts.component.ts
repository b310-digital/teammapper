import {Component, OnInit} from '@angular/core'
import {ShortcutsService} from '../../../../core/services/shortcuts/shortcuts.service'
import {Hotkey} from 'angular2-hotkeys'
import { Location } from '@angular/common'

@Component({
    selector: 'mindmapp-shortcuts',
    templateUrl: './shortcuts.component.html',
    styleUrls: ['./shortcuts.component.scss']
})
export class ShortcutsComponent implements OnInit {

    public shortcuts: any[]

    constructor (private shortcutsService: ShortcutsService, private location: Location) {
    }

    public ngOnInit () {
        const hotKeys: Hotkey[] = this.shortcutsService.getHotKeys()
        this.shortcuts = hotKeys.map((hotKey: Hotkey) => {
            const keys = hotKey.combo[0]

            return {
                keys: keys === '+' ? [keys] : keys.split('+'),
                description: hotKey.description
            }
        })
    }

    public back() {
        this.location.back()
    }

}
