import { Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { displayNameInitials } from '@teammapper/shared';
import { ClientListEntry } from 'src/app/core/services/map-sync/yjs-utils';

/**
 * A client's picture in the client list: the initials of its display name in
 * dark text on a white circle ringed in its client color, or the generic
 * client icon without a name.
 * The entry around it carries the accessible label, so the picture hides from
 * assistive technology.
 */
@Component({
  selector: 'teammapper-client-avatar',
  template: `
    @if (initials(); as initials) {
      <span
        class="initials"
        aria-hidden="true"
        [style.border-color]="client().color"
        >{{ initials }}</span
      >
    } @else {
      <mat-icon aria-hidden="true" [style.color]="client().color"
        >account_circle</mat-icon
      >
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .initials {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: 24px;
      height: 24px;
      border: 3px solid;
      border-radius: 50%;
      background-color: #ffffff;
      color: #212121;
      font-size: 11px;
      font-weight: bold;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
    }
  `,
  imports: [MatIcon],
})
export class ClientAvatarComponent {
  readonly client = input.required<ClientListEntry>();

  protected readonly initials = computed(() =>
    displayNameInitials(this.client().displayName)
  );
}
