import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Se temos o token na memória, a passagem é livre
  if (authService.accessToken()) {
    return true;
  }

  // Caso contrário, mandamos para o login
  // Guardamos a URL que ele tentou acessar para redirecionar depois do login (opcional)
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url }
  });
};