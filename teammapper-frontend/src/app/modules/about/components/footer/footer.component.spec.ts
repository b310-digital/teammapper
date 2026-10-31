import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import {
  TranslateModule,
  TranslateService,
  TranslateLoader,
} from '@ngx-translate/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { of, Observable } from 'rxjs';
import { FooterComponent } from './footer.component';
import {
  MapNodeSettings,
  SystemSettings,
  UserSettings,
} from '@teammapper/shared';

class FakeTranslateLoader implements TranslateLoader {
  getTranslation(): Observable<Record<string, string>> {
    return of({});
  }
}

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;
  let mockSettingsService: Partial<SettingsService>;
  let mockTranslateService: jest.Mocked<TranslateService>;

  const mockNode: MapNodeSettings = {
    name: '',
    link: { href: '' },
    image: { src: '', size: 60 },
    colors: { name: '#787878', background: '#f9f9f9', branch: '#577a96' },
    font: { size: 16, style: 'normal', weight: 'normal' },
  };

  const mockSettings: UserSettings = {
    general: { language: 'en', darkMode: false, displayName: '' },
    mapOptions: {
      autoBranchColors: true,
      fontMaxSize: 16,
      fontMinSize: 12,
      fontIncrement: 2,
      centerOnResize: true,
      showLinktext: false,
      branchStyle: 'tapered',
      defaultNode: mockNode,
      rootNode: mockNode,
    },
  };

  const repositoryUrl = 'https://github.com/b310-digital/teammapper';
  const legalUrls = {
    imprintUrl: 'https://teammapper.localhost/imprint',
    privacyUrl: 'https://teammapper.localhost/privacy',
  };

  const linkHrefs = (): (string | null)[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.links a')
    ).map(link => link.getAttribute('href'));

  /** Renders a fresh footer whose system settings carry the given urls. */
  const renderWithUrls = (
    urls: Pick<SystemSettings['urls'], 'imprintUrl' | 'privacyUrl'> | null
  ): void => {
    jest
      .mocked(mockSettingsService.getCachedSystemSettings)
      ?.mockReturnValue(urls ? ({ urls } as SystemSettings) : null);
    fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    mockSettingsService = {
      getCachedUserSettings: jest.fn().mockReturnValue(mockSettings),
      getCachedSystemSettings: jest.fn().mockReturnValue(null),
      updateCachedSettings: jest.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      providers: [{ provide: SettingsService, useValue: mockSettingsService }],
      imports: [
        TranslateModule.forRoot({
          loader: { provide: TranslateLoader, useClass: FakeTranslateLoader },
          fallbackLang: 'en',
        }),
        MatIconModule,
        MatSelectModule,
        BrowserAnimationsModule,
        FooterComponent,
      ],
    }).compileComponents();

    mockTranslateService = TestBed.inject(
      TranslateService
    ) as unknown as jest.Mocked<TranslateService>;
    jest
      .spyOn(mockTranslateService, 'use')
      .mockImplementation(() => of({ lang: 'en' }));

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Initialization', () => {
    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with correct settings and languages', () => {
      expect(mockSettingsService.getCachedUserSettings).toHaveBeenCalled();
      expect(component.languages).toEqual(SettingsService.LANGUAGES);
      expect(component.currentYear).toBe(new Date().getFullYear().toString());
    });
  });

  describe('Legal links', () => {
    it('shows the imprint and privacy links when the settings set both', () => {
      renderWithUrls(legalUrls);

      expect(linkHrefs()).toEqual([
        repositoryUrl,
        legalUrls.imprintUrl,
        legalUrls.privacyUrl,
      ]);
    });

    it('shows only the privacy link when the imprint url is null', () => {
      renderWithUrls({ imprintUrl: null, privacyUrl: legalUrls.privacyUrl });

      expect(linkHrefs()).toEqual([repositoryUrl, legalUrls.privacyUrl]);
    });

    it('hides both links when the urls are empty', () => {
      renderWithUrls({ imprintUrl: '', privacyUrl: '' });

      expect(linkHrefs()).toEqual([repositoryUrl]);
    });

    it('hides both links without system settings', () => {
      renderWithUrls(null);

      expect(linkHrefs()).toEqual([repositoryUrl]);
    });
  });

  describe('Behavior', () => {
    it('should update language', async () => {
      const newSettings = {
        ...mockSettings,
        general: { language: 'fr', darkMode: false, displayName: '' },
      };
      component.settings = newSettings;
      await component.updateLanguage();

      expect(mockSettingsService.updateCachedSettings).toHaveBeenCalledWith(
        newSettings
      );
      expect(mockTranslateService.use).toHaveBeenCalledWith('fr');
    });
  });
});
