import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { throttleTime } from 'rxjs/operators';

/**
 * Service for displaying toast notifications using ngx-toastr
 * Includes throttling to prevent toast spam
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly THROTTLE_TIME_MS = 500;
  private readonly TOAST_DURATION_MS = 4000;

  private toastr = inject(ToastrService);
  private toastQueue = new Subject<ToastMessage>();

  constructor() {
    // Setup throttled toast display - shows first message, ignores subsequent ones
    this.toastQueue
      .pipe(
        throttleTime(this.THROTTLE_TIME_MS, undefined, {
          leading: true,
          trailing: false,
        })
      )
      .subscribe(message => {
        this.displayToast(message);
      });
  }

  /**
   * Display a validation correction notification
   * @param nodeName Name of the node that was corrected
   * @param correctionDetails Details about what was corrected
   */
  showValidationCorrection(nodeName: string, correctionDetails: string): void {
    const message = nodeName
      ? `Node "${nodeName}" was auto-corrected: ${correctionDetails}`
      : `Node was auto-corrected: ${correctionDetails}`;

    this.queueToast({ message, type: 'warning' });
  }

  /**
   * Display a general info toast
   * @param message Message to display
   */
  showInfo(message: string): void {
    this.queueToast({ message, type: 'info' });
  }

  /**
   * Display a warning toast
   * @param message Message to display
   */
  showWarning(message: string): void {
    this.queueToast({ message, type: 'warning' });
  }

  /**
   * Display an error toast
   * @param message Message to display
   */
  showError(message: string): void {
    this.queueToast({ message, type: 'error' });
  }

  /**
   * Queue a toast message (will be throttled)
   * @param toast Toast message to queue
   */
  private queueToast(toast: ToastMessage): void {
    this.toastQueue.next(toast);
  }

  /**
   * Display a toast immediately (after throttle)
   * @param toast Toast message to display
   */
  private displayToast(toast: ToastMessage): void {
    const options = { timeOut: this.TOAST_DURATION_MS };

    switch (toast.type) {
      case 'error':
        this.toastr.error(toast.message, '', options);
        break;
      case 'warning':
        this.toastr.warning(toast.message, '', options);
        break;
      case 'info':
        this.toastr.info(toast.message, '', options);
        break;
      case 'success':
        this.toastr.success(toast.message, '', options);
        break;
    }
  }
}

interface ToastMessage {
  message: string;
  type: 'error' | 'warning' | 'info' | 'success';
}
