import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';

/**
 * Ends arrow mode when the user clicks a button inside the element, before
 * the button acts. The listener runs in the capture phase, ahead of the
 * button's own click handler. A button marked `data-keeps-arrow-mode`, the
 * one that toggles arrow mode, is left alone.
 */
@Directive({
  selector: '[teammapperStopArrowMode]',
})
export class StopArrowModeDirective {
  private readonly mmpService = inject(MmpService);

  constructor() {
    const element: HTMLElement = inject(ElementRef).nativeElement;
    const listener = (event: MouseEvent) => this.stopForButton(event);
    element.addEventListener('click', listener, true);
    inject(DestroyRef).onDestroy(() =>
      element.removeEventListener('click', listener, true)
    );
  }

  private stopForButton(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest('button');
    if (!button || button.hasAttribute('data-keeps-arrow-mode')) return;
    this.mmpService.stopArrowMode();
  }
}
