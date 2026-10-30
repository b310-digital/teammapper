import { Type } from '@angular/core';
import {
  APP_BASE_HREF,
  HashLocationStrategy,
  LocationStrategy,
  PathLocationStrategy,
} from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject } from 'rxjs';
import { CachedAdminMapEntry, CachedMapEntry } from '@teammapper/shared';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { MAP_STORE } from 'src/app/core/services/map-backend/map-store';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { OFFLINE_MODE } from 'src/app/core/services/map-backend/map-backend-config';
import { MindmapsOverview } from './mindmaps-overview.component';

describe('MindmapsOverview', () => {
  let fixture: ComponentFixture<MindmapsOverview>;
  let mapSyncService: { getAttachedMapObservable: jest.Mock };
  let mapStore: { listMaps: jest.Mock; deleteMap: jest.Mock };
  let storageService: { remove: jest.Mock };
  let toastrService: { success: jest.Mock; error: jest.Mock };
  let router: { url: string; navigate: jest.Mock; createUrlTree: jest.Mock };

  function entry(
    id: string,
    adminId: string | null,
    ttl: Date | null = new Date('2099-01-01')
  ): CachedAdminMapEntry {
    return {
      id,
      cachedAdminMapValue: {
        adminId,
        modificationSecret: null,
        ttl,
        rootName: id,
      },
    };
  }

  async function render(
    entries: CachedAdminMapEntry[],
    attachedMap: CachedMapEntry | null = null,
    deleted = true,
    offline = false,
    locationStrategy: Type<LocationStrategy> = PathLocationStrategy
  ) {
    mapSyncService = {
      getAttachedMapObservable: jest.fn(() => new BehaviorSubject(attachedMap)),
    };
    mapStore = {
      listMaps: jest.fn(async () => entries),
      deleteMap: jest.fn(async () => deleted),
    };
    storageService = { remove: jest.fn(async () => undefined) };
    toastrService = { success: jest.fn(), error: jest.fn() };
    router = {
      url: '/map/map-1',
      navigate: jest.fn(),
      createUrlTree: jest.fn(([path]: string[]) => ({ toString: () => path })),
    };

    await TestBed.configureTestingModule({
      imports: [MindmapsOverview, TranslateModule.forRoot()],
      providers: [
        { provide: OFFLINE_MODE, useValue: offline },
        { provide: MapSyncService, useValue: mapSyncService },
        { provide: MAP_STORE, useValue: mapStore },
        {
          provide: SettingsService,
          useValue: { getCachedAdminMapEntries: async () => entries },
        },
        { provide: StorageService, useValue: storageService },
        { provide: ToastrService, useValue: toastrService },
        { provide: Router, useValue: router },
        { provide: APP_BASE_HREF, useValue: '/' },
        { provide: LocationStrategy, useClass: locationStrategy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MindmapsOverview);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function deleteButtons(): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.delete-map-button')
    );
  }

  function mapLinks(): (string | null)[] {
    return Array.from<HTMLAnchorElement>(
      fixture.nativeElement.querySelectorAll('a')
    ).map(link => link.getAttribute('href'));
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
  });

  it('shows the storage notice in the offline build', async () => {
    await render([entry('map-1', 'admin-1')], null, true, true);

    expect(
      fixture.nativeElement.querySelectorAll('.storage-notice')
    ).toHaveLength(1);
  });

  it('shows no storage notice in the web build', async () => {
    await render([entry('map-1', 'admin-1')]);

    expect(
      fixture.nativeElement.querySelectorAll('.storage-notice')
    ).toHaveLength(0);
  });

  it('shows the deletion date of a map that has one', async () => {
    await render([entry('map-1', 'admin-1')]);

    expect(fixture.nativeElement.querySelectorAll('.map-ttl')).toHaveLength(2);
  });

  it('shows no deletion date for a map without one', async () => {
    await render([entry('map-1', 'admin-1', null)]);

    expect(fixture.nativeElement.querySelectorAll('.map-ttl')).toHaveLength(0);
  });

  it('links a map by its path in the web build', async () => {
    await render([entry('map-1', 'admin-1')]);

    expect(mapLinks()).toEqual(['/map/map-1', '/map/map-1']);
  });

  it('links a map through the hash in the offline build', async () => {
    await render(
      [entry('map-1', 'admin-1')],
      null,
      true,
      false,
      HashLocationStrategy
    );

    expect(mapLinks()).toEqual(['#/map/map-1', '#/map/map-1']);
  });

  it('shows a delete button only for maps with an admin id', async () => {
    await render([entry('map-1', 'admin-1'), entry('map-2', null)]);

    // Both lists show both maps, and each list offers one button.
    expect(deleteButtons()).toHaveLength(2);
  });

  it('deletes a map that is not open and drops it from both lists', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await render([entry('map-1', 'admin-1')]);

    await fixture.componentInstance.deleteMap(entry('map-1', 'admin-1'));

    expect(mapStore.deleteMap).toHaveBeenCalledWith('map-1', 'admin-1');
    expect(storageService.remove).toHaveBeenCalledWith('map-1');
    expect(fixture.componentInstance.ownedEntries()).toEqual([]);
    expect(fixture.componentInstance.cachedAdminMapEntries()).toEqual([]);
    expect(toastrService.success).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('leaves for the start page after deleting the open map', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const openMap = { key: 'map-1', cachedMap: { uuid: 'map-1' } };
    await render([entry('map-1', 'admin-1')], openMap as CachedMapEntry);

    await fixture.componentInstance.deleteMap(entry('map-1', 'admin-1'));

    expect(router.navigate).toHaveBeenCalled();
  });

  it('stays on the start page after deleting the last opened map', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const openMap = { key: 'map-1', cachedMap: { uuid: 'map-1' } };
    await render([entry('map-1', 'admin-1')], openMap as CachedMapEntry);
    router.url = '/';

    await fixture.componentInstance.deleteMap(entry('map-1', 'admin-1'));

    expect(router.navigate).not.toHaveBeenCalled();
    expect(toastrService.success).toHaveBeenCalled();
  });

  it('keeps the map listed when the server rejects the deletion', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await render([entry('map-1', 'admin-1')], null, false);

    await fixture.componentInstance.deleteMap(entry('map-1', 'admin-1'));

    expect(storageService.remove).not.toHaveBeenCalled();
    expect(fixture.componentInstance.ownedEntries()).toHaveLength(1);
    expect(toastrService.error).toHaveBeenCalled();
  });

  it('keeps the map when the confirmation is declined', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    await render([entry('map-1', 'admin-1')]);

    await fixture.componentInstance.deleteMap(entry('map-1', 'admin-1'));

    expect(mapStore.deleteMap).not.toHaveBeenCalled();
  });
});
