import { Component, OnInit } from '@angular/core';
import { ShortcutsService } from '../../../../core/services/shortcuts/shortcuts.service';
import { Hotkey } from 'angular2-hotkeys';
import { Location, NgFor, NgIf } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { MatDialogTitle } from '@angular/material/dialog';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatList, MatListItem } from '@angular/material/list';
import { TranslatePipe } from '@ngx-translate/core';

interface Shortcut {
  keys: string[];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  description: string | Function;
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
    NgFor,
    MatListItem,
    NgIf,
    TranslatePipe,
  ],
})
export class ShortcutsComponent implements OnInit {
  public shortcuts: Shortcut[];

  constructor(
    private shortcutsService: ShortcutsService,
    private location: Location
  ) {}

  public ngOnInit() {
    const hotKeys: Hotkey[] = this.shortcutsService.getHotKeys();
    this.shortcuts = hotKeys.map((hotKey: Hotkey) => {
      const keys = hotKey.combo[0];

      return {
        keys: keys === '+' ? [keys] : keys.split('+'),
        description: hotKey.description,
      };
    });
  }

  public back() {
    this.location.back();
  }
}
