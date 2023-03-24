import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { MatMenuModule } from '@angular/material/menu'
import { TranslateModule } from '@ngx-translate/core'
import { DialogService } from 'src/app/core/services/dialog/dialog.service'
import { MmpService } from 'src/app/core/services/mmp/mmp.service'

import { ToolbarComponent } from './toolbar.component'

describe('ToolbarComponent', () => {
  let component: ToolbarComponent
  let fixture: ComponentFixture<ToolbarComponent>

  beforeEach(waitForAsync(() => {
    const mockDialogService = jasmine.createSpyObj('DialogService', ['openAboutDialog']);
    const mockMmpService: jasmine.SpyObj<MmpService> = jasmine.createSpyObj(MmpService, ['new']);
    
    TestBed.configureTestingModule({
      declarations: [ToolbarComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [{ provide: MmpService, useValue: mockMmpService }, { provide: DialogService, useValue: mockDialogService }],
      imports: [TranslateModule.forRoot(), MatMenuModule]
    }).compileComponents()
  }))

  beforeEach(() => {
    fixture = TestBed.createComponent(ToolbarComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
