import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SystemSettings } from '@teammapper/shared';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { ShortcutsService } from 'src/app/core/services/shortcuts/shortcuts.service';
import { DialogAboutComponent } from './dialog-about.component';

describe('DialogAboutComponent', () => {
  const legalUrls = {
    imprintUrl: 'https://teammapper.localhost/imprint',
    privacyUrl: 'https://teammapper.localhost/privacy',
  };

  let fixture: ComponentFixture<DialogAboutComponent>;
  let getCachedSystemSettings: jest.Mock<SystemSettings | null>;

  /** Hrefs of the links that open in a new tab, the repository link first. */
  const linkHrefs = (): (string | null)[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'a[target="_blank"]'
      )
    ).map(link => link.getAttribute('href'));

  /** Renders the dialog with system settings that carry the given urls. */
  const renderWithUrls = (
    urls: Pick<SystemSettings['urls'], 'imprintUrl' | 'privacyUrl'> | null
  ): void => {
    getCachedSystemSettings.mockReturnValue(
      urls ? ({ urls } as SystemSettings) : null
    );
    fixture = TestBed.createComponent(DialogAboutComponent);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    getCachedSystemSettings = jest.fn().mockReturnValue(null);
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), DialogAboutComponent],
      providers: [
        {
          provide: SettingsService,
          useValue: { getCachedSystemSettings, getLanguage: () => 'en' },
        },
        { provide: ShortcutsService, useValue: { getHotKeys: () => [] } },
      ],
    }).compileComponents();
  });

  it('shows the imprint and privacy links when the settings set both', () => {
    renderWithUrls(legalUrls);

    expect(linkHrefs()).toEqual([
      'https://github.com/b310-digital/teammapper',
      legalUrls.imprintUrl,
      legalUrls.privacyUrl,
    ]);
  });

  it('shows only the imprint link when the privacy url is null', () => {
    renderWithUrls({ imprintUrl: legalUrls.imprintUrl, privacyUrl: null });

    expect(linkHrefs()).toEqual([
      'https://github.com/b310-digital/teammapper',
      legalUrls.imprintUrl,
    ]);
  });

  it('hides both links when the urls are empty', () => {
    renderWithUrls({ imprintUrl: '', privacyUrl: '' });

    expect(linkHrefs()).toEqual(['https://github.com/b310-digital/teammapper']);
  });

  it('hides both links without system settings', () => {
    renderWithUrls(null);

    expect(linkHrefs()).toEqual(['https://github.com/b310-digital/teammapper']);
  });
});
