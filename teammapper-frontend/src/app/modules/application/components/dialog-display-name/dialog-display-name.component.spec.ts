import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { UserSettings } from '@teammapper/shared';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { DialogDisplayNameComponent } from './dialog-display-name.component';

describe('DialogDisplayNameComponent', () => {
  let fixture: ComponentFixture<DialogDisplayNameComponent>;
  let setDisplayName: jest.Mock;
  let close: jest.Mock;

  async function render(settings: UserSettings | null) {
    setDisplayName = jest.fn().mockResolvedValue(undefined);
    close = jest.fn();

    await TestBed.configureTestingModule({
      imports: [
        DialogDisplayNameComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        {
          provide: SettingsService,
          useValue: {
            getCachedUserSettings: () => settings,
            setDisplayName,
          },
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogDisplayNameComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const named = (displayName: string): UserSettings =>
    ({
      general: { language: 'en', darkMode: false, displayName },
    }) as UserSettings;

  function input(): HTMLInputElement {
    const element = (fixture.nativeElement as HTMLElement).querySelector(
      'input[name="displayName"]'
    );
    if (!(element instanceof HTMLInputElement)) throw new Error('No input');
    return element;
  }

  function button(selector: string): HTMLButtonElement {
    const element = (fixture.nativeElement as HTMLElement).querySelector(
      selector
    );
    if (!(element instanceof HTMLButtonElement))
      throw new Error(`No ${selector}`);
    return element;
  }

  function type(value: string) {
    input().value = value;
    input().dispatchEvent(new Event('input'));
  }

  async function settle() {
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
  }

  afterEach(() => TestBed.resetTestingModule());

  it('holds the current display name', async () => {
    await render(named('Vorname Test'));

    expect(input().value).toBe('Vorname Test');
  });

  it('starts empty while no settings are cached', async () => {
    await render(null);

    expect(input().value).toBe('');
  });

  it('tells the user that everyone on a map sees the name', async () => {
    await render(named(''));

    expect(fixture.nativeElement.textContent).toContain(
      'PAGES.SETTINGS.DISPLAY_NAME_HINT'
    );
  });

  describe('save', () => {
    beforeEach(() => render(named('')));

    it('stores the typed name', async () => {
      type('Vorname Test');

      button('.save-button').click();
      await settle();

      expect(setDisplayName).toHaveBeenCalledWith('Vorname Test');
    });

    it('closes the dialog after it stored the name', async () => {
      const calls: string[] = [];
      setDisplayName.mockImplementation(async () => {
        calls.push('store');
      });
      close.mockImplementation(() => calls.push('close'));
      type('Vorname');

      button('.save-button').click();
      await settle();

      expect(calls).toEqual(['store', 'close']);
    });

    it('stores on Enter', async () => {
      type('Vorname');

      input().form?.dispatchEvent(new Event('submit'));
      await settle();

      expect(setDisplayName).toHaveBeenCalledWith('Vorname');
    });
  });

  describe('cancel', () => {
    beforeEach(() => render(named('Vorname Test')));

    it('closes the dialog and keeps the name', async () => {
      type('Zweiter');

      button('.cancel-button').click();
      await settle();

      expect(close).toHaveBeenCalledTimes(1);
      expect(setDisplayName).not.toHaveBeenCalled();
    });
  });
});
