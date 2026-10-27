import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { ClientListEntry } from 'src/app/core/services/map-sync/yjs-utils';
import { ClientColorPanelsComponent } from './client-color-panels.component';

describe('ClientColorPanelsComponent', () => {
  let fixture: ComponentFixture<ClientColorPanelsComponent>;
  let clients$: BehaviorSubject<ClientListEntry[]>;

  const peer = (
    clientId: string,
    displayName = '',
    color = '#673AB7'
  ): ClientListEntry => ({ clientId, color, displayName, isSelf: false });

  async function render(clients: ClientListEntry[]) {
    clients$ = new BehaviorSubject(clients);

    await TestBed.configureTestingModule({
      imports: [ClientColorPanelsComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: MapSyncService,
          useValue: { getClientListObservable: () => clients$ },
        },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      CLIENT_LIST: { ANONYMOUS: 'Anonymous' },
    });
    translate.use('en');

    fixture = TestBed.createComponent(ClientColorPanelsComponent);
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function entries(): HTMLElement[] {
    return Array.from(root().querySelectorAll<HTMLElement>('.client'));
  }

  function entryLabelled(label: string): HTMLElement {
    const entry = entries().find(
      element => element.getAttribute('aria-label') === label
    );
    if (!entry) throw new Error(`No client labelled ${label}`);
    return entry;
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('a client with a display name', () => {
    beforeEach(() => render([peer('7', 'Vorname Test')]));

    it('shows its initials', () => {
      expect(entryLabelled('Vorname Test').textContent?.trim()).toBe('VT');
    });

    it('rings the circle in the client color', () => {
      const initials = entryLabelled('Vorname Test').querySelector(
        '.initials'
      ) as HTMLElement;

      expect(initials.style.borderColor).toBe('rgb(103, 58, 183)');
    });

    it('shows no generic icon', () => {
      expect(root().querySelector('mat-icon')).toBeNull();
    });
  });

  describe('a client without a display name', () => {
    beforeEach(() => render([peer('7')]));

    it('shows the generic icon in its client color', () => {
      const icon = entries()[0].querySelector('mat-icon') as HTMLElement;

      expect(icon.textContent?.trim()).toBe('account_circle');
      expect(icon.style.color).toBe('rgb(103, 58, 183)');
    });

    it('is labelled anonymous', () => {
      expect(entries()[0].getAttribute('aria-label')).toBe('Anonymous');
    });
  });

  it('shows one entry for each of two clients that share a color', async () => {
    await render([peer('7', 'Vorname'), peer('8', 'Zweiter')]);

    expect(entries()).toHaveLength(2);
  });

  it('updates the entry when a remote client renames', async () => {
    await render([peer('7', 'Vorname')]);

    clients$.next([peer('7', 'Zweiter Test')]);
    fixture.detectChanges();

    expect(entryLabelled('Zweiter Test').textContent?.trim()).toBe('ZT');
  });

  it('renders a name holding markup as text', async () => {
    const markup = '<img src=x onerror=alert(1)>';
    await render([peer('7', markup)]);

    expect(root().querySelector('img')).toBeNull();
  });
});
