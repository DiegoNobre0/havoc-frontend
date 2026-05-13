import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';


// Opcional: Você pode criar interfaces separadas, mas vou deixar aqui para facilitar
export interface User {
  id?: string;
  name: string;
  email: string;
  password?: string;
  role: 'ADMIN' | 'OPERADOR' | 'VISUALIZADOR';
  isActive: boolean;
}

export interface ShippingRule {
  id?: string;
  name: string;
  type: 'BY_CEP' | 'BY_REGION' | 'BY_WEIGHT' | 'FIXED';
  price: number;
  isActive: boolean;
  // adicione os outros campos conforme necessário (cep, region, minWeight, etc)
}

export interface ChatbotConfig {
  id?: string;
  systemPrompt: string;
  temperature: number;
  fallbackMessage: string;
  isActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl; // Ex: 'http://localhost:3333'

  // ==========================================
  // 👥 USUÁRIOS
  // ==========================================
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`);
  }

  createUser(data: User): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users`, data);
  }

  updateUser(id: string, data: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/users/${id}`, data);
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${id}`);
  }

  // ==========================================
  // 🚚 REGRAS DE FRETE
  // ==========================================
  getShippingRules(): Observable<ShippingRule[]> {
    // Certifique-se de que no Fastify você registrou o prefixo como '/shipping'
    return this.http.get<ShippingRule[]>(`${this.apiUrl}/shipping/rules`);
  }

  createShippingRule(data: ShippingRule): Observable<ShippingRule> {
    return this.http.post<ShippingRule>(`${this.apiUrl}/shipping/rules`, data);
  }

  updateShippingRule(id: string, data: Partial<ShippingRule>): Observable<ShippingRule> {
    return this.http.put<ShippingRule>(`${this.apiUrl}/shipping/rules/${id}`, data);
  }

  deleteShippingRule(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/shipping/rules/${id}`);
  }

  // ==========================================
  // 🤖 CHATBOT CONFIG
  // ==========================================
  getChatbotConfig(): Observable<ChatbotConfig> {
    return this.http.get<ChatbotConfig>(`${this.apiUrl}/chatbot/config`);
  }

  updateChatbotConfig(data: Partial<ChatbotConfig>): Observable<{ message: string, config: ChatbotConfig }> {
    return this.http.put<{ message: string, config: ChatbotConfig }>(`${this.apiUrl}/chatbot/config`, data);
  }
}