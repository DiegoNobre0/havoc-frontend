import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar'; // Ajuste o caminho se necessário
import { CommonModule } from '@angular/common';
import { Header} from '../header/header';
import { filter } from 'rxjs';


@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, Sidebar,Header,], // Importa o componente Sidebar
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss'
})
export class MainLayout {
private router = inject(Router);
// Controle de estados
  isMobileMenuOpen = signal(false);
  isCollapsed = signal(false); // 👈 Adicione este sinal aqui

constructor() {
    // Escuta mudanças de rota para fechar o menu no mobile automaticamente
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.closeMobileMenu();
    });
  }

  // Função mestre que você criou (Ajustada)
  toggleMenu() {
    if (window.innerWidth > 991) {
      this.isCollapsed.set(!this.isCollapsed());
    } else {
      this.isMobileMenuOpen.set(!this.isMobileMenuOpen());
    }
  }

  closeMobileMenu() {
    this.isMobileMenuOpen.set(false);
  }

}