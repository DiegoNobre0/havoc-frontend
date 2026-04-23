import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  // Dica Sênior: Se você for fazer requisições em "background" no futuro 
  // (tipo buscar notificações a cada 5s sem travar a tela), basta passar um Header para pular o loading.
  if (req.headers.has('X-Silent-Request')) {
    const clonedRequest = req.clone({ headers: req.headers.delete('X-Silent-Request') });
    return next(clonedRequest);
  }

  // Liga o botão vermelho!
  loadingService.show();

  return next(req).pipe(
    finalize(() => {
      // Quando a resposta chegar (ou der erro), desliga!
      loadingService.hide();
    })
  );
};