import {Component, Input} from '@angular/core'
import {MmpService} from '../../../../core/services/mmp/mmp.service'

@Component({
  selector: 'teammapper-sliders-panel',
  templateUrl: './slider-panels.component.html',
  styleUrls: ['./slider-panels.component.scss']
})
export class SliderPanelsComponent {

  @Input() public node: any

  constructor (public mmpService: MmpService) {
  }

  public updateNodeFontSize (event: any, graphic?: boolean) {
    const value = parseInt(event.source.value, 10)

    this.mmpService.updateNode('fontSize', value, graphic)
  }

  public updateNodeImageSize (event: any, graphic?: boolean) {
    const value = parseInt(event.source.value, 10)

    this.mmpService.updateNode('imageSize', value, graphic)
  }

}
