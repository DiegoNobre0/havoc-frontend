import { Routes } from '@angular/router';

export const routes: Routes = [
  // Redireciona a raiz para o login
  { 
    path: '', 
    redirectTo: 'login', 
    pathMatch: 'full' 
  },
  
  // Rotas Públicas
  {
    path: 'login',
    title: 'Havoc | Login',
    loadComponent: () => import('./pages/login/login').then(m => m.Login)
  },

  // Rotas Privadas (Futuramente colocaremos o canActivate: [authGuard] aqui)
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
    path: 'orders', // Consertei a digitação de 'ordes' da sua pasta
    title: 'Havoc | Pedidos',
    loadComponent: () => import('./pages/orders/orders').then(m => m.Orders)
  },
  {
    path: 'settings',
    title: 'Havoc | Configurações',
    loadComponent: () => import('./pages/settings/settings').then(m => m.Settings)
  },

  // Rota 404 de fallback
  { 
    path: '**', 
    redirectTo: 'login' 
  }
];