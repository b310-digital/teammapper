import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { MatLegacyListModule as MatListModule } from '@angular/material/legacy-list';
import { TranslateModule } from '@ngx-translate/core';
import { SettingsService } from 'src/app/core/services/settings/settings.service';

import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(waitForAsync(() => {
    const mockSettingsService: jasmine.SpyObj<SettingsService> =
      jasmine.createSpyObj(SettingsService, ['getCachedSettings']);
    mockSettingsService.getCachedSettings.and.returnValue(
      jasmine.createSpyObj('settings', ['general'])
    );

    TestBed.configureTestingModule({
      declarations: [FooterComponent],
      providers: [{ provide: SettingsService, useValue: mockSettingsService }],
      imports: [TranslateModule.forRoot(), MatIconModule, MatListModule],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
