import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import {
  Bot,
  Check,
  CheckCircle,
  Hand,
  LucideAngularModule,
  Mic,
  Paperclip,
  Send,
  Trash2,
  User,
} from 'lucide-angular';
import { Subject, of } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { DetalhesAtendimento } from './detalhes-atendimento';

describe('DetalhesAtendimento', () => {
  let component: DetalhesAtendimento;
  let fixture: ComponentFixture<DetalhesAtendimento>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DetalhesAtendimento,
        LucideAngularModule.pick({
          Bot,
          Check,
          CheckCircle,
          Hand,
          Mic,
          Paperclip,
          Send,
          Trash2,
          User,
        }),
      ],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})) } },
        { provide: ChatService, useValue: {} },
        {
          provide: SocketService,
          useValue: { onNewMessage: new Subject(), joinChat: vi.fn(), leaveChat: vi.fn() },
        },
        { provide: AuthService, useValue: { currentUser: () => ({ name: 'Administrador' }) } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DetalhesAtendimento);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
