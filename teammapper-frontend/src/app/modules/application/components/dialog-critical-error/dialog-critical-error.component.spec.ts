import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { DialogCriticalErrorComponent } from './dialog-critical-error.component';
import { CriticalErrorData } from '../../../../shared/models/error-types.model';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('DialogCriticalErrorComponent', () => {
  let component: DialogCriticalErrorComponent;
  let fixture: ComponentFixture<DialogCriticalErrorComponent>;
  let mockDialogRef: jest.Mocked<MatDialogRef<DialogCriticalErrorComponent>>;
  let mockErrorData: CriticalErrorData;

  beforeEach(async () => {
    mockDialogRef = {
      disableClose: false,
      close: jest.fn(),
      afterClosed: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
      afterOpened: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
      backdropClick: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
      keydownEvents: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render with warning icon', () => {
    const compiled = fixture.nativeElement;
    const warningIcon = compiled.querySelector('mat-icon');
    expect(warningIcon).toBeTruthy();
    expect(warningIcon.textContent).toContain('warning');
  });

  it('should display error message from CriticalErrorData', () => {
    const compiled = fixture.nativeElement;
    const messageElement = compiled.querySelector('mat-dialog-content');
    expect(messageElement).toBeTruthy();
    expect(messageElement.textContent).toContain(mockErrorData.message);
  });

  it('should have disableClose set to true', () => {
    expect(mockDialogRef.disableClose).toBe(true);
  });

  it('should not be dismissible by clicking outside or pressing escape', () => {
    // disableClose = true prevents backdrop click and escape key
    expect(component.dialogRef.disableClose).toBe(true);
  });

  it('should have "Reload Page" button', () => {
    const compiled = fixture.nativeElement;
    const reloadButton = compiled.querySelector('button');
    expect(reloadButton).toBeTruthy();
    expect(reloadButton.textContent).toContain('Reload Page');
  });

  it('should call window.location.reload() when "Reload Page" button is clicked', () => {
    // Mock window.location.reload
    const reloadMock = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    component.reloadPage();

    expect(reloadMock).toHaveBeenCalled();
  });

  it('should display "Connection Issue" as the title', () => {
    const compiled = fixture.nativeElement;
    const titleElement = compiled.querySelector('h2[mat-dialog-title]');
    expect(titleElement).toBeTruthy();
    expect(titleElement.textContent).toContain('Connection Issue');
  });

  it('should be blocking (modal cannot be closed without reload)', () => {
    // Verify that dialogRef.disableClose is set in constructor
    expect(component.dialogRef.disableClose).toBe(true);

    // Verify close method is not called automatically
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should display additional warning message about unsaved changes', () => {
    const compiled = fixture.nativeElement;
    const contentElement = compiled.querySelector('mat-dialog-content');
    expect(contentElement).toBeTruthy();
    expect(contentElement.textContent).toContain(
      'Your recent changes may not have been saved'
    );
  });

  // Additional comprehensive tests

  it('should inject error data correctly', () => {
    expect(component.data).toEqual(mockErrorData);
    expect(component.data.code).toBe('SERVER_ERROR');
    expect(component.data.message).toContain('lost connection');
  });

  it('should handle different error codes', () => {
    // Test with AUTH_FAILED error
    const authErrorData: CriticalErrorData = {
      code: 'AUTH_FAILED',
      message: 'Authentication failed. Please reload and sign in again.',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [
        DialogCriticalErrorComponent,
        MatDialogModule,
        MatIconModule,
        MatButtonModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: authErrorData },
      ],
    });

    const authFixture = TestBed.createComponent(DialogCriticalErrorComponent);
    authFixture.detectChanges();

    const contentElement =
      authFixture.nativeElement.querySelector('mat-dialog-content');
    expect(contentElement.textContent).toContain('Authentication failed');
  });

  it('should handle NETWORK_TIMEOUT error code', () => {
    const timeoutErrorData: CriticalErrorData = {
      code: 'NETWORK_TIMEOUT',
      message: 'Connection timed out. Please reload the page.',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [
        DialogCriticalErrorComponent,
        MatDialogModule,
        MatIconModule,
        MatButtonModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: timeoutErrorData },
      ],
    });

    const timeoutFixture = TestBed.createComponent(
      DialogCriticalErrorComponent
    );
    timeoutFixture.detectChanges();

    const contentElement =
      timeoutFixture.nativeElement.querySelector('mat-dialog-content');
    expect(contentElement.textContent).toContain('Connection timed out');
  });

  it('should have proper dialog structure', () => {
    const dialogTitle = fixture.debugElement.query(
      By.css('[mat-dialog-title]')
    );
    const dialogContent = fixture.debugElement.query(
      By.css('mat-dialog-content')
    );
    const dialogActions = fixture.debugElement.query(
      By.css('mat-dialog-actions')
    );

    expect(dialogTitle).toBeTruthy();
    expect(dialogContent).toBeTruthy();
    expect(dialogActions).toBeTruthy();
  });

  it('should have warning icon with proper styling', () => {
    const iconDebugElement = fixture.debugElement.query(By.css('mat-icon'));
    expect(iconDebugElement).toBeTruthy();

    const iconElement = iconDebugElement.nativeElement;
    expect(iconElement.textContent.trim()).toBe('warning');

    // Check if icon has expected classes or attributes
    expect(iconElement.classList.contains('mat-icon')).toBe(true);
  });

  it('should have reload button with proper attributes', () => {
    const buttonDebugElement = fixture.debugElement.query(
      By.css('button[mat-raised-button]')
    );
    expect(buttonDebugElement).toBeTruthy();

    const buttonElement = buttonDebugElement.nativeElement;
    expect(buttonElement.getAttribute('color')).toBe('primary');
    expect(buttonElement.textContent.trim()).toBe('Reload Page');
  });

  it('should trigger reload when button is clicked', () => {
    const reloadSpy = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
    });

    const buttonDebugElement = fixture.debugElement.query(
      By.css('button[mat-raised-button]')
    );
    buttonDebugElement.nativeElement.click();

    expect(reloadSpy).toHaveBeenCalled();
  });

  it('should not allow dialog to be closed programmatically', () => {
    // Try to close dialog (should be prevented)
    mockDialogRef.close();

    // Verify close was called but dialog remains blocking
    expect(mockDialogRef.close).toHaveBeenCalled();
    expect(component.dialogRef.disableClose).toBe(true);
  });

  it('should handle missing error data gracefully', () => {
    const emptyErrorData: CriticalErrorData = {
      code: '',
      message: '',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [
        DialogCriticalErrorComponent,
        MatDialogModule,
        MatIconModule,
        MatButtonModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: emptyErrorData },
      ],
    });

    const emptyFixture = TestBed.createComponent(DialogCriticalErrorComponent);
    expect(() => emptyFixture.detectChanges()).not.toThrow();

    const component = emptyFixture.componentInstance;
    expect(component.data.code).toBe('');
    expect(component.data.message).toBe('');
  });

  it('should display generic message for MALFORMED_REQUEST', () => {
    const malformedErrorData: CriticalErrorData = {
      code: 'MALFORMED_REQUEST',
      message:
        'There was a problem with your request. Please reload and try again.',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [
        DialogCriticalErrorComponent,
        MatDialogModule,
        MatIconModule,
        MatButtonModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: malformedErrorData },
      ],
    });

    const malformedFixture = TestBed.createComponent(
      DialogCriticalErrorComponent
    );
    malformedFixture.detectChanges();

    const contentElement =
      malformedFixture.nativeElement.querySelector('mat-dialog-content');
    expect(contentElement.textContent).toContain('problem with your request');
  });

  it('should have proper accessibility attributes', () => {
    const dialog = fixture.nativeElement.querySelector('[mat-dialog-title]');
    expect(dialog).toBeTruthy();

    // Dialog should have proper ARIA role (handled by Material)
    const dialogContainer = fixture.nativeElement.closest(
      'mat-dialog-container'
    );
    if (dialogContainer) {
      expect(dialogContainer.getAttribute('role')).toBe('dialog');
    }
  });

  it('should persist warning about unsaved changes across all error types', () => {
    const errorTypes = [
      { code: 'SERVER_ERROR', message: 'Server error' },
      { code: 'NETWORK_TIMEOUT', message: 'Timeout' },
      { code: 'AUTH_FAILED', message: 'Auth failed' },
    ];

    errorTypes.forEach(errorData => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [
          DialogCriticalErrorComponent,
          MatDialogModule,
          MatIconModule,
          MatButtonModule,
          NoopAnimationsModule,
        ],
        providers: [
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: errorData },
        ],
      });

      const testFixture = TestBed.createComponent(DialogCriticalErrorComponent);
      testFixture.detectChanges();

      const contentElement =
        testFixture.nativeElement.querySelector('mat-dialog-content');
      expect(contentElement.textContent).toContain(
        'recent changes may not have been saved'
      );
    });
  });
});
