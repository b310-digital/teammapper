import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ExportNodeProperties } from '@teammapper/shared';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { SliderPanelsComponent } from './slider-panels.component';

// Material 3 dropped the `value` and `tickInterval` inputs from MatSlider: the
// thumb input carries the value, and `step` plus `showTickMarks` draw the ticks.
// These tests check the displayed value, the bounds and the update call.
describe('SliderPanelsComponent', () => {
  let component: SliderPanelsComponent;
  let fixture: ComponentFixture<SliderPanelsComponent>;
  let mmpService: { updateNode: jest.Mock; getAdditionalMapOptions: jest.Mock };

  const node = (): ExportNodeProperties => ({
    id: 'node-1',
    parent: null,
    k: 1,
    name: 'Test',
    font: { size: 20 },
    image: { src: 'data:image/png;base64,AAAA', size: 120 },
  });

  beforeEach(async () => {
    mmpService = {
      updateNode: jest.fn(),
      getAdditionalMapOptions: jest.fn().mockReturnValue({
        fontMaxSize: 70,
        fontMinSize: 15,
        fontIncrement: 5,
      }),
    };

    await TestBed.configureTestingModule({
      imports: [
        SliderPanelsComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [{ provide: MmpService, useValue: mmpService }],
    }).compileComponents();

    fixture = TestBed.createComponent(SliderPanelsComponent);
    component = fixture.componentInstance;
    component.node = node();
    component.editDisabled = false;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function thumb(panel: 'font-size' | 'image-size'): HTMLInputElement {
    const slider = fixture.nativeElement.querySelector(`.${panel}`);
    expect(slider).not.toBeNull();
    return slider.querySelector('input[matSliderThumb]');
  }

  it('shows the current font size on the thumb', () => {
    expect(thumb('font-size').value).toBe('20');
  });

  it('shows the current image size on the thumb', () => {
    expect(thumb('image-size').value).toBe('120');
  });

  it('takes the font slider bounds and step from the map options', () => {
    const input = thumb('font-size');

    expect(input.max).toBe('70');
    expect(input.min).toBe('15');
    expect(input.step).toBe('5');
  });

  it('updates the node font size when the thumb emits input', () => {
    const input = thumb('font-size');
    input.value = '35';
    input.dispatchEvent(new Event('input'));

    expect(mmpService.updateNode).toHaveBeenCalledWith('fontSize', 35, true);
  });

  it('updates the node image size when the thumb emits input', () => {
    const input = thumb('image-size');
    input.value = '200';
    input.dispatchEvent(new Event('input'));

    expect(mmpService.updateNode).toHaveBeenCalledWith('imageSize', 200, true);
  });
});
