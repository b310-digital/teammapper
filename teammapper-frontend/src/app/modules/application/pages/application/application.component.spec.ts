import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { ReportedMapStoreError } from '../../../../core/services/map-backend/map-store';
import { MapSyncService } from '../../../../core/services/map-sync/map-sync.service';
import { ServerMap } from '../../../../core/services/map-sync/server-types';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { UtilsService } from '../../../../core/services/utils/utils.service';
import { DialogService } from 'src/app/core/services/dialog/dialog.service';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { createMockUtilsService } from '../../../../../test/mocks/utils-service.mock';
import { ApplicationComponent } from './application.component';

describe('ApplicationComponent', () => {
  let prepareExistingMap: jest.Mock<Promise<ServerMap | null>>;
  let router: { navigate: jest.Mock };
  let utilsService: jest.Mocked<UtilsService>;

  beforeEach(() => {
    prepareExistingMap = jest.fn();
    router = { navigate: jest.fn().mockResolvedValue(true) };
    utilsService = createMockUtilsService();

    TestBed.configureTestingModule({
      imports: [ApplicationComponent],
      providers: [
        {
          provide: MapSyncService,
          useValue: {
            prepareExistingMap,
            getAttachedNodeObservable: () => NEVER,
            getConnectionStatusObservable: () => NEVER,
          },
        },
        { provide: MmpService, useValue: { mapCreated$: of(false) } },
        {
          provide: SettingsService,
          useValue: { getEditModeObservable: () => of(false) },
        },
        { provide: StorageService, useValue: { cleanExpired: jest.fn() } },
        {
          provide: DialogService,
          useValue: { closeDisconnectDialog: jest.fn() },
        },
        { provide: UtilsService, useValue: utilsService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: new Map([['id', 'map-1']]),
              fragment: 'secret',
            },
          },
        },
        { provide: Router, useValue: router },
      ],
    });
    TestBed.overrideComponent(ApplicationComponent, {
      set: { template: '', imports: [] },
    });
  });

  /** Creates the component and lets it finish loading the map. */
  async function open(): Promise<void> {
    const fixture = TestBed.createComponent(ApplicationComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
  }

  it('returns to the start page with a not found toast for an unknown map', async () => {
    prepareExistingMap.mockResolvedValue(null);

    await open();

    expect(router.navigate).toHaveBeenCalledWith(['/'], {
      queryParams: {
        toastMessage: 'TOASTS.ERRORS.MAP_COULD_NOT_BE_FOUND',
        toastIsError: 1,
      },
    });
  });

  // The map store showed its own toast, which a second one would contradict.
  it('returns to the start page without a toast when the map store reported the failure', async () => {
    prepareExistingMap.mockRejectedValue(new ReportedMapStoreError('blocked'));

    await open();

    expect(utilsService.translate).not.toHaveBeenCalledWith(
      'TOASTS.ERRORS.MAP_COULD_NOT_BE_FOUND'
    );
    expect(router.navigate).toHaveBeenCalledWith(['']);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });
});
