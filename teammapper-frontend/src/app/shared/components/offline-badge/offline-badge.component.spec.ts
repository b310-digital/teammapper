import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OFFLINE_MODE } from 'src/app/core/services/map-backend/map-backend-config';
import { OfflineBadgeComponent } from './offline-badge.component';

describe('OfflineBadgeComponent', () => {
  let fixture: ComponentFixture<OfflineBadgeComponent>;

  async function render(offline: boolean, withDescription = false) {
    await TestBed.configureTestingModule({
      imports: [OfflineBadgeComponent, TranslateModule.forRoot()],
      providers: [{ provide: OFFLINE_MODE, useValue: offline }],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      OFFLINE_MODE: { LABEL: 'Offline mode', DESCRIPTION: 'Nothing syncs.' },
    });
    translate.use('en');

    fixture = TestBed.createComponent(OfflineBadgeComponent);
    fixture.componentRef.setInput('withDescription', withDescription);
    fixture.detectChanges();
  }

  function badge(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(
      '.offline-badge'
    );
  }

  afterEach(() => TestBed.resetTestingModule());

  it('renders nothing in the web version', async () => {
    await render(false);

    expect(badge()).toBeNull();
  });

  describe('in the offline build', () => {
    it('reads "Offline mode"', async () => {
      await render(true);

      expect(badge()?.querySelector('.label')?.textContent).toBe(
        'Offline mode'
      );
    });

    it('puts the description in the tooltip', async () => {
      await render(true);

      expect(badge()?.getAttribute('title')).toBe('Nothing syncs.');
    });

    it('keeps the description for screen readers', async () => {
      await render(true);

      expect(badge()?.querySelector('.description.visually-hidden')).not.toBe(
        null
      );
    });

    it('shows the description and drops the tooltip on request', async () => {
      await render(true, true);

      const description = badge()?.querySelector('.description');
      expect(description?.classList).not.toContain('visually-hidden');
      expect(description?.textContent?.trim()).toBe('Nothing syncs.');
      expect(badge()?.hasAttribute('title')).toBe(false);
    });
  });
});
