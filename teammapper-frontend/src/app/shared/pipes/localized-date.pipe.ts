import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

// Formats a date in the order and separators of the current UI language,
// e.g. 28.10.2026 in German and 10/28/2026 in English. Impure, so the output
// follows a language switch.
@Pipe({
  name: 'localizedDate',
  pure: false,
})
export class LocalizedDatePipe implements PipeTransform {
  private translateService = inject(TranslateService);

  transform(value: Date | number | string | null | undefined): string {
    if (value === null || value === undefined) return '';

    return new Date(value).toLocaleDateString(
      this.translateService.getCurrentLang(),
      { year: 'numeric', month: '2-digit', day: '2-digit' }
    );
  }
}
