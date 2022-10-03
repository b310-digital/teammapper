import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  name: 'stripTags'
})

export class StripTags implements PipeTransform {
  /**
     * StripTags returns specific translated text of a multi-lang object.
     */
  transform (text: string): string {
    if (text && text !== '') {
      return text.replace(/<[^>]*>?/gm, '')
    }
    return text
  }
}
