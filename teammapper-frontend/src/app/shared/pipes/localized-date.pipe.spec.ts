import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LocalizedDatePipe } from './localized-date.pipe';

describe('LocalizedDatePipe', () => {
  const date = new Date(2026, 9, 28);

  function format(language: string): string {
    TestBed.inject(TranslateService).use(language);
    return TestBed.runInInjectionContext(() =>
      new LocalizedDatePipe().transform(date)
    );
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
  });

  it('orders day before month in German', () => {
    expect(format('de')).toBe('28.10.2026');
  });

  it('orders month before day in English', () => {
    expect(format('en')).toBe('10/28/2026');
  });

  it('orders year first in Japanese', () => {
    expect(format('ja')).toBe('2026/10/28');
  });

  it('returns an empty string without a date', () => {
    const pipe = TestBed.runInInjectionContext(() => new LocalizedDatePipe());
    expect(pipe.transform(null)).toBe('');
  });
});
