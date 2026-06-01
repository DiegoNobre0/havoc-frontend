import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, switchMap, of, catchError, throwError } from 'rxjs';
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
  isInitializing = signal<boolean>(true);

  
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

autoLogin(): Observable<any> {
  const refreshToken = localStorage.getItem(this.REFRESH_KEY);

  if (!refreshToken) {
    this.isInitializing.set(false);
    return of(null);
  }

  return this.http.post<any>(`${this.apiUrl}/auth/refresh`, { refreshToken }).pipe(
    tap(response => {
      localStorage.setItem(this.REFRESH_KEY, response.refreshToken);
      this.accessToken.set(response.accessToken); // <-- seta ANTES do switchMap
    }),
    switchMap(() => this.http.get<any>(`${this.apiUrl}/users/me`)),
    tap(profileResponse => {
      this.currentUser.set(profileResponse.user);
      this.isInitializing.set(false); // <-- libera o guard
    }),
    catchError(() => {
      this.logout();
      this.isInitializing.set(false);
      return of(null);
    })
  );
}


logout() {
  const refreshToken = localStorage.getItem(this.REFRESH_KEY);
  
  if (refreshToken) {
    // Ignora erros do logout no backend — não deve causar side effects
    this.http.post(`${this.apiUrl}/auth/logout`, { refreshToken })
      .pipe(catchError(() => of(null)))  // <-- aqui
      .subscribe();
  }

  localStorage.removeItem(this.REFRESH_KEY);
  this.accessToken.set(null);
  this.currentUser.set(null);
  this.router.navigate(['/login']);
}

  // Renova o token de acesso usando o Refresh Token
  refreshToken() {
    const refresh = localStorage.getItem(this.REFRESH_KEY);
    
    if (!refresh) {
      this.logout();
      return throwError(() => new Error('Sem refresh token'));
    }

    // Chama a sua rota do Fastify /refresh
    return this.http.post<any>(`${this.apiUrl}/auth/refresh`, { refreshToken: refresh }).pipe(
      tap(response => {
        // Atualiza os tokens novos no frontend
        localStorage.setItem(this.REFRESH_KEY, response.refreshToken);
        this.accessToken.set(response.accessToken);
      })
    );
  }
}