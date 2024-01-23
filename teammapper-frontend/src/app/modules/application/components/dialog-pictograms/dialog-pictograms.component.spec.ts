import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { MatMenuModule } from '@angular/material/menu';
import { DialogPictogramsComponent } from './dialog-pictograms.component';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';

describe('DialogPictogramsComponent', () => {
  let component: DialogPictogramsComponent;
  let fixture: ComponentFixture<DialogPictogramsComponent>;

  beforeEach(waitForAsync(() => {
    const mockMmpService: jasmine.SpyObj<MmpService> = jasmine.createSpyObj(
      MmpService,
      ['new']
    );
    const mockUtilsService: jasmine.SpyObj<UtilsService> = jasmine.createSpyObj(
      UtilsService,
      ['new']
    );
    const mockPictoService: jasmine.SpyObj<PictogramService> =
      jasmine.createSpyObj(PictogramService, ['new']);

    TestBed.configureTestingModule({
      declarations: [DialogPictogramsComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: MmpService, useValue: mockMmpService },
        { provide: UtilsService, useValue: mockUtilsService },
        { provide: PictogramService, useValue: mockPictoService },
      ],
      imports: [TranslateModule.forRoot(), MatMenuModule],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogPictogramsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
