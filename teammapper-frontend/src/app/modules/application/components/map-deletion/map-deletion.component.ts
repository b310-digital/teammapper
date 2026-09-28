import { Component, inject } from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { CachedMapEntry } from '@teammapper/shared';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import {
  MatCard,
  MatCardHeader,
  MatCardTitle,
  MatCardContent,
  MatCardActions,
} from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { AsyncPipe, DatePipe } from '@angular/common';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';

@Component({
  selector: 'teammapper-map-deletion',
  templateUrl: './map-deletion.component.html',
  styleUrls: ['./map-deletion.component.scss'],
  imports: [
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    MatCardActions,
    MatButton,
    AsyncPipe,
    DatePipe,
    TranslatePipe,
  ],
})
export class MapDeletionComponent {
  private translateService = inject(TranslateService);
  private storageService = inject(StorageService);
  private mapSyncService = inject(MapSyncService);
  private router = inject(Router);
  private toastrService = inject(ToastrService);

  public attachedMap: Observable<CachedMapEntry | null> =
    this.mapSyncService.getAttachedMapObservable();
  public mapAdminId: Promise<string | undefined> = this.getMapAdminId();

  async deleteMap() {
    if (
      !confirm(this.translateService.instant('PAGES.SETTINGS.CONFIRM_DELETE'))
    )
      return;

    // Without the admin id the server rejects the delete, so stop here rather
    // than send a request that cannot succeed.
    const adminId = await this.mapAdminId;
    const attachedMap = await firstValueFrom(this.attachedMap);

    if (!adminId || !attachedMap) return;

    const uuid = attachedMap.cachedMap.uuid;
    // Keep the stored admin id when the deletion fails, so the user can retry.
    if (!(await this.mapSyncService.deleteMap(uuid, adminId))) {
      this.toastrService.error(
        this.translateService.instant('TOASTS.ERRORS.DELETE_MAP_ERROR')
      );
      return;
    }
    await this.storageService.remove(uuid);
    this.leaveForStartPage();
  }

  private leaveForStartPage(): void {
    this.router.navigate([''], {
      queryParams: {
        toastMessage: this.translateService.instant(
          'TOASTS.DELETE_MAP_SUCCESS'
        ),
      },
    });
  }

  // The attached map subject replays its current value, so this resolves on
  // the first emission instead of waiting for a later one.
  private async getMapAdminId(): Promise<string | undefined> {
    const attachedMap = await firstValueFrom(this.attachedMap);
    if (!attachedMap) return undefined;

    const mapData = (await this.storageService.get(
      attachedMap.cachedMap.uuid
    )) as { adminId?: string } | null;
    return mapData?.adminId;
  }
}
