import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ArrowRight,
  ExternalLink,
  LucideAngularModule,
  MapPin,
  ShoppingBag,
  User,
} from 'lucide-angular';

import { BioLinksComponent } from './bio-links';

describe('BioLinks', () => {
  let component: BioLinksComponent;
  let fixture: ComponentFixture<BioLinksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        BioLinksComponent,
        LucideAngularModule.pick({ ArrowRight, ExternalLink, MapPin, ShoppingBag, User }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BioLinksComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
