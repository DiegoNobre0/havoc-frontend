import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet, Router, ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

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

  // ─── ESTADOS (SIGNALS) ─────────────────────────────────
  termoBusca = signal('');
  abaAtual = signal<'PENDENTES' | 'FINALIZADOS'>('PENDENTES');
  idSelecionado = signal<string | null>(null);

  // Mock simulando o que virá do Prisma (ChatSession)
  conversas = signal<any[]>([
    {
      id: 'session-123',
      cliente: { nome: 'João Pedro', avatar: null },
      ultimaMensagem: 'Quero comprar um Whey',
      hora: new Date(),
      naoLidas: 2,
      isBotActive: true, // IA está respondendo
      status: 'PENDENTES'
    },
    {
      id: 'session-456',
      cliente: { nome: 'Maria Silva', avatar: null },
      ultimaMensagem: 'Me passa o código de rastreio?',
      hora: new Date(Date.now() - 3600000),
      naoLidas: 0,
      isBotActive: false, // Humano assumiu
      status: 'PENDENTES'
    }
  ]);

  // ─── COMPUTED (Filtros Reativos) ───────────────────────
  conversasFiltradas = computed(() => {
    const busca = this.termoBusca().toLowerCase();
    const aba = this.abaAtual();
    
    return this.conversas().filter(chat => 
      chat.status === aba && 
      chat.cliente.nome.toLowerCase().includes(busca)
    );
  });

  qtdPendentes = computed(() => this.conversas().filter(c => c.status === 'PENDENTES').length);
  qtdFinalizados = computed(() => this.conversas().filter(c => c.status === 'FINALIZADOS').length);

  ngOnInit() {
    // Escuta mudanças na URL para manter o item selecionado na sidebar
    this.route.firstChild?.paramMap.subscribe(params => {
      this.idSelecionado.set(params.get('id'));
    });
  }

  trocarAba(aba: 'PENDENTES' | 'FINALIZADOS') {
    this.abaAtual.set(aba);
  }

  selecionarAtendimento(chat: any) {
    this.idSelecionado.set(chat.id);
    
    // Marca como lida localmente
    this.conversas.update(chats => chats.map(c => 
      c.id === chat.id ? { ...c, naoLidas: 0 } : c
    ));

    // Navega para o componente filho (Detalhes)
    this.router.navigate(['/whatsapp', chat.id]);
  }
}