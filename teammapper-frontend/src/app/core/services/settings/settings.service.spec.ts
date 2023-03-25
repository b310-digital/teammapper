import { CachedAdminMapValue } from "src/app/shared/models/cached-map.model";
import { HttpService } from "../../http/http.service";
import { StorageService } from "../storage/storage.service";
import { SettingsService } from "./settings.service";

describe('SettingsService', () => {
  let settingsService: SettingsService;
  let httpServiceSpy: HttpService;
  let storageServiceSpy: StorageService;

  beforeEach(() => {
    httpServiceSpy = jasmine.createSpyObj('httpService', ['get', 'delete', 'post'])
    storageServiceSpy = jasmine.createSpyObj('storageService', ['get', 'getAll', 'getAllEntries', 'getAllCreatedMapsFromStorage'])
  })

  it('ignores old maps when returning from storage', async () => {
    const oldDate = new Date()
    oldDate.setFullYear(new Date().getFullYear() - 1);
    const cachedMapDataFromStorage: CachedAdminMapValue = { ttl: oldDate, modificationSecret: '456', adminId: '123', rootName: 'test' };
    (storageServiceSpy.getAllCreatedMapsFromStorage as any).and.returnValue(
      new Promise ((resolve) => resolve(
        [['123', cachedMapDataFromStorage]]
      ))
    );

    settingsService = new SettingsService(storageServiceSpy, httpServiceSpy);
    expect(await settingsService.getCachedAdminMapEntries()).toEqual([])
  })

  it('returns sorted cached maps from storage', async () => {
    const futureDateOne = new Date();
    futureDateOne.setFullYear(new Date().getFullYear() + 2);
    const futureDateTwo = new Date();
    futureDateTwo.setFullYear(new Date().getFullYear() + 1);
    const cachedMapDataFromStorage: CachedAdminMapValue = { ttl: futureDateOne, modificationSecret: '456', adminId: '123', rootName: 'test' };
    const otherCachedMapDataFromStorage: CachedAdminMapValue = { ttl: futureDateTwo, modificationSecret: '456', adminId: '123', rootName: 'test' };
    (storageServiceSpy.getAllCreatedMapsFromStorage as any).and.returnValue(
      new Promise ((resolve) => resolve(
        [['789', otherCachedMapDataFromStorage], ['123', cachedMapDataFromStorage]]
      ))
    );

    settingsService = new SettingsService(storageServiceSpy, httpServiceSpy);
    expect(await settingsService.getCachedAdminMapEntries()).toEqual(
      [
        { id: '123', cachedAdminMapValue: cachedMapDataFromStorage}, {id: '789', cachedAdminMapValue: otherCachedMapDataFromStorage }
      ]
    );
  });
});
