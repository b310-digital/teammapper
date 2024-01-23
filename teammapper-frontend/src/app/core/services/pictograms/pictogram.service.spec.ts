import { PictogramService } from './pictogram.service';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { IPictogramResponse } from './picto-types';
import { SettingsService } from '../settings/settings.service';

const testData: IPictogramResponse = {
  schematic: false,
  sex: false,
  violence: false,
  aac: false,
  aacColor: false,
  skin: false,
  hair: false,
  downloads: 0,
  categories: [],
  synsets: [],
  tags: [],
  _id: 1,
  created: new Date(),
  lastUpdated: new Date(),
  keywords: [],
};

describe('PictogramService', () => {
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;
  let settingsService: SettingsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });

    // Inject the http service and test controller for each test
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    settingsService = jasmine.createSpyObj('storageService', [
      'getCachedSettings',
    ]);
  });

  it('fetches pictos', () => {
    new PictogramService(httpClient, settingsService)
      .getPictos('House')
      .subscribe(data => {
        expect(data).toEqual([testData]);
      });
    const httpRequest = httpTestingController.expectOne(
      'https://api.arasaac.org/v1/pictograms/en/search/House'
    );
    expect(httpRequest.request.method).toBe('GET');
    httpRequest.flush([testData]);
    httpTestingController.verify();
  });

  it('constructs the asset url', () => {
    const imageUrl = new PictogramService(
      httpClient,
      settingsService
    ).getPictoImageUrl(3);
    expect(imageUrl).toEqual(
      'https://static.arasaac.org/pictograms/3/3_300.png'
    );
  });

  it('gets the image', () => {
    const blob: Blob = new Blob();
    new PictogramService(httpClient, settingsService)
      .getPictoImage(3)
      .subscribe(data => {
        expect(data).toEqual(blob);
      });
    const httpRequest = httpTestingController.expectOne(
      'https://static.arasaac.org/pictograms/3/3_300.png'
    );
    expect(httpRequest.request.method).toBe('GET');
    httpRequest.flush(blob);
    httpTestingController.verify();
  });
});
