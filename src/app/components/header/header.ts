import { Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { 
  LucideAngularModule, 
  Menu, 
  Search, 
  Bell, 
  ShoppingBag, 
  AlertTriangle 
} from 'lucide-angular';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule
  ],
  templateUrl: './header.html',
  styleUrls: ['./header.scss']
})
export class Header{
  authService = inject(AuthService);
  
  // No Angular 21+, usamos a função output() no lugar do @Output()
  toggleMenu = output<void>();

  // Estados locais do Header
  isNotifOpen = signal(false);
  isPosOpen = signal(true); // Simula se o caixa do dia está aberto

  toggleNotif() {
    this.isNotifOpen.update(val => !val);
  }

  getInitials(): string {
    const name = this.authService.currentUser()?.name || 'H';
    return name.charAt(0).toUpperCase();
  }
}