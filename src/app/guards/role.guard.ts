import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  const user = authService.currentUser();
  // Pegamos os cargos permitidos definidos na rota
  const expectedRoles = route.data['roles'] as Array<string>;

  if (!user || !expectedRoles.includes(user.role)) {
    // Se não tem permissão, mandamos para o dashboard (ou página de erro 403)
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};