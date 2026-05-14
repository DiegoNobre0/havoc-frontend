import { Component, inject, OnInit, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { LucideAngularModule } from 'lucide-angular';
import { AudioService } from '../../services/audio.service';

export interface AppNotification {
  id: string;
  type: 'chat' | 'order' | 'alert';
  title: string;
  message: string;
  time: Date;
  read: boolean;
  link?: string; // Para onde ir ao clicar
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './header.html',
  styleUrls: ['./header.scss']
})
export class Header implements OnInit {
  authService = inject(AuthService);
  socketService = inject(SocketService);
  router = inject(Router);
    private audioService = inject(AudioService);
  
  toggleMenu = output<void>();

  // ─── ESTADOS ──────────────────────────────────────────────
  isNotifOpen = signal(false);
  isPosOpen = signal(true); 

  // Lista dinâmica de notificações
  notificacoes = signal<AppNotification[]>([]);

  // Computed signal que conta apenas as não lidas automaticamente
  unreadCount = computed(() => this.notificacoes().filter(n => !n.read).length);

  // ─── INICIALIZAÇÃO E SOCKETS ──────────────────────────────
 ngOnInit() {
    // 1. Escuta Mensagens do Chat (Sua rota existente)
    this.socketService.onChatUpdated.subscribe((dados: any) => {
      // Só notifica se a mensagem for do cliente
      if (dados.role === 'USER') {
         this.audioService.playNovaMensagem();
        this.adicionarNotificacao({
          type: 'chat',
          title: `Nova mensagem de ${dados.sessionKey}`,
          message: dados.lastMessage || 'Enviou uma mídia',
          // 👉 CORREÇÃO: Apontando para a rota do WhatsApp usando o UUID real!
          link: `/whatsapp/${dados.id}` 
        });
      }
    });

    // 2. Escuta Novos Pedidos / Delivery (Sem erro de private!)
    this.socketService.onNewOrder.subscribe((order: any) => {
      this.adicionarNotificacao({
        type: 'order',
        title: `Novo Pedido ${order.code}`,
        message: `${order.customer} - R$ ${order.total}`, // Coloquei um R$ aqui pra ficar mais bonito!
        link: `/painel/pedidos` // Esse caminho dos pedidos deve estar correto
      });
    });

    // 3. Escuta Pedido de Atendente Humano (Sem erro de private!)
    this.socketService.onHandoffRequested.subscribe((dados: any) => {
      this.adicionarNotificacao({
        type: 'alert',
        title: 'Atendimento Humano',
        message: `Cliente ${dados.sessionKey} solicitou ajuda.`,
        // 👉 CORREÇÃO: Apontando para o chat correto também!
        link: `/whatsapp/${dados.id}` 
      });
    });
  }

  // ─── AÇÕES DA INTERFACE ───────────────────────────────────
  toggleNotif() {
    this.isNotifOpen.update(val => !val);
  }

  getInitials(): string {
    const name = this.authService.currentUser()?.name || 'H';
    return name.charAt(0).toUpperCase();
  }

  private adicionarNotificacao(dados: Omit<AppNotification, 'id' | 'time' | 'read'>) {
    const nova: AppNotification = {
      ...dados,
      id: Date.now().toString(),
      time: new Date(),
      read: false
    };

    // Adiciona no topo da lista e mantém no máximo as 20 mais recentes
    this.notificacoes.update(lista => [nova, ...lista].slice(0, 20));
  }

  clicarNotificacao(notif: AppNotification) {
    // Marca como lida
    this.notificacoes.update(lista => 
      lista.map(n => n.id === notif.id ? { ...n, read: true } : n)
    );

    // Navega para a tela
    if (notif.link) {
      this.router.navigateByUrl(notif.link);
    }
    
    this.isNotifOpen.set(false); // Fecha o menu
  }

  marcarTodasComoLidas() {
    this.notificacoes.update(lista => lista.map(n => ({ ...n, read: true })));
  }
}