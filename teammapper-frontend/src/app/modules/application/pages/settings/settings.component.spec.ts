import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { MapNodeSettings, UserSettings } from '@teammapper/shared';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { SettingsComponent } from './settings.component';

// The Map Options tab edits the font bounds of the open map, which MmpService
// only has once a map has been created. Opening /settings on its own has to
// leave that tab out rather than show made-up numbers.
describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let mmpService: { getAdditionalMapOptions: jest.Mock };

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

  async function render(mapOptions: unknown) {
    mmpService = { getAdditionalMapOptions: jest.fn(() => mapOptions) };

    await TestBed.configureTestingModule({
      imports: [
        SettingsComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        provideRouter([]),
        { provide: MmpService, useValue: mmpService },
        {
          provide: MapSyncService,
          useValue: {
            updateMapOptions: jest.fn(),
            fetchUserMapsFromServer: async () => [],
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
});
