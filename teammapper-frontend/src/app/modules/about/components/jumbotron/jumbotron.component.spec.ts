import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { MatListModule } from '@angular/material/list';
import { JumbotronComponent } from './jumbotron.component';
import { provideRouter } from '@angular/router';

describe('JumbotronComponent', () => {
  let component: JumbotronComponent;
  let fixture: ComponentFixture<JumbotronComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslateModule.forRoot(),
        MatIconModule,
        MatListModule,
        JumbotronComponent,
      ],
      providers: [provideRouter([])],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(JumbotronComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
