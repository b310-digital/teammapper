import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { of } from 'rxjs';
import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;
  let mockSettingsService: Partial<SettingsService>;
  let mockTranslateService: jest.Mocked<TranslateService>;

  const mockSettings = {
    general: { language: 'en' },
    mapOptions: {
      autoBranchColors: true,
      fontMaxSize: 16,
      fontMinSize: 12,
      fontIncrement: 2,
      showLinktext: false,
    },
  };

  beforeEach(async () => {
    mockSettingsService = {
      getCachedUserSettings: jest.fn().mockReturnValue(mockSettings),
      updateCachedSettings: jest.fn().mockResolvedValue(undefined),
    };
    mockTranslateService = {
      use: jest.fn().mockReturnValue(Promise.resolve('en')),
      get: jest.fn().mockReturnValue(of('translated value')),
      instant: jest.fn().mockReturnValue('translated value'),
      onLangChange: of({ lang: 'en' }),
      onTranslationChange: of({}),
      onDefaultLangChange: of({}),
    } as unknown as jest.Mocked<TranslateService>;

    await TestBed.configureTestingModule({
      providers: [
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: TranslateService, useValue: mockTranslateService },
      ],
      imports: [
        TranslateModule.forRoot({
          defaultLanguage: 'en',
        }),
        MatIconModule,
        MatSelectModule,
        BrowserAnimationsModule,
        FooterComponent,
      ],
    }).compileComponents();

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
      expect(component.languages).toEqual([
        'en',
        'fr',
        'de',
        'it',
        'zh-tw',
        'zh-cn',
        'es',
        'pt-br',
      ]);
      expect(component.currentYear).toBe(new Date().getFullYear().toString());
    });
  });

  describe('Behavior', () => {
    it('should update language', async () => {
      const newSettings = {
        ...mockSettings,
        general: { language: 'fr' },
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
