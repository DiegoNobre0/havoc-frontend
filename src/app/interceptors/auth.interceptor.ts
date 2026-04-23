import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Injetamos o nosso serviço para pegar o token da memória (Signal)
  const authService = inject(AuthService);
  const token = authService.accessToken();

  // Se o token existir, nós clonamos a requisição original e colamos o Header nela
  if (token) {
    const clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    // Manda a requisição clonada (com o token) para o backend
    return next(clonedRequest);
  }

  // Se não tem token (ex: tela de login), manda a requisição original mesmo
  return next(req);
};