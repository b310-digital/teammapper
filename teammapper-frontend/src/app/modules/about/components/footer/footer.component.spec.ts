import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import {
  TranslateModule,
  TranslateService,
  TranslateLoader,
} from '@ngx-translate/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { of, Observable } from 'rxjs';
import { FooterComponent } from './footer.component';
import { MapNodeSettings, UserSettings } from '@teammapper/shared';

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
    locked: true,
  };

  const mockSettings: UserSettings = {
    general: { language: 'en', darkMode: false },
    mapOptions: {
      autoBranchColors: true,
      fontMaxSize: 16,
      fontMinSize: 12,
      fontIncrement: 2,
      centerOnResize: true,
      showLinktext: false,
      defaultNode: mockNode,
      rootNode: mockNode,
    },
  };

  beforeEach(async () => {
    mockSettingsService = {
      getCachedUserSettings: jest.fn().mockReturnValue(mockSettings),
      updateCachedSettings: jest.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SettingsService, useValue: mockSettingsService },
      ],
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
      expect(component.languages).toEqual(['en', 'de']);
      expect(component.currentYear).toBe(new Date().getFullYear().toString());
    });
  });

  describe('Behavior', () => {
    it('should update language', async () => {
      const newSettings = {
        ...mockSettings,
        general: { language: 'fr', darkMode: false },
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
