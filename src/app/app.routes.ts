import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  // ----------------------------------------------------
  // ROTAS PÚBLICAS (Sem Layout)
  // ----------------------------------------------------
  {
    path: 'login',
    title: 'Havoc | Login',
    loadComponent: () => import('./pages/login/login').then(m => m.Login) // Ajuste para LoginComponent se necessário
  },

  // ----------------------------------------------------
  // ROTAS PRIVADAS (Com Layout - Sidebar e Header)
  // ----------------------------------------------------
  {
    path: '',
    canActivate: [authGuard], // O Guardião fica na porta principal e protege tudo lá dentro!
    loadComponent: () => import('./components/main-layout/main-layout').then(m => m.MainLayout),
    children: [
      // Se acessar apenas a raiz ('/'), joga direto pro dashboard
      { 
        path: '', 
        redirectTo: 'dashboard', 
        pathMatch: 'full' 
      },
      {
        path: 'dashboard',
        title: 'Havoc | Painel Geral',
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard)
      },
      {
        path: 'catalog',
        title: 'Havoc | Catálogo',
        loadComponent: () => import('./pages/catalog/catalog').then(m => m.Catalog)
      },
      {
        path: 'orders',
        title: 'Havoc | Pedidos',
        loadComponent: () => import('./pages/orders/orders').then(m => m.Orders)
      },
      {
        path: 'settings',
        title: 'Havoc | Configurações',
        loadComponent: () => import('./pages/settings/settings').then(m => m.Settings)
      }
    ]
  },

  // ----------------------------------------------------
  // ROTA DE FALLBACK (Erro 404)
  // ----------------------------------------------------
  { 
    path: '**', 
    redirectTo: 'dashboard' // Manda pro dashboard (Se não estiver logado, o authGuard chuta pro login)
  }
];