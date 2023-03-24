import { SettingsService } from "./settings.service";

describe('SettingsService', () => {
  let settingsService: SettingsService;

  it('#getCachedSettings is null', () => {
    const httpServiceSpy = jasmine.createSpyObj('httpService', ['get', 'delete', 'post'])
    const storageServiceSpy = jasmine.createSpyObj('storageService', ['get', 'getAll', 'getAllEntries', 'getAllCreatedMapsFromStorage'])

    settingsService = new SettingsService(storageServiceSpy, httpServiceSpy);
    expect(settingsService.getCachedSettings()).toBe(null);
  });
})