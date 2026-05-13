import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

// ─── VARIÁVEIS DE CONTROLE DE FILA ───────────────────────────
// Servem para evitar que o Angular tente renovar o token 10 vezes ao 
// mesmo tempo se 10 imagens tentarem carregar na exata hora que o token expirar.
let isRefreshing = false;
let refreshTokenSubject = new BehaviorSubject<any>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.accessToken();

  // 1. O QUE VOCÊ JÁ FEZ: Clona e injeta o token
  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  // 2. A MÁGICA NOVA: Dispara a requisição e "fica de olho" na resposta
  return next(authReq).pipe(
    catchError((error) => {
      
      // O token de 15 minutos venceu e o backend deu 401?
      if (error instanceof HttpErrorResponse && error.status === 401) {
        
        // Proteção: Se a própria rota de renovar token der 401, significa que o token
        // de 7 dias também venceu (ou o admin deletou no Redis). Aí sim deslogamos.
        if (req.url.includes('/refresh')) {
          authService.logout();
          return throwError(() => error);
        }

        // Se NÃO estiver renovando ainda, inicia o processo de renovação
        if (!isRefreshing) {
          isRefreshing = true;
          refreshTokenSubject.next(null); // Zera a fila de espera

          // Chama o backend para pegar o token novo
          return authService.refreshToken().pipe(
            switchMap((response: any) => {
              isRefreshing = false;
              // Avisa a fila de espera que o token novo chegou
              refreshTokenSubject.next(response.accessToken);
              
              // REFAZ a requisição original que tinha falhado, mas agora com o token novinho!
              return next(req.clone({
                setHeaders: { Authorization: `Bearer ${response.accessToken}` }
              }));
            }),
            catchError((err) => {
              // Deu algum erro bizarro na hora de renovar? Desloga por segurança.
              isRefreshing = false;
              authService.logout();
              return throwError(() => err);
            })
          );
        } else {
          // Se JÁ TEM um processo de renovação acontecendo, essa requisição fica
          // "na fila" aguardando o token novo chegar para tentar novamente.
          return refreshTokenSubject.pipe(
            filter(newToken => newToken != null),
            take(1), // Pega o token novo só uma vez
            switchMap(jwt => {
              return next(req.clone({
                setHeaders: { Authorization: `Bearer ${jwt}` }
              }));
            })
          );
        }
      }
      
      // Se for Erro 400 (Bad Request), 500 (Erro interno), repassa o erro normalmente
      return throwError(() => error);
    })
  );
};