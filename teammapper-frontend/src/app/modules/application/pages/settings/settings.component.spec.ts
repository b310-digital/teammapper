import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MapNodeSettings, UserSettings } from '@teammapper/shared';
import {
  AdditionalMapOptions,
  MmpService,
} from 'src/app/core/services/mmp/mmp.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { SettingsComponent } from './settings.component';

// The Map Options tab edits the font bounds of the open map, which MmpService
// only has once a map has been created. Opening /settings on its own has to
// leave that tab out rather than show made-up numbers.
describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let mapOptions$: BehaviorSubject<AdditionalMapOptions | null>;
  let updateMapOptions: jest.Mock;

  const node = (): MapNodeSettings => ({
    name: '',
    link: { href: '' },
    image: { src: '', size: 60 },
    colors: { name: '', background: '', branch: '', link: '' },
    font: { size: 16, style: 'normal', weight: 'normal' },
  });

  const userSettings = (): UserSettings => ({
    general: { language: 'en', darkMode: false },
    mapOptions: {
      centerOnResize: false,
      autoBranchColors: true,
      showLinktext: false,
      fontMaxSize: 70,
      fontMinSize: 15,
      fontIncrement: 5,
      defaultNode: node(),
      rootNode: node(),
    },
  });

  async function render(mapOptions: AdditionalMapOptions | null) {
    mapOptions$ = new BehaviorSubject(mapOptions);
    updateMapOptions = jest.fn();

    await TestBed.configureTestingModule({
      imports: [
        SettingsComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        provideRouter([]),
        {
          provide: MmpService,
          useValue: { additionalMapOptions$: mapOptions$ },
        },
        {
          provide: MapSyncService,
          useValue: {
            updateMapOptions,
            fetchUserMapsFromServer: async () => [],
            getAttachedMapObservable: () => new BehaviorSubject(null),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getCachedUserSettings: () => userSettings(),
            getEditModeObservable: () => new BehaviorSubject(true),
            getDefaultSettings: async () => ({ userSettings: userSettings() }),
            getCachedAdminMapEntries: async () => [],
          },
        },
        { provide: ToastrService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function tabLabels(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(
        '.mat-mdc-tab .mdc-tab__text-label'
      )
    ).map(label => (label as HTMLElement).textContent?.trim() ?? '');
  }

  afterEach(() => TestBed.resetTestingModule());

  it('shows the map options tab once a map holds options', async () => {
    await render({ fontMaxSize: 70, fontMinSize: 15, fontIncrement: 5 });

    expect(tabLabels()).toContain('PAGES.SETTINGS.MAP_OPTIONS');
  });

  it('leaves the map options tab out while no map has been created', async () => {
    await render(null);

    expect(tabLabels()).not.toContain('PAGES.SETTINGS.MAP_OPTIONS');
    expect(tabLabels()).toContain('PAGES.SETTINGS.GENERAL');
  });

  it('shows the map settings a peer changes while the page is open', async () => {
    await render({ fontMaxSize: 70, fontMinSize: 15, fontIncrement: 5 });

    mapOptions$.next({ fontMaxSize: 90, fontMinSize: 20, fontIncrement: 10 });

    expect(fixture.componentInstance.mapOptions()).toEqual({
      fontMaxSize: 90,
      fontMinSize: 20,
      fontIncrement: 10,
    });
  });

  it('keeps consecutive edits from the rendered form', async () => {
    await render({ fontMaxSize: 70, fontMinSize: 15, fontIncrement: 5 });
    updateMapOptions.mockImplementation((options: AdditionalMapOptions) => {
      mapOptions$.next({ ...options });
    });
    const root = fixture.nativeElement as HTMLElement;
    const tab = root.querySelectorAll<HTMLElement>('.mat-mdc-tab')[1];
    if (!tab) throw new Error('No map settings tab');
    tab.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    for (const [name, value] of [
      ['fontMinSize', '20'],
      ['fontMaxSize', '80'],
      ['fontIncrement', '7'],
    ]) {
      const input = root.querySelector<HTMLInputElement>(
        `input[name="${name}"]`
      );
      if (!input) throw new Error(`No ${name} input`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updateMapOptions).toHaveBeenLastCalledWith({
      fontMinSize: 20,
      fontMaxSize: 80,
      fontIncrement: 7,
    });
  });

  function changeMapOption(key: keyof AdditionalMapOptions, value: string) {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.addEventListener('change', event =>
      fixture.componentInstance.updateMapOptions(key, event)
    );
    input.dispatchEvent(new Event('change'));
  }

  it('hands an edited copy to MapSyncService', async () => {
    const options = { fontMaxSize: 70, fontMinSize: 15, fontIncrement: 5 };
    await render(options);

    changeMapOption('fontMaxSize', '80');

    expect(options.fontMaxSize).toBe(70);
    expect(updateMapOptions).toHaveBeenCalledWith({
      fontMaxSize: 80,
      fontMinSize: 15,
      fontIncrement: 5,
    });
  });

  it.each([6, 10, 12])(
    'preserves a stored minimum font size of %s when another field changes',
    async fontMinSize => {
      await render({ fontMaxSize: 70, fontMinSize, fontIncrement: 5 });

      changeMapOption('fontMaxSize', '80');

      expect(updateMapOptions).toHaveBeenCalledWith({
        fontMaxSize: 80,
        fontMinSize,
        fontIncrement: 5,
      });
    }
  );

  it('preserves a stored maximum below the form range when the increment changes', async () => {
    await render({ fontMaxSize: 10, fontMinSize: 6, fontIncrement: 2 });

    changeMapOption('fontIncrement', '3');

    expect(updateMapOptions).toHaveBeenCalledWith({
      fontMaxSize: 10,
      fontMinSize: 6,
      fontIncrement: 3,
    });
  });

  it.each<[keyof AdditionalMapOptions, string]>([
    ['fontMaxSize', '120'],
    ['fontMinSize', '10'],
    ['fontIncrement', '0'],
    ['fontMinSize', ''],
  ])(
    'drops an invalid edit to %s, so MmpService fills the default',
    async (key, value) => {
      const options = { fontMaxSize: 70, fontMinSize: 15, fontIncrement: 5 };
      await render(options);

      changeMapOption(key, value);

      expect(updateMapOptions).toHaveBeenCalledWith({
        ...options,
        [key]: undefined,
      });
    }
  );
});
