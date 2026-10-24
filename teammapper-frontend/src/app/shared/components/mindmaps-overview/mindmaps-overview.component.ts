import { Component, inject, OnInit, signal } from '@angular/core';
import { CachedAdminMapEntry } from '@teammapper/shared';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from '@angular/material/card';
import { MatList, MatListItem, MatListItemMeta } from '@angular/material/list';
import { MatLine } from '@angular/material/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LocalizedDatePipe } from 'src/app/shared/pipes/localized-date.pipe';

@Component({
  selector: 'teammapper-mindmaps-overview',
  templateUrl: './mindmaps-overview.component.html',
  styleUrl: './mindmaps-overview.component.scss',
  imports: [
    MatCard,
    MatCardHeader,
    MatCardContent,
    MatCardTitle,
    MatList,
    MatListItem,
    MatListItemMeta,
    MatLine,
    MatIconButton,
    MatIcon,
    LocalizedDatePipe,
    TranslatePipe,
    CommonModule,
  ],
})
export class MindmapsOverview implements OnInit {
  private settingsService = inject(SettingsService);
  private mapSyncService = inject(MapSyncService);
  private storageService = inject(StorageService);
  private translateService = inject(TranslateService);
  private toastrService = inject(ToastrService);
  private router = inject(Router);

  public cachedAdminMapEntries = signal<CachedAdminMapEntry[]>([]);
  public ownedEntries = signal<CachedAdminMapEntry[]>([]);

  public async ngOnInit() {
    this.cachedAdminMapEntries.set(
      await this.settingsService.getCachedAdminMapEntries()
    );
    this.ownedEntries.set(await this.mapSyncService.fetchUserMapsFromServer());
  }

  public getMapUrl(entry: CachedAdminMapEntry): string {
    return this.router
      .createUrlTree([`/map/${entry.id}`], {
        fragment: entry.cachedAdminMapValue.modificationSecret ?? undefined,
      })
      .toString();
  }

  public getMapTitle(entry: CachedAdminMapEntry): string {
    return entry.cachedAdminMapValue.rootName || entry.id;
  }

  // Deletes a listed map with the admin id stored for it, which also works
  // for maps that are not open.
  public async deleteMap(entry: CachedAdminMapEntry): Promise<void> {
    const adminId = entry.cachedAdminMapValue.adminId;
    if (!adminId || !this.confirmDeletion()) return;

    if (!(await this.mapSyncService.deleteMap(entry.id, adminId))) {
      this.toast('error', 'TOASTS.ERRORS.DELETE_MAP_ERROR');
      return;
    }
    await this.storageService.remove(entry.id);
    await this.afterDeletion(entry.id);
  }

  private confirmDeletion(): boolean {
    return confirm(
      this.translateService.instant('PAGES.SETTINGS.CONFIRM_DELETE')
    );
  }

  private async afterDeletion(mapId: string): Promise<void> {
    this.removeEntry(mapId);
    if (await this.showsDeletedMap(mapId)) {
      this.leaveForStartPage();
      return;
    }
    this.toast('success', 'TOASTS.DELETE_MAP_SUCCESS');
  }

  // The attached map stays set after the user returns to the start page, so
  // only the map and settings routes can still lead back to a deleted map.
  private async showsDeletedMap(mapId: string): Promise<boolean> {
    const url = this.router.url;
    if (!url.startsWith('/map') && !url.startsWith('/app')) return false;
    const attachedMap = await firstValueFrom(
      this.mapSyncService.getAttachedMapObservable()
    );
    return attachedMap?.cachedMap.uuid === mapId;
  }

  // The start page's ToastGuard reads the message from the query params.
  private leaveForStartPage(): void {
    this.router.navigate([''], {
      queryParams: {
        toastMessage: this.translateService.instant(
          'TOASTS.DELETE_MAP_SUCCESS'
        ),
      },
    });
  }

  // A map can appear in both lists, so drop it from each.
  private removeEntry(mapId: string): void {
    const keep = (entries: CachedAdminMapEntry[]) =>
      entries.filter(entry => entry.id !== mapId);
    this.cachedAdminMapEntries.update(keep);
    this.ownedEntries.update(keep);
  }

  private toast(type: 'success' | 'error', key: string): void {
    this.toastrService[type](this.translateService.instant(key));
  }
}
