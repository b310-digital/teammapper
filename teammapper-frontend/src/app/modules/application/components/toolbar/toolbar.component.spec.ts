import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { MatDialog, MatDialogModule } from '@angular/material/dialog'
import { MatMenuModule } from '@angular/material/menu'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MmpService } from 'src/app/core/services/mmp/mmp.service'
import { DialogService } from 'src/app/shared/services/dialog/dialog.service'

import { ToolbarComponent } from './toolbar.component'

describe('ToolbarComponent', () => {
  let component: ToolbarComponent
  let fixture: ComponentFixture<ToolbarComponent>

  beforeEach(waitForAsync(() => {
    const mockDialogService: jasmine.SpyObj<DialogService> = jasmine.createSpyObj(DialogService, ['openAboutDialog']);
    const mockMmpService: jasmine.SpyObj<MmpService> = jasmine.createSpyObj(MmpService, ['new']);
    
    TestBed.configureTestingModule({
      declarations: [ToolbarComponent],
      providers: [MatDialog, { provide: MmpService, useValue: mockMmpService }],
      // , { provide: DialogService, useValue: mockDialogService }
      imports: [TranslateModule.forRoot(), MatMenuModule, MatDialogModule]
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
