import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AlertTriangle,
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  LucideAngularModule,
  Menu,
  MessageCircle,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Trello,
} from 'lucide-angular';
import { Subject } from 'rxjs';

import { AudioService } from '../../services/audio.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { MainLayout } from './main-layout';

describe('MainLayout', () => {
  let component: MainLayout;
  let fixture: ComponentFixture<MainLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        MainLayout,
        LucideAngularModule.pick({
          AlertTriangle,
          Bell,
          BellOff,
          ChevronDown,
          ChevronRight,
          FileText,
          LayoutDashboard,
          LogOut,
          Menu,
          MessageCircle,
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
            currentUser: () => ({ name: 'Administrador', role: 'ADMIN' }),
            logout: vi.fn(),
          },
        },
        {
          provide: SocketService,
          useValue: {
            onChatUpdated: new Subject(),
            onNewOrder: new Subject(),
            onHandoffRequested: new Subject(),
          },
        },
        { provide: AudioService, useValue: { playNovaMensagem: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MainLayout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
