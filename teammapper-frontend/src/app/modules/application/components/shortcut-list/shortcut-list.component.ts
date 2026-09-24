import { Component, OnInit, inject } from '@angular/core';
import { ShortcutsService } from '../../../../core/services/shortcuts/shortcuts.service';
import { Hotkey } from 'angular2-hotkeys';
import { TranslatePipe } from '@ngx-translate/core';

interface Shortcut {
  keys: string[];
  description: string;
}

@Component({
  selector: 'teammapper-shortcut-list',
  templateUrl: './shortcut-list.component.html',
  styleUrls: ['./shortcut-list.component.scss'],
  imports: [TranslatePipe],
})
export class ShortcutListComponent implements OnInit {
  private shortcutsService = inject(ShortcutsService);

  public shortcuts: Shortcut[] = [];

  public ngOnInit() {
    const hotKeys: Hotkey[] = this.shortcutsService.getHotKeys();
    this.shortcuts = hotKeys.map((hotKey: Hotkey) => {
      const keys = hotKey.combo[0];

      return {
        keys: keys === '+' ? [keys] : keys.split('+'),
        // angular2-hotkeys widens this to `string | Function`; every hotkey
        // here comes from ShortcutsService, which only passes strings.
        description: hotKey.description as string,
      };
    });
  }
}
