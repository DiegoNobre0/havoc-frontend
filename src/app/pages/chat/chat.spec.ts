import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Bot, LucideAngularModule, MessageCircle, RefreshCw, Search, User } from 'lucide-angular';
import { Subject, of } from 'rxjs';

import { AudioService } from '../../services/audio.service';
import { ChatService } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { Chat } from './chat';

describe('Chat', () => {
  let component: Chat;
  let fixture: ComponentFixture<Chat>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Chat, LucideAngularModule.pick({ Bot, MessageCircle, RefreshCw, Search, User })],
      providers: [
        provideRouter([]),
        {
          provide: ChatService,
          useValue: {
            getSessions: () => of({ data: [], meta: {} }),
            onBotStatusChanged: new Subject(),
          },
        },
        { provide: SocketService, useValue: { onChatUpdated: new Subject() } },
        { provide: AudioService, useValue: { playNovaMensagem: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Chat);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
