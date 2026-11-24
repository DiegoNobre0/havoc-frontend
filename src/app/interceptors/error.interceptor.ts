import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SKIP_AUTH } from './http-context.tokens';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Verifica se o erro é 401 (Não Autorizado)
      // Ignoramos as rotas de login e refresh para evitar logout duplicado/indevido
      if (
        error.status === 401 &&
        !req.context.get(SKIP_AUTH) &&
        !req.url.includes('/auth/login') &&
        !req.url.includes('/auth/refresh')
      ) {
        console.warn('Sessão inválida ou expirada. Efetuando logout de segurança...');

        // Dispara a rotina de limpeza que já criamos no Service!
        authService.logout();
      }

      // Repassa o erro para frente caso o componente que fez a chamada
      // queira mostrar um Toast ou um alerta de erro na tela.
      return throwError(() => error);
    }),
  );
};
