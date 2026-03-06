import 'jest-canvas-mock';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MatMenuModule } from '@angular/material/menu';
import { DialogPictogramsComponent } from './dialog-pictograms.component';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';
import { of } from 'rxjs';

describe('DialogPictogramsComponent', () => {
  let component: DialogPictogramsComponent;
  let fixture: ComponentFixture<DialogPictogramsComponent>;
  let mockMmpService: jest.Mocked<MmpService>;
  let mockUtilsService: jest.Mocked<UtilsService>;
  let mockPictoService: jest.Mocked<PictogramService>;

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
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: MmpService, useValue: mockMmpService },
        { provide: UtilsService, useValue: mockUtilsService },
        { provide: PictogramService, useValue: mockPictoService },
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

  it('should stop keydown propagation on search element', () => {
    const searchEl = component.searchElement.nativeElement;
    const event = new KeyboardEvent('keydown', {
      key: 'c',
      bubbles: true,
    });
    const stopSpy = jest.spyOn(event, 'stopPropagation');
    searchEl.dispatchEvent(event);
    expect(stopSpy).toHaveBeenCalled();
  });

  it('should have sources configured', () => {
    expect(component.sources).toBeDefined();
    expect(component.sources.length).toBeGreaterThan(0);
    expect(component.sources[0].id).toBe('arasaac');
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
