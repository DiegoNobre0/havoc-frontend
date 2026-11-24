import { Injectable, effect, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';

export interface SocketMessageEvent {
  role?: string;
  content?: string;
  [key: string]: unknown;
}

export interface SocketChatUpdatedEvent {
  id?: string;
  role?: string;
  sessionKey?: string;
  lastMessage?: string;
  [key: string]: unknown;
}

export interface SocketOrderEvent {
  id?: string;
  code?: string;
  customer?: string;
  total?: number | string;
  [key: string]: unknown;
}

export interface SocketHandoffEvent {
  id?: string;
  sessionKey?: string;
  [key: string]: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private readonly authService = inject(AuthService);
  private readonly socket: Socket;
  private activeChatSession: string | null = null;

  public onNewMessage = new Subject<SocketMessageEvent>();
  public onChatUpdated = new Subject<SocketChatUpdatedEvent>();
  public onNewOrder = new Subject<SocketOrderEvent>();
  public onHandoffRequested = new Subject<SocketHandoffEvent>();

  constructor() {
    this.socket = io(environment.apiUrl, {
      transports: ['websocket'],
      autoConnect: false,
    });

    this.socket.on('connect', () => {
      this.socket.emit('join_chat_list');
      if (this.activeChatSession) {
        this.socket.emit('join_chat', this.activeChatSession);
      }
    });

    this.socket.on('new_message', (data: SocketMessageEvent) => {
      this.onNewMessage.next(data);
    });

    this.socket.on('chat_updated', (data: SocketChatUpdatedEvent) => {
      this.onChatUpdated.next(data);
    });

    this.socket.on('new_order', (data: SocketOrderEvent) => this.onNewOrder.next(data));
    this.socket.on('handoff_requested', (data: SocketHandoffEvent) =>
      this.onHandoffRequested.next(data),
    );

    effect(() => {
      const token = this.authService.accessToken();
      if (token) {
        this.socket.auth = { token };
        if (this.socket.connected) {
          this.socket.disconnect().connect();
        } else {
          this.socket.connect();
        }
      } else {
        this.socket.auth = {};
        if (this.socket.connected) {
          this.socket.disconnect();
        }
      }
    });
  }

  joinChat(sessionKey: string) {
    this.activeChatSession = sessionKey;
    if (this.socket.connected) {
      this.socket.emit('join_chat', sessionKey);
    }
  }

  leaveChat(sessionKey: string) {
    if (this.activeChatSession === sessionKey) {
      this.activeChatSession = null;
    }
    if (this.socket.connected) {
      this.socket.emit('leave_chat', sessionKey);
    }
  }
}
