import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
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
  let mmpService: {
    hasSelectedNode: jest.Mock;
    hasSelectedArrow: jest.Mock;
    mapCreated$: BehaviorSubject<boolean>;
    removeSelected: jest.Mock;
    removeNode: jest.Mock;
    stopArrowMode: jest.Mock;
  };

  const disabled = (selector: string): boolean | undefined =>
    fixture.nativeElement.querySelector(selector)?.disabled;

  /** Re-render after a stub changes; the zoneless test bed marks nothing. */
  function refresh(): void {
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    mmpService = {
      hasSelectedNode: jest.fn().mockReturnValue(true),
      hasSelectedArrow: jest.fn().mockReturnValue(false),
      mapCreated$: new BehaviorSubject<boolean>(true),
      removeSelected: jest.fn(),
      removeNode: jest.fn(),
      stopArrowMode: jest.fn(),
    };

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

  it('enables remove and disables add with only an arrow selected', () => {
    mmpService.hasSelectedNode.mockReturnValue(false);
    mmpService.hasSelectedArrow.mockReturnValue(true);
    refresh();

    expect(disabled('#floating-add-node')).toBe(true);
    expect(disabled('#floating-remove-node')).toBe(false);
  });

  it('disables add and remove when editing is off', () => {
    fixture.componentRef.setInput('editDisabled', true);
    fixture.detectChanges();

    expect(disabled('#floating-add-node')).toBe(true);
    expect(disabled('#floating-remove-node')).toBe(true);
  });

  it('removes the selected arrow or node when the remove button is pressed', () => {
    fixture.nativeElement.querySelector('#floating-remove-node').click();

    expect(mmpService.removeSelected).toHaveBeenCalledTimes(1);
    expect(mmpService.removeNode).not.toHaveBeenCalled();
  });

  it('stops arrow mode before a button acts', () => {
    fixture.nativeElement.querySelector('#floating-remove-node').click();

    const stopped = mmpService.stopArrowMode.mock.invocationCallOrder[0];
    const acted = mmpService.removeSelected.mock.invocationCallOrder[0];
    expect(stopped).toBeLessThan(acted);
  });

  it('enables center and zoom once the map exists', () => {
    expect(disabled('#center-map-button')).toBe(false);
    expect(disabled('#zoom-in-button')).toBe(false);
    expect(disabled('#zoom-out-button')).toBe(false);
  });

  it('disables center and zoom before the map exists', () => {
    mmpService.mapCreated$.next(false);
    fixture.detectChanges();

    expect(disabled('#center-map-button')).toBe(true);
    expect(disabled('#zoom-in-button')).toBe(true);
    expect(disabled('#zoom-out-button')).toBe(true);
  });
});
