import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet, Router, ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ChatService } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { AudioService } from '../../services/audio.service';
import { Observable, Subject } from 'rxjs'


@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, LucideAngularModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss'
})
export class Chat implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private chatService = inject(ChatService);
  private socketService = inject(SocketService);
  private audioService = inject(AudioService);

 
  // ─── ESTADOS (SIGNALS) ─────────────────────────────────
  termoBusca = signal('');
  abaAtual = signal<'PENDENTES' | 'FINALIZADOS'>('PENDENTES');
  idSelecionado = signal<string | null>(null);

  conversas = signal<any[]>([]);

  // ─── COMPUTED (Filtros Reativos) ───────────────────────
  conversasFiltradas = computed(() => {
    const busca = this.termoBusca().toLowerCase();
    const aba = this.abaAtual();
    
    return this.conversas().filter(chat => 
      chat.tab === aba && // 👉 Filtra pela aba lógica
      (chat.cliente?.nome || chat.sessionKey).toLowerCase().includes(busca)
    );
  });

  qtdPendentes = computed(() => this.conversas().filter(c => c.tab === 'PENDENTES').length);
  qtdFinalizados = computed(() => this.conversas().filter(c => c.tab === 'FINALIZADOS').length);

 ngOnInit() {
    this.carregarConversas();

  
    // ESCUTA O SOCKET EM TEMPO REAL
    this.socketService.onChatUpdated.subscribe((dados: any) => {
      if (dados.role === 'USER') {
        this.audioService.playNovaMensagem();
      }
      
      this.conversas.update(chatsAtuais => {
        const index = chatsAtuais.findIndex(c => c.sessionKey === dados.sessionKey);
        
        if (index > -1) {
          // Se o chat JÁ EXISTE: Apenas atualiza o card na memória (sem chamar a API!)
          const chatAtualizado = { 
            ...chatsAtuais[index], 
            ultimaMensagem: this.formatarPreviewMensagem(dados.lastMessage),          
            naoLidas: chatsAtuais[index].id !== this.idSelecionado() ? chatsAtuais[index].naoLidas + 1 : 0,
            hora: new Date()
          };
          chatsAtuais.splice(index, 1);
          return [chatAtualizado, ...chatsAtuais];
          
        } else {
          
          const novoChat = {
            id: dados.id, // 🔥 A MÁGICA ESTÁ AQUI: Nada de ID temporário!
            sessionKey: dados.sessionKey,
            cliente: { nome: dados.sessionKey, avatar: null },
            ultimaMensagem: this.formatarPreviewMensagem(dados.lastMessage),
            hora: new Date(),
            naoLidas: 1,
            isBotActive: true,
            statusReal: 'NOVO_ATENDIMENTO', 
            tab: 'PENDENTES'
          };
         
          const listaAtualizada = [novoChat, ...chatsAtuais];
      
          return listaAtualizada;
        }
      });
    });

    this.route.firstChild?.paramMap.subscribe(params => {
      this.idSelecionado.set(params.get('id'));
    });

    this.chatService.onBotStatusChanged.subscribe((status: {sessionId: string, isBotActive: boolean}) => {
      this.conversas.update((chatsAtuais: any[]) => 
        chatsAtuais.map((chat: any) => 
          chat.id === status.sessionId 
            ? { ...chat, isBotActive: status.isBotActive } 
            : chat
        )
      );
    });
  }

  carregarConversas() {
    this.chatService.getSessions().subscribe({
      next: (res: any) => {
        if (!res.data) return;

        const formatado = res.data.map((session: any) => {
          // 👉 Define a qual aba o atendimento pertence
          const isResolvido = session.status === 'FINALIZADO' || session.status === 'CANCELADO';

          return {
            id: session.id,
            sessionKey: session.sessionKey,
            cliente: { nome: session.sessionKey, avatar: null },
            ultimaMensagem: this.formatarPreviewMensagem(session.messages?.[0]?.content || 'Nova conversa'),   
            hora: session.messages?.[0]?.createdAt || session.updatedAt,
            naoLidas: 0, 
            isBotActive: session.isActive,
            statusReal: session.status, // 👈 Guarda o status do Prisma
            tab: isResolvido ? 'FINALIZADOS' : 'PENDENTES' // 👈 Aba do layout
          };
        });

        this.conversas.set(formatado);        
      },
      error: (err) => console.error('Erro ao buscar conversas', err)
    });
  }

  trocarAba(aba: 'PENDENTES' | 'FINALIZADOS') {
    this.abaAtual.set(aba);
  }

  selecionarAtendimento(chat: any) {
    // 👇 Impede de clicar e dar o Erro 404 enquanto o banco está processando
    if (!chat.id || String(chat.id).startsWith('temp_')) {
      console.warn('Sessão ainda não tem ID real. Aguardando...');
      return; 
    }

    this.idSelecionado.set(chat.id);
    this.router.navigate(['/whatsapp', chat.id]);
  }

  // 👉 Helper para formatar o texto da Tag na tela
  formatarStatus(status: string): string {
    const mapa: any = {
      'NOVO_ATENDIMENTO': 'Novo',
      'EM_ANDAMENTO': 'Em Andamento',
      'AGUARDANDO_PAGAMENTO': 'Aguard. Pagamento',
      'ATENDIMENTO_HUMANO': 'Humano Assumiu',
      'FINALIZADO': 'Finalizado',
      'CANCELADO': 'Cancelado'
    };
    return mapa[status] || status;
  }

  // 👉 NOVO: Traduz tags feias para ícones amigáveis
  formatarPreviewMensagem(texto: string): string {
    if (!texto) return 'Nova conversa';
    if (texto.includes('[AUDIO:')) return '🎵 Áudio';
    if (texto.includes('[IMG:')) return '📷 Imagem';
    if (texto.includes('[DOC:')) return '📄 Documento';
    
    // Se for mensagem de texto com tags ocultas (ex: [FINALIZAR]), limpa as tags
    let limpo = texto.replace(/\[.*?\]/g, '').trim();
    return limpo.length > 0 ? limpo : '🤖 Ação Interativa';
  }
}