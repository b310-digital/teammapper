import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { StopArrowModeDirective } from './stop-arrow-mode.directive';

@Component({
  template: `
    <div teammapperStopArrowMode>
      <button id="other" (click)="acted()">other</button>
      <button id="arrow" data-keeps-arrow-mode (click)="acted()">arrow</button>
      <span id="label">label</span>
    </div>
  `,
  imports: [StopArrowModeDirective],
})
class HostComponent {
  /** Replaced by each test with a recorder. */
  public acted: () => void = () => undefined;
}

describe('StopArrowModeDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let calls: string[];

  const click = (selector: string): void =>
    fixture.nativeElement.querySelector(selector).click();

  beforeEach(async () => {
    calls = [];
    const mmpService = {
      stopArrowMode: jest.fn(() => calls.push('stopped')),
    };
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: MmpService, useValue: mmpService }],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.acted = () => void calls.push('acted');
    fixture.detectChanges();
  });

  it('stops arrow mode before a button acts', () => {
    click('#other');

    expect(calls).toEqual(['stopped', 'acted']);
  });

  it('leaves arrow mode alone for a button that keeps it', () => {
    click('#arrow');

    expect(calls).toEqual(['acted']);
  });

  it('leaves arrow mode alone for a click outside any button', () => {
    click('#label');

    expect(calls).toEqual([]);
  });
});
