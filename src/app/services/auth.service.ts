import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, switchMap, of, catchError } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../environments/environment';


export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERADOR' | 'VISUALIZADOR';
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = `${environment.apiUrl}`; // Ex: http://localhost:3333

  // Nossa "chave secreta" do LocalStorage
  private readonly REFRESH_KEY = '@havoc:refreshToken';

  // Signals (A Memória Rápida)
  currentUser = signal<User | null>(null);
  accessToken = signal<string | null>(null);

  login(credentials: { email: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/login`, credentials).pipe(
      tap(response => {
        // 1. Salva o UUID longo no HD do navegador (Sobrevive ao F5)
        localStorage.setItem(this.REFRESH_KEY, response.refreshToken);
        
        // 2. Salva o Access Token na RAM (Morre no F5, mas é super seguro)
        this.accessToken.set(response.accessToken);
        this.currentUser.set(response.user);
      })
    );
  }

  // --- A MÁGICA DO F5 ACONTECE AQUI ---
  autoLogin(): Observable<any> {
    const refreshToken = localStorage.getItem(this.REFRESH_KEY);

    // Se não tem token salvo, o usuário é um visitante normal. Fim.
    if (!refreshToken) {
      return of(null);
    }

    // Se tem token, vamos no backend pedir uma sessão nova silenciosamente
    return this.http.post<any>(`${this.apiUrl}/auth/refresh`, { refreshToken }).pipe(
      tap(response => {
        // Atualiza a gaveta com o novo Refresh Token rotativo
        localStorage.setItem(this.REFRESH_KEY, response.refreshToken);
        this.accessToken.set(response.accessToken);
      }),
      // Como o /refresh não devolve o Nome/Email, fazemos um "pulo" pra rota /users/me
      // O nosso authInterceptor que criamos antes já vai espetar o token novo aqui!
      switchMap(() => this.http.get<any>(`${this.apiUrl}/users/me`)),
      tap(profileResponse => {
        this.currentUser.set(profileResponse.user); // Tela restaurada com sucesso!
      }),
      catchError(() => {
        // Se o token expirou (passou de 7 dias) ou o backend recusou, limpamos a casa.
        this.logout();
        return of(null);
      })
    );
  }

  logout() {
    const refreshToken = localStorage.getItem(this.REFRESH_KEY);
    
    // Tenta avisar o backend para destruir a sessão no Redis
    if (refreshToken) {
      this.http.post(`${this.apiUrl}/auth/logout`, { refreshToken }).subscribe();
    }

    // Limpa a casa no frontend
    localStorage.removeItem(this.REFRESH_KEY);
    this.accessToken.set(null);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }
}