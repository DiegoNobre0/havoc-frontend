import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  LucideAngularModule,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-angular';
import { of } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Login,
        LucideAngularModule.pick({
          AlertTriangle,
          ArrowRight,
          ExternalLink,
          Eye,
          EyeOff,
          Package,
          RefreshCw,
          ShieldCheck,
          ShoppingBag,
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { login: vi.fn(() => of({})) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
