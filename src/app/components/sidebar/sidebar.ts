import { Component, inject, input, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { 
  LucideAngularModule, 
  LayoutDashboard, 
  ShoppingCart, 
  Trello, 
  Package, 
  ChevronDown, 
  ChevronRight, 
  Users, 
  MessageSquare 
} from 'lucide-angular';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule, 
    RouterModule, 
    LucideAngularModule
  ],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.scss']
})
export class Sidebar {
  // O Layout pai vai passar esses valores para a sidebar
  isCollapsed = input(false);
  isMobileOpen = input(false);

  authService = inject(AuthService);
  private router = inject(Router);

  // Controle do submenu de catálogo
  isCatalogOpen = signal(false);

  toggleCatalog() {
    this.isCatalogOpen.update(val => !val);
  }

  // Verifica se a URL atual faz parte do catálogo para deixar o menu ativo
  isCatalogRoute(): boolean {
    return this.router.url.includes('/catalog');
  }

  // Pega a primeira letra do nome do usuário para o Avatar
  getInitials(): string {
    const name = this.authService.currentUser()?.name || 'U';
    return name.charAt(0).toUpperCase();
  }
}