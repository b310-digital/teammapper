import { PictogramService } from './pictogram.service';
import { HttpClient } from '@angular/common/http';
import { SettingsService } from '../settings/settings.service';
import { of } from 'rxjs';
import { IPictogramResponse } from './picto-types';

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
  let httpClient: jest.Mocked<HttpClient>;
  let settingsService: jest.Mocked<SettingsService>;
  let service: PictogramService;

  beforeEach(() => {
    httpClient = {
      get: jest.fn(),
    } as any;

    settingsService = {
      getCachedSettings: jest.fn().mockReturnValue({
        general: { language: 'en' },
      }),
    } as any;

    service = new PictogramService(httpClient, settingsService);
  });

  it('fetches pictos', done => {
    const searchTerm = 'House';
    const expectedUrl = 'https://api.arasaac.org/v1/pictograms/en/search/House';
    httpClient.get.mockReturnValue(of([testData]));

    service.getPictos(searchTerm).subscribe(data => {
      expect(data).toEqual([testData]);
      expect(httpClient.get).toHaveBeenCalledWith(expectedUrl);
      done();
    });
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
    httpClient.get.mockReturnValue(of(blob));

    service.getPictoImage(3).subscribe(data => {
      expect(data).toEqual(blob);
      expect(httpClient.get).toHaveBeenCalledWith(expectedUrl, {
        responseType: 'blob',
      });
      done();
    });
  });

  it('uses default language when settings are not available', done => {
    settingsService.getCachedSettings.mockReturnValue(null);
    const searchTerm = 'House';
    const expectedUrl = 'https://api.arasaac.org/v1/pictograms/en/search/House';
    httpClient.get.mockReturnValue(of([testData]));

    service.getPictos(searchTerm).subscribe(_ => {
      expect(httpClient.get).toHaveBeenCalledWith(expectedUrl);
      done();
    });
  });

  it('constructs the asset url with custom size and file type', () => {
    const imageUrl = service.getPictoImageUrl(3, 500, 'jpg');

    expect(imageUrl).toEqual(
      'https://static.arasaac.org/pictograms/3/3_500.jpg'
    );
  });
});
