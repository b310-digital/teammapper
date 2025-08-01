import { PictogramService } from './pictogram.service';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { SettingsService } from '../settings/settings.service';
import { IPictogramResponse } from './picto-types';
import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';

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
  let service: PictogramService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        SettingsService,
        provideTranslateService(),
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    const settingsService = TestBed.inject(SettingsService);

    service = new PictogramService(httpClient, settingsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  it('fetches pictos', done => {
    const searchTerm = 'House';
    const expectedUrl = 'https://api.arasaac.org/v1/pictograms/en/search/House';
    service.getPictos(searchTerm).subscribe({
      next: data => {
        expect(data).toEqual([testData]);
        done();
      },
      error: done.fail,
    });
    httpTesting.expectOne(expectedUrl).flush([testData]);
  });

  it('constructs the asset url', () => {
    const imageUrl = service.getPictoImageUrl(3);

    expect(imageUrl).toEqual(
      'https://static.arasaac.org/pictograms/3/3_300.png'
    );
  });

  it('gets the image', done => {
    const blob = new Blob();
    const expectedUrl = 'https://static.arasaac.org/pictograms/3/3_300.png';

    service.getPictoImage(3).subscribe({
      next: data => {
        expect(data).toEqual(blob);
        done();
      },
      error: done.fail,
    });
    httpTesting.expectOne(expectedUrl).flush(blob);
  });

  it('uses default language when settings are not available', done => {
    const searchTerm = 'House';
    const expectedUrl = 'https://api.arasaac.org/v1/pictograms/en/search/House';

    service.getPictos(searchTerm).subscribe({
      next: _ => {
        done();
      },
      error: done.fail,
    });
    httpTesting.expectOne(expectedUrl).flush([testData]);
  });

  it('constructs the asset url with custom size and file type', () => {
    const imageUrl = service.getPictoImageUrl(3, 500, 'jpg');

    expect(imageUrl).toEqual(
      'https://static.arasaac.org/pictograms/3/3_500.jpg'
    );
  });
});
