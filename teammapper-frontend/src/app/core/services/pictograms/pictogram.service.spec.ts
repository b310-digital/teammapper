import { PictogramService } from './pictogram.service';
import { provideHttpClient } from '@angular/common/http';
import { SettingsService } from '../settings/settings.service';
import { SETTINGS_URL } from '../map-backend/map-backend-config';
import { Pictogram } from '@teammapper/shared';
import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';

const testData: Pictogram = { _id: 1 };

describe('PictogramService', () => {
  let service: PictogramService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        SettingsService,
        { provide: SETTINGS_URL, useValue: 'api/settings' },
        provideTranslateService(),
      ],
    });

    service = TestBed.inject(PictogramService);
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

  it('encodes a slash in the search term', done => {
    const expectedUrl =
      'https://api.arasaac.org/v1/pictograms/en/search/black%2Fwhite';

    service.getPictos('black/white').subscribe({
      next: () => done(),
      error: done.fail,
    });
    httpTesting.expectOne(expectedUrl).flush([testData]);
  });

  it('encodes a question mark and a space in the search term', done => {
    const expectedUrl =
      'https://api.arasaac.org/v1/pictograms/en/search/why%3F%20not';

    service.getPictos('why? not').subscribe({
      next: () => done(),
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
});
