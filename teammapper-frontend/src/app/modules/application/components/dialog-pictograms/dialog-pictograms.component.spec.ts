import 'jest-canvas-mock';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MatMenuModule } from '@angular/material/menu';
import { DialogPictogramsComponent } from './dialog-pictograms.component';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import { Pictogram } from '@teammapper/shared';
import { ToastrService } from 'ngx-toastr';
import { of, throwError } from 'rxjs';

const PICTOGRAMS_ERROR_KEY = 'TOASTS.ERRORS.PICTOGRAMS_ERROR';
const TRANSLATED_ERROR = 'Pictograms are unavailable';

describe('DialogPictogramsComponent', () => {
  let component: DialogPictogramsComponent;
  let fixture: ComponentFixture<DialogPictogramsComponent>;
  let mockMmpService: jest.Mocked<MmpService>;
  let mockPictoService: jest.Mocked<PictogramService>;
  let mockToastr: { error: jest.Mock };
  let mockUtilsService: { translate: jest.Mock };

  const mockPictogramResponse: Pictogram[] = [{ _id: 1 }, { _id: 2 }];

  const flushPromises = () => new Promise(resolve => setTimeout(resolve));

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

    mockPictoService = {
      new: jest.fn(),
      getPictos: jest.fn().mockReturnValue(of([])),
      getPictoImage: jest.fn().mockReturnValue(of(new Blob())),
      getPictoImageUrl: jest.fn().mockReturnValue('mock-url'),
    } as unknown as jest.Mocked<PictogramService>;

    mockToastr = { error: jest.fn() };
    mockUtilsService = {
      translate: jest.fn().mockResolvedValue(TRANSLATED_ERROR),
    };

    await TestBed.configureTestingModule({
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: MmpService, useValue: mockMmpService },
        { provide: PictogramService, useValue: mockPictoService },
        { provide: ToastrService, useValue: mockToastr },
        { provide: UtilsService, useValue: mockUtilsService },
      ],
      imports: [
        TranslateModule.forRoot(),
        MatMenuModule,
        DialogPictogramsComponent,
      ],
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
    expect(component.pictos()).toEqual(mockPictogramResponse);
  });

  it('should get image URL for given ID', () => {
    const testId = 123;
    const mockUrl = 'test-url';
    mockPictoService.getPictoImageUrl.mockReturnValue(mockUrl);

    const result = component.getImageUrlOfId(testId);
    expect(mockPictoService.getPictoImageUrl).toHaveBeenCalledWith(testId);
    expect(result).toBe(mockUrl);
  });

  describe('when the search request fails', () => {
    beforeEach(async () => {
      mockPictoService.getPictos.mockReturnValueOnce(of(mockPictogramResponse));
      await component.search();
      mockPictoService.getPictos.mockReturnValueOnce(
        throwError(() => new Error('search failed'))
      );
      await component.search();
      await flushPromises();
    });

    it('shows the translated error toast', () => {
      expect(mockUtilsService.translate).toHaveBeenCalledWith(
        PICTOGRAMS_ERROR_KEY
      );
      expect(mockToastr.error).toHaveBeenCalledWith(TRANSLATED_ERROR);
    });

    it('clears the previous results', () => {
      expect(component.pictos()).toEqual([]);
    });
  });

  describe('when the image request fails', () => {
    let added: jest.Mock;

    beforeEach(async () => {
      added = jest.fn();
      component.onPictogramAdd.subscribe(added);
      mockPictoService.getPictoImage.mockReturnValue(
        throwError(() => new Error('image failed'))
      );
      await component.getImageFileOfId(1);
      await flushPromises();
    });

    it('shows the translated error toast', () => {
      expect(mockToastr.error).toHaveBeenCalledWith(TRANSLATED_ERROR);
    });

    it('does not emit onPictogramAdd', () => {
      expect(added).not.toHaveBeenCalled();
    });
  });

  describe('when preview images fail to load', () => {
    it('shows another toast after a new search', async () => {
      await component.search();
      await component.onPreviewError();
      await component.search();
      await component.onPreviewError();
      await flushPromises();

      expect(mockToastr.error).toHaveBeenCalledTimes(2);
    });

    it('shows one toast when two rendered previews fail in one search', async () => {
      mockPictoService.getPictos.mockReturnValue(of(mockPictogramResponse));
      await component.search();
      fixture.detectChanges();

      const previews = fixture.nativeElement.querySelectorAll(
        'img[alt="Pictogram"]'
      ) as NodeListOf<HTMLImageElement>;
      previews[0].dispatchEvent(new Event('error'));
      previews[1].dispatchEvent(new Event('error'));
      await flushPromises();

      expect(previews.length).toBe(2);
      expect(mockToastr.error).toHaveBeenCalledTimes(1);
    });
  });
});
