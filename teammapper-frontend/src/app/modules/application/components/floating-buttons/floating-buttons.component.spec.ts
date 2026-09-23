import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { FloatingButtonsComponent } from './floating-buttons.component';

class FakeTranslateLoader implements TranslateLoader {
  getTranslation(): Observable<Record<string, string>> {
    return of({});
  }
}

/**
 * The add and remove buttons act on the selected node, so they need one and
 * an editable map.
 */
describe('FloatingButtonsComponent', () => {
  let fixture: ComponentFixture<FloatingButtonsComponent>;
  let mmpService: { hasSelectedNode: jest.Mock };

  const disabled = (selector: string): boolean | undefined =>
    fixture.nativeElement.querySelector(selector)?.disabled;

  /** Re-render after a stub changes; the zoneless test bed marks nothing. */
  function refresh(): void {
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    mmpService = { hasSelectedNode: jest.fn().mockReturnValue(true) };

    await TestBed.configureTestingModule({
      imports: [
        FloatingButtonsComponent,
        TranslateModule.forRoot({
          loader: { provide: TranslateLoader, useClass: FakeTranslateLoader },
        }),
      ],
      providers: [{ provide: MmpService, useValue: mmpService }],
    }).compileComponents();

    fixture = TestBed.createComponent(FloatingButtonsComponent);
    fixture.detectChanges();
  });

  it('enables add and remove with a selected node', () => {
    expect(disabled('#floating-add-node')).toBe(false);
    expect(disabled('#floating-remove-node')).toBe(false);
  });

  it('disables add and remove with nothing selected', () => {
    mmpService.hasSelectedNode.mockReturnValue(false);
    refresh();

    expect(disabled('#floating-add-node')).toBe(true);
    expect(disabled('#floating-remove-node')).toBe(true);
  });

  it('disables add and remove when editing is off', () => {
    fixture.componentRef.setInput('editDisabled', true);
    fixture.detectChanges();

    expect(disabled('#floating-add-node')).toBe(true);
    expect(disabled('#floating-remove-node')).toBe(true);
  });
});
