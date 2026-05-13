import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../environments/environment';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;

  public onNewMessage = new Subject<any>();
  public onChatUpdated = new Subject<any>();
  public onNewOrder = new Subject<any>();
  public onHandoffRequested = new Subject<any>();

  constructor() {
    // Conecta ao backend
    this.socket = io(environment.apiUrl.replace('/api', ''), {
      transports: ['websocket']
    });

    this.socket.on('connect', () => {
      console.log('🟢 Conectado ao Socket do Havoc!');
      
      // 👉 ALINHADO COM SEU BACKEND: Pede para entrar na sala geral
      this.socket.emit('join_chat_list');
    });

    this.socket.on('new_message', (data) => {
      this.onNewMessage.next(data);
    });

    this.socket.on('chat_updated', (data) => {
      this.onChatUpdated.next(data);
    });

    this.socket.on('new_order', (data) => this.onNewOrder.next(data));
    this.socket.on('handoff_requested', (data) => this.onHandoffRequested.next(data));
  }

  joinChat(sessionKey: string) {
    // 👉 ALINHADO COM SEU BACKEND: Pede para escutar um chat específico
    this.socket.emit('join_chat', sessionKey);
  }

  leaveChat(sessionKey: string) {
    // Pede para sair do chat específico
    this.socket.emit('leave_chat', sessionKey);
  }
}