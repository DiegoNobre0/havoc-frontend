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

    // Passamos a URL exata do environment, sem nenhum .replace() !
    this.socket = io(environment.apiUrl, {
      transports: ['websocket']
    });

    this.socket.on('connect', () => {    
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
    this.socket.emit('join_chat', sessionKey);
  }

  leaveChat(sessionKey: string) {
    // Pede para sair do chat específico
    this.socket.emit('leave_chat', sessionKey);
  }
}