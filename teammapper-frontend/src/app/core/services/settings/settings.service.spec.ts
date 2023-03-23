import { SettingsService } from "./settings.service";

describe('SettingsService', () => {
  let settingsService: SettingsService;

  it('#getValue should return real value from the real service', () => {
    const httpServiceSpy = jasmine.createSpyObj('httpService', ['get', 'delete', 'post'])
    const storageServiceSpy = jasmine.createSpyObj('storageService', ['get', 'getAll', 'getAllEntries', 'getAllCreatedMapsFromStorage'])

    settingsService = new SettingsService(storageServiceSpy, httpServiceSpy);
    expect(settingsService.getCachedSettings()).toBe(null);
  });
})