import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AlertTriangle,
  Bell,
  BellOff,
  LucideAngularModule,
  Menu,
  MessageCircle,
  ShoppingBag,
} from 'lucide-angular';
import { Subject } from 'rxjs';

import { AudioService } from '../../services/audio.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Header,
        LucideAngularModule.pick({
          AlertTriangle,
          Bell,
          BellOff,
          Menu,
          MessageCircle,
          ShoppingBag,
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ name: 'Administrador' }) } },
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

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
