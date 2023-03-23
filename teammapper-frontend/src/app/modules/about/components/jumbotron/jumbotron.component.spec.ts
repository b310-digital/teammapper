import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { TranslateModule } from '@ngx-translate/core'

import { JumbotronComponent } from './jumbotron.component'

describe('JumbotronComponent', () => {
  let component: JumbotronComponent
  let fixture: ComponentFixture<JumbotronComponent>

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [JumbotronComponent],
      imports: [
        TranslateModule.forRoot(),
        MatIconModule,
        MatListModule,
      ]
    })
      .compileComponents()
  }))

  beforeEach(() => {
    fixture = TestBed.createComponent(JumbotronComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
