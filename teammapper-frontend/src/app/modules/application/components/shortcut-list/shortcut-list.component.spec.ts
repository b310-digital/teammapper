import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Hotkey } from 'angular2-hotkeys';
import { ShortcutsService } from 'src/app/core/services/shortcuts/shortcuts.service';
import { ShortcutListComponent } from './shortcut-list.component';

describe('ShortcutListComponent', () => {
  function render(hotKeys: Hotkey[]): HTMLElement {
    TestBed.configureTestingModule({
      imports: [ShortcutListComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: ShortcutsService,
          useValue: { getHotKeys: () => hotKeys },
        },
      ],
    });

    const fixture = TestBed.createComponent(ShortcutListComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  function keysOf(item: Element): string[] {
    return Array.from(item.querySelectorAll('.key')).map(
      key => key.textContent?.trim() ?? ''
    );
  }

  it('splits a combo into its keys', () => {
    const element = render([
      new Hotkey('ctrl+c', () => false, undefined, 'TOOLTIPS.COPY_NODE'),
    ]);

    const items = element.querySelectorAll('li.shortcut');
    expect(items).toHaveLength(1);
    expect(keysOf(items[0])).toEqual(['ctrl', 'c']);
    expect(items[0].querySelector('.description')?.textContent?.trim()).toBe(
      'TOOLTIPS.COPY_NODE'
    );
  });

  it('keeps + as a single key', () => {
    const element = render([
      new Hotkey('+', () => false, undefined, 'TOOLTIPS.ADD_NODE'),
    ]);

    expect(keysOf(element.querySelectorAll('li.shortcut')[0])).toEqual(['+']);
  });

  it('shows only the first combo of a hotkey with several', () => {
    const element = render([
      new Hotkey(
        ['-', 'backspace'],
        () => false,
        undefined,
        'TOOLTIPS.REMOVE_NODE'
      ),
    ]);

    expect(keysOf(element.querySelectorAll('li.shortcut')[0])).toEqual(['-']);
  });

  it('lists every hotkey', () => {
    const element = render([
      new Hotkey('?', () => false, undefined, 'TOOLTIPS.SHORTCUTS'),
      new Hotkey('alt+s', () => false, undefined, 'TOOLTIPS.SETTINGS'),
      new Hotkey('c', () => false, undefined, 'TOOLTIPS.CENTER_MAP'),
    ]);

    expect(element.querySelectorAll('li.shortcut')).toHaveLength(3);
  });
});
