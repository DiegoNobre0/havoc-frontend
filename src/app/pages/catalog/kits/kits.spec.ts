import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Kits } from './kits';

describe('Kits', () => {
  let component: Kits;
  let fixture: ComponentFixture<Kits>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Kits]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Kits);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
