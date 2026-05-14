import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '../environments/environment';


@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/chatbot`; // Ex: http://localhost:3333/chatbot
  public onBotStatusChanged = new Subject<{sessionId: string, isBotActive: boolean}>();

  // 1. Busca todas as sessões (conversas)
 getSessions(): Observable<{ data: any[], meta: any }> {
  return this.http.get<{ data: any[], meta: any }>(`${this.apiUrl}/sessions`);
}

  // 2. Busca o histórico de mensagens de uma sessão específica
  getMessages(sessionId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/sessions/${sessionId}/messages`);
  }

  // 3. Busca os detalhes da sessão (para saber se o bot está ativo)
  getSessionDetails(sessionId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/sessions/${sessionId}`);
  }

  // 4. Envia uma mensagem do atendente para o cliente
  sendMessage(sessionId: string, content: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/messages`, { content });
  }

  // 5. Liga/Desliga a IA (Handoff)
  toggleBotStatus(sessionId: string, isActive: boolean): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/sessions/${sessionId}/status`, { isActive });
  }

  sendMediaMessage(sessionId: string, file: Blob, fileName: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file, fileName);

    // O HttpClient do Angular define o cabeçalho multipart/form-data automaticamente quando passamos um FormData!
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/media`, formData);
  }

  finalizarAtendimento(sessionId: string): Observable<any> {
   
    return this.http.patch<any>(`${this.apiUrl}/sessions/${sessionId}/tag`, { 
      status: 'FINALIZADO',
     
    });
  }

  
}