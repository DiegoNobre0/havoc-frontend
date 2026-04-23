import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Verifica se o erro é 401 (Não Autorizado) 
      // Ignoramos a rota de login, pois lá o 401 significa apenas "senha errada"
      if (error.status === 401 && !req.url.includes('/auth/login')) {
        console.warn('Sessão inválida ou expirada. Efetuando logout de segurança...');
        
        // Dispara a rotina de limpeza que já criamos no Service!
        authService.logout();
      }

      // Repassa o erro para frente caso o componente que fez a chamada 
      // queira mostrar um Toast ou um alerta de erro na tela.
      return throwError(() => error);
    })
  );
};