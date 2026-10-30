import { DOCUMENT, Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ToastrService } from 'ngx-toastr';
import { filter } from 'rxjs';
import { UtilsService } from '../utils/utils.service';

/**
 * Offers a reload when the service worker of the offline build holds a new
 * version of the site. The worker checks for a new version each time the
 * site loads and downloads it in the background, while the open page keeps
 * running the version it started with. A tap on the toast reloads the page
 * into the new version; otherwise the next load picks it up.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private swUpdate = inject(SwUpdate);
  private toastrService = inject(ToastrService);
  private utilsService = inject(UtilsService);
  private document = inject(DOCUMENT);

  /** Subscribes to the worker's events. Without a worker it does nothing. */
  public watch(): void {
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.versionUpdates
      .pipe(filter(event => event.type === 'VERSION_READY'))
      .subscribe(() => this.offerReload('TOASTS.APP_UPDATE_READY'));
    // The worker lost files the running version still needs, so the page
    // breaks on its next lazy load. A reload fetches a complete version.
    this.swUpdate.unrecoverable.subscribe(() =>
      this.offerReload('TOASTS.APP_UPDATE_BROKEN')
    );
  }

  /** The toast stays until the visitor taps it, which reloads the page. */
  private async offerReload(key: string): Promise<void> {
    const message = await this.utilsService.translate(key);
    this.toastrService
      .info(message, '', { disableTimeOut: true })
      .onTap.subscribe(() => this.document.location.reload());
  }
}
