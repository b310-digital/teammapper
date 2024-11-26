import 'jest-canvas-mock';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MatMenuModule } from '@angular/material/menu';
import { DialogPictogramsComponent } from './dialog-pictograms.component';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';
import { IPictogramResponse } from 'src/app/core/services/pictograms/picto-types';
import { of } from 'rxjs';

describe('DialogPictogramsComponent', () => {
  let component: DialogPictogramsComponent;
  let fixture: ComponentFixture<DialogPictogramsComponent>;
  let mockMmpService: jest.Mocked<MmpService>;
  let mockUtilsService: jest.Mocked<UtilsService>;
  let mockPictoService: jest.Mocked<PictogramService>;

  const mockPictogramResponse: IPictogramResponse[] = [
    {
      _id: 1,
      keywords: [
        {
          keyword: 'test',
          type: 1,
          plural: 'tests',
          hasLocation: false,
        },
      ],
      schematic: false,
      sex: false,
      violence: false,
      aac: false,
      aacColor: false,
      skin: false,
      hair: false,
      downloads: 0,
      categories: ['test'],
      synsets: ['test'],
      tags: ['test'],
      created: new Date(),
      lastUpdated: new Date(),
    },
  ];

  beforeEach(async () => {
    mockMmpService = {
      new: jest.fn(),
      addNodeImage: jest.fn().mockResolvedValue(undefined),
      map: {
        on: jest.fn(),
        remove: jest.fn(),
        center: jest.fn(),
        new: jest.fn(),
      },
    } as unknown as jest.Mocked<MmpService>;

    mockUtilsService = {
      new: jest.fn(),
      blobToBase64: jest.fn(),
    } as unknown as jest.Mocked<UtilsService>;

    mockPictoService = {
      new: jest.fn(),
      getPictos: jest.fn().mockReturnValue(of([])),
      getPictoImage: jest.fn().mockReturnValue(of(new Blob())),
      getPictoImageUrl: jest.fn().mockReturnValue('mock-url'),
    } as unknown as jest.Mocked<PictogramService>;

    await TestBed.configureTestingModule({
      declarations: [DialogPictogramsComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: MmpService, useValue: mockMmpService },
        { provide: UtilsService, useValue: mockUtilsService },
        { provide: PictogramService, useValue: mockPictoService },
      ],
      imports: [TranslateModule.forRoot(), MatMenuModule],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogPictogramsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call search method when enter key is pressed', async () => {
    const searchSpy = jest.spyOn(component, 'search');
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    document.dispatchEvent(event);
    expect(searchSpy).toHaveBeenCalled();
  });

  it('should update pictos when search is called', async () => {
    mockPictoService.getPictos.mockReturnValue(of(mockPictogramResponse));

    await component.search();
    expect(component.pictos).toEqual(mockPictogramResponse);
  });

  it('should get image URL for given ID', () => {
    const testId = 123;
    const mockUrl = 'test-url';
    mockPictoService.getPictoImageUrl.mockReturnValue(mockUrl);

    const result = component.getImageUrlOfId(testId);
    expect(mockPictoService.getPictoImageUrl).toHaveBeenCalledWith(testId);
    expect(result).toBe(mockUrl);
  });
});
