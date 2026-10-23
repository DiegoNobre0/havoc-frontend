import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BioLinksComponent } from './bio-links';

describe('BioLinks', () => {
  let component: BioLinksComponent;
  let fixture: ComponentFixture<BioLinksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BioLinksComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BioLinksComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
