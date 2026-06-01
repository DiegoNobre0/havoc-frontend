import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isInitializing()) {
    return toObservable(authService.isInitializing).pipe(
      filter((init: boolean) => !init),
      take(1),
      map(() => {
        if (authService.accessToken()) return true;
        return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
      })
    );
  }

  if (authService.accessToken()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url }
  });
};