import { Component, OnInit, inject } from '@angular/core';
import { ShortcutsService } from '../../../../core/services/shortcuts/shortcuts.service';
import { Hotkey } from 'angular2-hotkeys';
import { Location } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { MatDialogTitle } from '@angular/material/dialog';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatList, MatListItem } from '@angular/material/list';
import { TranslatePipe } from '@ngx-translate/core';

interface Shortcut {
  keys: string[];
  description: string;
}

@Component({
  selector: 'teammapper-shortcuts',
  templateUrl: './shortcuts.component.html',
  styleUrls: ['./shortcuts.component.scss'],
  imports: [
    MatToolbar,
    MatDialogTitle,
    MatIconButton,
    MatIcon,
    MatList,
    MatListItem,
    TranslatePipe,
  ],
})
export class ShortcutsComponent implements OnInit {
  private shortcutsService = inject(ShortcutsService);
  private location = inject(Location);

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

  public back() {
    this.location.back();
  }
}
