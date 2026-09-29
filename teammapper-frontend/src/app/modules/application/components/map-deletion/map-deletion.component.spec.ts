import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CachedMapEntry } from '@teammapper/shared';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { MapDeletionComponent } from './map-deletion.component';

describe('MapDeletionComponent', () => {
  let fixture: ComponentFixture<MapDeletionComponent>;
  let mapSyncService: {
    getAttachedMapObservable: jest.Mock;
    deleteMap: jest.Mock;
  };
  let storageService: { get: jest.Mock; remove: jest.Mock };
  let router: { navigate: jest.Mock };
  let toastrService: { error: jest.Mock };

  const attachedMap = {
    key: 'map-1',
    cachedMap: {
      uuid: 'map-1',
      deleteAfterDays: 30,
      deletedAt: new Date('2026-10-28').getTime(),
    },
  } as CachedMapEntry;

  async function render(
    map: CachedMapEntry | null,
    storedMap: { adminId?: string } | null,
    deleted = true
  ) {
    mapSyncService = {
      getAttachedMapObservable: jest.fn(() => new BehaviorSubject(map)),
      deleteMap: jest.fn(async () => deleted),
    };
    toastrService = { error: jest.fn() };
    storageService = {
      get: jest.fn(async () => storedMap),
      remove: jest.fn(async () => undefined),
    };
    router = { navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [MapDeletionComponent, TranslateModule.forRoot()],
      providers: [
        { provide: MapSyncService, useValue: mapSyncService },
        { provide: StorageService, useValue: storageService },
        { provide: Router, useValue: router },
        { provide: ToastrService, useValue: toastrService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MapDeletionComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function deleteButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('button');
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
  });

  it('shows the deletion date of the attached map', async () => {
    await render(attachedMap, null);

    expect(
      fixture.nativeElement.querySelector('.deleted-at').textContent
    ).toContain('28.10.2026');
  });

  it('renders nothing while no map is attached', async () => {
    await render(null, null);

    expect(fixture.nativeElement.querySelector('mat-card')).toBeNull();
  });

  it('hides the delete button without an admin id', async () => {
    await render(attachedMap, {});

    expect(deleteButton()).toBeNull();
  });

  it('deletes the map with its admin id once confirmed', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await render(attachedMap, { adminId: 'admin-1' });

    await fixture.componentInstance.deleteMap();

    expect(mapSyncService.deleteMap).toHaveBeenCalledWith('map-1', 'admin-1');
    expect(storageService.remove).toHaveBeenCalledWith('map-1');
    expect(router.navigate).toHaveBeenCalled();
  });

  it('keeps the stored admin id when the deletion fails', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await render(attachedMap, { adminId: 'admin-1' }, false);

    await fixture.componentInstance.deleteMap();

    expect(storageService.remove).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(toastrService.error).toHaveBeenCalled();
  });

  it('keeps the map when the confirmation is declined', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    await render(attachedMap, { adminId: 'admin-1' });

    await fixture.componentInstance.deleteMap();

    expect(mapSyncService.deleteMap).not.toHaveBeenCalled();
  });
});
