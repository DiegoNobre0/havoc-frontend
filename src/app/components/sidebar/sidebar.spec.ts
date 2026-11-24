import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  LucideAngularModule,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Trello,
} from 'lucide-angular';

import { AuthService } from '../../services/auth.service';
import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;
  let role: 'ADMIN' | 'VISUALIZADOR';

  beforeEach(async () => {
    role = 'ADMIN';
    await TestBed.configureTestingModule({
      imports: [
        Sidebar,
        LucideAngularModule.pick({
          ChevronDown,
          ChevronRight,
          FileText,
          LayoutDashboard,
          LogOut,
          MessageSquare,
          Package,
          Settings,
          ShoppingBag,
          ShoppingCart,
          Trello,
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({ name: 'Administrador', role }),
            logout: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hides fiscal documents from viewers', async () => {
    expect(fixture.nativeElement.querySelector('a[href="/fiscal/documents"]')).toBeTruthy();
    fixture.destroy();
    role = 'VISUALIZADOR';
    fixture = TestBed.createComponent(Sidebar);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('a[href="/fiscal/documents"]')).toBeNull();
  });
});
