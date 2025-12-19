import { TestBed } from '@angular/core/testing';
import { ToastrService } from 'ngx-toastr';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let toastrSpy: jest.Mocked<ToastrService>;

  beforeEach(() => {
    jest.useFakeTimers();
    const spy = {
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
      success: jest.fn(),
    } as unknown as jest.Mocked<ToastrService>;

    TestBed.configureTestingModule({
      providers: [ToastService, { provide: ToastrService, useValue: spy }],
    });

    service = TestBed.inject(ToastService);
    toastrSpy = TestBed.inject(
      ToastrService
    ) as unknown as jest.Mocked<ToastrService>;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('showValidationCorrection()', () => {
    it('should display warning toast with correct message', () => {
      service.showValidationCorrection('Test Node', 'parent was reset to root');

      // Wait for throttle time (500ms)
      jest.advanceTimersByTime(500);

      expect(toastrSpy.warning).toHaveBeenCalledWith(
        'Node "Test Node" was auto-corrected: parent was reset to root',
        '',
        expect.objectContaining({
          timeOut: 4000,
        })
      );
    });

    it('should display message without node name if not provided', () => {
      service.showValidationCorrection('', 'parent was reset to root');

      jest.advanceTimersByTime(500);

      expect(toastrSpy.warning).toHaveBeenCalledWith(
        'Node was auto-corrected: parent was reset to root',
        '',
        expect.anything()
      );
    });

    it('should include correction details in message', () => {
      service.showValidationCorrection(
        'Meeting Notes',
        'invalid reference removed'
      );

      jest.advanceTimersByTime(500);

      const call =
        toastrSpy.warning.mock.calls[toastrSpy.warning.mock.calls.length - 1];
      expect(call[0]).toContain('invalid reference removed');
    });

    it('should use 4 second duration', () => {
      service.showValidationCorrection('Test', 'corrected');

      jest.advanceTimersByTime(500);

      const call =
        toastrSpy.warning.mock.calls[toastrSpy.warning.mock.calls.length - 1];
      expect(call[2]).toEqual({ timeOut: 4000 });
    });
  });

  describe('throttling', () => {
    it('should prevent toast spam by showing first message only', () => {
      // Rapid fire toasts
      service.showValidationCorrection('Node 1', 'correction 1');
      jest.advanceTimersByTime(100);
      service.showValidationCorrection('Node 2', 'correction 2');
      jest.advanceTimersByTime(100);
      service.showValidationCorrection('Node 3', 'correction 3');

      // Wait for throttle time
      jest.advanceTimersByTime(500);

      // Only the FIRST toast should be shown (throttle behavior, not debounce)
      expect(toastrSpy.warning).toHaveBeenCalledTimes(1);
      expect(toastrSpy.warning).toHaveBeenCalledWith(
        expect.stringContaining('Node 1'),
        expect.anything(),
        expect.anything()
      );
    });

    it('should show multiple toasts if separated by throttle time', () => {
      service.showValidationCorrection('Node 1', 'correction 1');
      jest.advanceTimersByTime(500);

      service.showValidationCorrection('Node 2', 'correction 2');
      jest.advanceTimersByTime(500);

      expect(toastrSpy.warning).toHaveBeenCalledTimes(2);
    });

    it('should throttle all toast types', () => {
      service.showInfo('Info message');
      jest.advanceTimersByTime(100);
      service.showWarning('Warning message');
      jest.advanceTimersByTime(100);
      service.showError('Error message');

      jest.advanceTimersByTime(500);

      // Only first one should be shown (throttle shows first, not last)
      expect(toastrSpy.info).toHaveBeenCalledTimes(1);
      expect(toastrSpy.warning).toHaveBeenCalledTimes(0);
      expect(toastrSpy.error).toHaveBeenCalledTimes(0);
      expect(toastrSpy.info).toHaveBeenCalledWith(
        'Info message',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('showInfo()', () => {
    it('should display info toast with default duration', () => {
      service.showInfo('Information message');

      jest.advanceTimersByTime(500);

      expect(toastrSpy.info).toHaveBeenCalledWith(
        'Information message',
        '',
        expect.objectContaining({
          timeOut: 4000,
        })
      );
    });
  });

  describe('showWarning()', () => {
    it('should display warning toast with default duration', () => {
      service.showWarning('Warning message');

      jest.advanceTimersByTime(500);

      expect(toastrSpy.warning).toHaveBeenCalledWith(
        'Warning message',
        '',
        expect.objectContaining({
          timeOut: 4000,
        })
      );
    });
  });

  describe('showError()', () => {
    it('should display error toast with default duration', () => {
      service.showError('Error message');

      jest.advanceTimersByTime(500);

      expect(toastrSpy.error).toHaveBeenCalledWith(
        'Error message',
        '',
        expect.objectContaining({
          timeOut: 4000,
        })
      );
    });
  });

  describe('toast queueing', () => {
    it('should display toast immediately with throttle leading', () => {
      service.showValidationCorrection('Node 1', 'correction');

      // With leading: true, toast is displayed immediately
      jest.advanceTimersByTime(0);
      expect(toastrSpy.warning).toHaveBeenCalledTimes(1);

      // After throttle time passes, can show another toast
      jest.advanceTimersByTime(500);
      service.showValidationCorrection('Node 2', 'correction 2');
      jest.advanceTimersByTime(0);
      expect(toastrSpy.warning).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple messages in quick succession', () => {
      // Simulate rapid operations triggering toasts
      for (let i = 0; i < 10; i++) {
        service.showValidationCorrection(`Node ${i}`, 'correction');
        jest.advanceTimersByTime(50);
      }

      jest.advanceTimersByTime(500);

      // Only one toast should be shown (the first one due to throttling)
      expect(toastrSpy.warning).toHaveBeenCalledTimes(1);
      expect(toastrSpy.warning).toHaveBeenCalledWith(
        expect.stringContaining('Node 0'),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('toast types', () => {
    it('should call toastr.warning for validation corrections', () => {
      service.showValidationCorrection('Test', 'correction');
      jest.advanceTimersByTime(500);

      expect(toastrSpy.warning).toHaveBeenCalled();
      expect(toastrSpy.error).not.toHaveBeenCalled();
      expect(toastrSpy.info).not.toHaveBeenCalled();
      expect(toastrSpy.success).not.toHaveBeenCalled();
    });

    it('should call toastr.info for info messages', () => {
      service.showInfo('Test info');
      jest.advanceTimersByTime(500);

      expect(toastrSpy.info).toHaveBeenCalled();
      expect(toastrSpy.error).not.toHaveBeenCalled();
      expect(toastrSpy.warning).not.toHaveBeenCalled();
      expect(toastrSpy.success).not.toHaveBeenCalled();
    });

    it('should call toastr.warning for warnings', () => {
      service.showWarning('Test warning');
      jest.advanceTimersByTime(500);

      expect(toastrSpy.warning).toHaveBeenCalled();
      expect(toastrSpy.error).not.toHaveBeenCalled();
      expect(toastrSpy.info).not.toHaveBeenCalled();
      expect(toastrSpy.success).not.toHaveBeenCalled();
    });

    it('should call toastr.error for errors', () => {
      service.showError('Test error');
      jest.advanceTimersByTime(500);

      expect(toastrSpy.error).toHaveBeenCalled();
      expect(toastrSpy.warning).not.toHaveBeenCalled();
      expect(toastrSpy.info).not.toHaveBeenCalled();
      expect(toastrSpy.success).not.toHaveBeenCalled();
    });
  });
});
