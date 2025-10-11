import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import {
  DialogCriticalErrorComponent,
  CriticalErrorData,
} from './dialog-critical-error.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

describe('DialogCriticalErrorComponent', () => {
  let component: DialogCriticalErrorComponent;
  let fixture: ComponentFixture<DialogCriticalErrorComponent>;
  let mockDialogRef: jest.Mocked<MatDialogRef<DialogCriticalErrorComponent>>;
  let mockErrorData: CriticalErrorData;

  beforeEach(async () => {
    mockDialogRef = {
      disableClose: false,
      close: jest.fn(),
    } as unknown as jest.Mocked<MatDialogRef<DialogCriticalErrorComponent>>;

    mockErrorData = {
      code: 'SERVER_ERROR',
      message: 'We lost connection to the server. Please reload the page.',
    };

    await TestBed.configureTestingModule({
      imports: [
        DialogCriticalErrorComponent,
        MatDialogModule,
        MatIconModule,
        MatButtonModule,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockErrorData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogCriticalErrorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and display error message', () => {
    expect(component).toBeTruthy();

    const contentElement =
      fixture.nativeElement.querySelector('mat-dialog-content');
    expect(contentElement.textContent).toContain(mockErrorData.message);
  });

  it('should be a blocking dialog that cannot be dismissed', () => {
    expect(component.dialogRef.disableClose).toBe(true);
  });

  it('should reload page when button is clicked', () => {
    const reloadMock = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    component.reloadPage();

    expect(reloadMock).toHaveBeenCalled();
  });
});
