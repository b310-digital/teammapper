import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import {
  MapNodeSettings,
  UserMapOptions,
  UserSettings,
} from '@teammapper/shared';
import {
  AdditionalMapOptions,
  MmpService,
} from 'src/app/core/services/mmp/mmp.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { DialogSettingsComponent } from './dialog-settings.component';

// The Mind map tab edits the font bounds of the open map, which MmpService
// only has once a map has been created. Until then the dialog has to leave
// that tab out rather than show made-up numbers.
describe('DialogSettingsComponent', () => {
  let fixture: ComponentFixture<DialogSettingsComponent>;
  let mapOptions$: BehaviorSubject<AdditionalMapOptions | null>;
  let updateMapOptions: jest.Mock;
  let updateUserMapOptions: jest.Mock;
  let updateCachedSettings: jest.Mock;

  const node = (): MapNodeSettings => ({
    name: '',
    link: { href: '' },
    image: { src: '', size: 60 },
    colors: { name: '', background: '', branch: '', link: '' },
    font: { size: 16, style: 'normal', weight: 'normal' },
  });

  let setDisplayName: jest.Mock;
  let setLanguage: jest.Mock;
  let setUserMapOptions: jest.Mock;
  let storedDisplayName = '';
  let cachedSettings: UserSettings;
  let userSettings$: BehaviorSubject<UserSettings | null>;

  const userSettings = (): UserSettings => ({
    general: {
      language: 'en',
      darkMode: false,
      displayName: storedDisplayName,
    },
    mapOptions: {
      centerOnResize: false,
      autoBranchColors: true,
      showLinktext: false,
      branchStyle: 'tapered',
      fontMaxSize: 70,
      fontMinSize: 15,
      fontIncrement: 5,
      defaultNode: node(),
      rootNode: node(),
    },
  });

  async function render(
    mapOptions: AdditionalMapOptions | null,
    editMode = true,
    cached: UserSettings = userSettings()
  ) {
    mapOptions$ = new BehaviorSubject(mapOptions);
    updateMapOptions = jest.fn();
    updateUserMapOptions = jest.fn();
    updateCachedSettings = jest.fn().mockResolvedValue(undefined);
    setDisplayName = jest.fn().mockResolvedValue(undefined);
    setLanguage = jest.fn().mockResolvedValue(undefined);
    setUserMapOptions = jest.fn().mockResolvedValue(undefined);
    // SettingsService hands out the one object it caches, as the real one does.
    cachedSettings = cached;
    userSettings$ = new BehaviorSubject<UserSettings | null>(cachedSettings);

    await TestBed.configureTestingModule({
      imports: [
        DialogSettingsComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        provideRouter([]),
        {
          provide: MmpService,
          useValue: {
            additionalMapOptions$: mapOptions$,
            updateUserMapOptions,
          },
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
            userSettings: userSettings$,
            getCachedUserSettings: () => cachedSettings,
            updateCachedSettings,
            setDisplayName,
            setLanguage,
            setUserMapOptions,
            getEditModeObservable: () => new BehaviorSubject(editMode),
            getDefaultSettings: async () => ({ userSettings: userSettings() }),
            getCachedAdminMapEntries: async () => [],
          },
        },
        { provide: ToastrService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogSettingsComponent);
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

  afterEach(() => {
    storedDisplayName = '';
    TestBed.resetTestingModule();
  });

  describe('display name field', () => {
    function displayNameInput(): HTMLInputElement {
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        'input[name="displayName"]'
      );
      if (!(input instanceof HTMLInputElement))
        throw new Error('No display name input');
      return input;
    }

    it('sits on the general tab, with its label and hint', async () => {
      await render(null);

      displayNameInput();
      const text = fixture.nativeElement.textContent;
      expect(text).toContain('PAGES.SETTINGS.DISPLAY_NAME');
      expect(text).toContain('PAGES.SETTINGS.DISPLAY_NAME_HINT');
    });

    it('stores a changed display name', async () => {
      await render(null);
      const input = displayNameInput();

      input.value = 'Vorname Test';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect(setDisplayName).toHaveBeenCalledWith('Vorname Test');
    });

    // Escape closes the dialog without a change event, and a later save of
    // another setting must not store the half-typed name.
    it('leaves the cached settings alone until the field commits', async () => {
      storedDisplayName = 'Vorname';
      await render(null);
      const input = displayNameInput();

      input.value = 'Half typ';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      expect(cachedSettings.general.displayName).toBe('Vorname');
    });

    it('shows the stored name once the field commits', async () => {
      await render(null);
      setDisplayName.mockImplementation(async (name: string) => {
        cachedSettings.general.displayName = name.trim();
      });
      const input = displayNameInput();

      input.value = '  Vorname  ';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(displayNameInput().value).toBe('Vorname');
    });
  });

  it('shows the mind map tab once a map holds options', async () => {
    await render({ fontMaxSize: 70, fontMinSize: 15, fontIncrement: 5 });

    expect(tabLabels()).toContain('PAGES.SETTINGS.MIND_MAP');
  });

  it('leaves the mind map tab out while no map has been created', async () => {
    await render(null);

    expect(tabLabels()).not.toContain('PAGES.SETTINGS.MIND_MAP');
    expect(tabLabels()).toContain('PAGES.SETTINGS.GENERAL');
  });

  describe('the mind map tab', () => {
    const defaultOptions = {
      fontMaxSize: 70,
      fontMinSize: 15,
      fontIncrement: 5,
    };

    async function openMindMapTab() {
      const root = fixture.nativeElement as HTMLElement;
      const tab = root.querySelectorAll<HTMLElement>('.mat-mdc-tab')[1];
      if (!tab) throw new Error('No mind map tab');
      tab.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return root;
    }

    function group(root: HTMLElement, name: string): HTMLElement {
      const element = root.querySelector<HTMLElement>(`.${name}-group`);
      if (!element) throw new Error(`No ${name} group`);
      return element;
    }

    it('heads the map settings first, then the user settings', async () => {
      await render(defaultOptions);
      const root = await openMindMapTab();

      const headings = Array.from(
        root.querySelectorAll('.settings-group-heading')
      ).map(heading => heading.textContent?.trim());

      expect(headings).toEqual([
        'PAGES.SETTINGS.MAP_SETTINGS',
        'PAGES.SETTINGS.USER_SETTINGS',
      ]);
    });

    it('explains both groups', async () => {
      await render(defaultOptions);
      const root = await openMindMapTab();

      expect(group(root, 'map-settings').textContent).toContain(
        'PAGES.SETTINGS.MAP_SETTINGS_EXPLANATION'
      );
      expect(group(root, 'user-settings').textContent).toContain(
        'PAGES.SETTINGS.USER_SETTINGS_EXPLANATION'
      );
    });

    it('puts the font sizes under the map settings only', async () => {
      await render(defaultOptions);
      const root = await openMindMapTab();

      for (const name of ['fontMinSize', 'fontMaxSize', 'fontIncrement']) {
        const selector = `input[name="${name}"]`;
        expect(group(root, 'map-settings').querySelector(selector)).not.toBe(
          null
        );
        expect(group(root, 'user-settings').querySelector(selector)).toBe(null);
      }
    });

    it('puts the branch style under the user settings', async () => {
      await render(defaultOptions);
      const root = await openMindMapTab();

      expect(
        group(root, 'user-settings').querySelector('mat-select.branch-style')
      ).not.toBe(null);
    });

    it('shows the hints of the settings that write onto nodes', async () => {
      await render(defaultOptions);
      const root = await openMindMapTab();
      const text = group(root, 'user-settings').textContent;

      expect(text).toContain('PAGES.SETTINGS.AUTO_BRANCH_COLORS_HINT');
      expect(text).toContain('PAGES.SETTINGS.NODE_NAMES_HINT');
    });

    it('disables the map settings for a read-only viewer only', async () => {
      await render(defaultOptions, false);
      const root = await openMindMapTab();

      const mapInputs = group(root, 'map-settings').querySelectorAll('input');
      const userInputs = group(root, 'user-settings').querySelectorAll(
        'input, mat-select'
      );
      expect(mapInputs.length).toBeGreaterThan(0);
      mapInputs.forEach(input => expect(input.disabled).toBe(true));
      expect(userInputs.length).toBeGreaterThan(0);
      userInputs.forEach(input =>
        expect(
          input.hasAttribute('disabled') ||
            input.getAttribute('aria-disabled') === 'true'
        ).toBe(false)
      );
    });
  });

  describe('the branch style', () => {
    it('shows tapered when the cached settings lack the key', async () => {
      const cached = userSettings();
      delete (cached.mapOptions as Partial<UserMapOptions>).branchStyle;
      await render(
        { fontMaxSize: 70, fontMinSize: 15, fontIncrement: 5 },
        true,
        cached
      );

      expect(fixture.componentInstance.settings?.mapOptions.branchStyle).toBe(
        'tapered'
      );
    });

    it('applies a new style to the open map', async () => {
      await render({ fontMaxSize: 70, fontMinSize: 15, fontIncrement: 5 });
      const settings = fixture.componentInstance.settings;
      if (!settings) throw new Error('No user settings');
      settings.mapOptions.branchStyle = 'curved';

      await fixture.componentInstance.updateGeneralMapOptions();

      expect(setUserMapOptions).toHaveBeenCalledWith(
        expect.objectContaining({ branchStyle: 'curved' })
      );
      expect(updateUserMapOptions).toHaveBeenCalledWith(
        expect.objectContaining({ branchStyle: 'curved' })
      );
    });
  });

  // The map stays drawn behind the dialog, so the map has to take the change.
  it('applies changed user settings to the open map', async () => {
    await render({ fontMaxSize: 70, fontMinSize: 15, fontIncrement: 5 });
    const settings = fixture.componentInstance.settings;
    if (!settings) throw new Error('No user settings');
    settings.mapOptions.showLinktext = true;

    await fixture.componentInstance.updateGeneralMapOptions();

    expect(updateUserMapOptions).toHaveBeenCalledWith(
      expect.objectContaining({ showLinktext: true })
    );
  });

  it('stores changed user settings before it applies them', async () => {
    await render(null);
    updateUserMapOptions.mockImplementation(() =>
      expect(setUserMapOptions).toHaveBeenCalled()
    );

    await fixture.componentInstance.updateGeneralMapOptions();

    expect(updateUserMapOptions).toHaveBeenCalledTimes(1);
  });

  describe('settings another tab saves while the dialog is open', () => {
    function savedInOtherTab(): void {
      const newer = userSettings();
      newer.general.displayName = 'Vorname Test';
      userSettings$.next(newer);
    }

    /** The settings the form edits. */
    function form(): UserSettings {
      const settings = fixture.componentInstance.settings;
      if (!settings) throw new Error('No user settings');
      return settings;
    }

    it('shows them in the form', async () => {
      await render(null);

      savedInOtherTab();
      fixture.detectChanges();
      await fixture.whenStable();

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        'input[name="displayName"]'
      );
      if (!(input instanceof HTMLInputElement)) throw new Error('No input');
      expect(input.value).toBe('Vorname Test');
    });

    // Storing the whole form would write the other tab's name back.
    it('stores only the changed language', async () => {
      await render(null);
      savedInOtherTab();

      form().general.language = 'de';
      await fixture.componentInstance.updateLanguage();

      expect(setLanguage).toHaveBeenCalledWith('de');
      expect(updateCachedSettings).not.toHaveBeenCalled();
    });

    it('stores only the changed map options', async () => {
      await render(null);
      savedInOtherTab();

      form().mapOptions.showLinktext = true;
      await fixture.componentInstance.updateGeneralMapOptions();

      expect(setUserMapOptions).toHaveBeenCalledWith(
        expect.objectContaining({ showLinktext: true })
      );
      expect(updateCachedSettings).not.toHaveBeenCalled();
    });
  });

  it('shows the map settings a peer changes while the dialog is open', async () => {
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
