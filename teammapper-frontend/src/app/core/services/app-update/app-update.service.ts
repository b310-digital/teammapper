import { DOCUMENT, Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ToastrService } from 'ngx-toastr';
import { filter } from 'rxjs';
import { UtilsService } from '../utils/utils.service';

/**
 * Offers a reload once the service worker has downloaded a new version of
 * the offline build.
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
    // The worker lost cached files; only a reload recovers.
    this.swUpdate.unrecoverable.subscribe(() =>
      this.offerReload('TOASTS.APP_UPDATE_BROKEN')
    );
  }

  /** The toast stays until the visitor clicks it, which reloads the page. */
  private async offerReload(key: string): Promise<void> {
    const message = await this.utilsService.translate(key);
    this.toastrService
      .info(message, '', { disableTimeOut: true })
      .onTap.subscribe(() => this.document.location.reload());
  }
}
