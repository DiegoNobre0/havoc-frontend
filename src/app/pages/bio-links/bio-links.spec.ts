import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BioLinks } from './bio-links';

describe('BioLinks', () => {
  let component: BioLinks;
  let fixture: ComponentFixture<BioLinks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BioLinks]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BioLinks);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
