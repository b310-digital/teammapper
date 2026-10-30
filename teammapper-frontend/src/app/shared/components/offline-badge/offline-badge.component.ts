import { Component, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { OFFLINE_MODE } from 'src/app/core/services/map-backend/map-backend-config';

/**
 * Marks a screen of the offline build with a pill that reads "Offline mode".
 * The web version renders nothing. With `withDescription` set, the pill also
 * shows `OFFLINE_MODE.DESCRIPTION`: nobody else sees the maps and changes do
 * not sync with peers. Without it, the pill shows the description as its tooltip and in
 * visually hidden text for screen readers.
 */
@Component({
  selector: 'teammapper-offline-badge',
  template: `
    @if (offlineMode) {
      @let description = 'OFFLINE_MODE.DESCRIPTION' | translate;
      <span
        class="offline-badge"
        [class.with-description]="withDescription()"
        [attr.title]="withDescription() ? null : description">
        <mat-icon aria-hidden="true">cloud_off</mat-icon>
        <strong class="label">{{ 'OFFLINE_MODE.LABEL' | translate }}</strong>
        <span [class.visually-hidden]="!withDescription()" class="description">
          {{ description }}
        </span>
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    /* The web version renders nothing, so the host takes no flex gap. */
    :host:empty {
      display: none;
    }

    .offline-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.75rem 0.25rem 0.5rem;
      border: 1px solid var(--color-offline-badge-border);
      border-radius: 999px;
      background-color: var(--color-offline-badge-bg);
      color: var(--color-offline-badge-text);
      font-size: 0.85rem;
      line-height: 1.3;
    }

    .offline-badge mat-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      font-size: 20px;
    }

    .offline-badge.with-description {
      border-radius: 12px;
      padding: 0.6rem 1rem 0.6rem 0.75rem;
      font-size: 0.95rem;
    }

    .label {
      white-space: nowrap;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
  imports: [MatIcon, TranslatePipe],
})
export class OfflineBadgeComponent {
  protected readonly offlineMode = inject(OFFLINE_MODE);

  readonly withDescription = input(false);
}
