import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'inverseBool',
  pure: false,
  standalone: false,
})
export class InverseBoolPipe implements PipeTransform {
  transform(value: boolean | null): boolean {
    return !value;
  }
}
