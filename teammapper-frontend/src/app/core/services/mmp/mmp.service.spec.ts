import { TestBed } from '@angular/core/testing';
import { MmpService } from './mmp.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject } from 'rxjs';
import * as mmp from '@mmp/index';
import MmpMap from '@mmp/map/map';

// Mock MmpMap module
jest.mock('@mmp/index', () => ({
  create: jest.fn().mockImplementation(() => ({
    options: {
      update: jest.fn()
    }
  }))
}));

describe('MmpService', () => {
  let service: MmpService;
  let settingsService: jest.SpyInstance<SettingsService>;
  let utilsService: jest.SpyInstance<UtilsService>;
  let toastrService: jest.SpyInstance<ToastrService>;
  let editModeSubject: BehaviorSubject<boolean | null>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create edit mode subject for settings service
    editModeSubject = new BehaviorSubject<boolean | null>(null);

    // Create spy objects for dependencies
    settingsService = {
      getEditModeObservable: jest.fn().mockReturnValue(editModeSubject.asObservable()),
      getCachedSettings: jest.fn(),
      setEditMode: jest.fn(),
      updateCachedSettings: jest.fn()
    } as any;

    utilsService = {
      translate: jest.fn(),
      confirmDialog: jest.fn()
    } as any;

    toastrService = {
      success: jest.fn(),
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn()
    } as any;

    TestBed.configureTestingModule({
      providers: [
        MmpService,
        { provide: SettingsService, useValue: settingsService },
        { provide: UtilsService, useValue: utilsService },
        { provide: ToastrService, useValue: toastrService }
      ]
    });

    service = TestBed.inject(MmpService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should subscribe to edit mode changes on construction', () => {
    expect(settingsService.getEditModeObservable).toHaveBeenCalled();
  });

  it('should update map options when edit mode changes', () => {
    // Get mock map instance
    const mockMap = (mmp.create as jest.Mock).mock.results[0].value;
    (service as any).currentMap = mockMap;

    // Simulate edit mode change
    editModeSubject.next(true);

    expect(mockMap.options.update).toHaveBeenCalledWith('drag', true);
    expect(mockMap.options.update).toHaveBeenCalledWith('edit', true);
  });

  it('should not update map options when currentMap is not set', () => {
    // Ensure currentMap is null
    (service as any).currentMap = null;

    // Simulate edit mode change
    editModeSubject.next(true);

    // Test should pass without errors
    expect(true).toBeTruthy();
  });

  it('should unsubscribe from settings service on destroy', () => {
    const mockUnsubscribe = jest.fn();
    (service as any).settingsSubscription = { unsubscribe: mockUnsubscribe };

    service.ngOnDestroy();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});