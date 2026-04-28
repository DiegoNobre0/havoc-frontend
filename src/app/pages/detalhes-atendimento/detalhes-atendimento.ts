import { Component, OnInit, signal, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-detalhes-atendimento',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './detalhes-atendimento.html',
  styleUrl: './detalhes-atendimento.scss'
})
export class DetalhesAtendimento implements OnInit {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  // ─── ESTADOS (SIGNALS) ─────────────────────────────────
  novaMensagem = signal('');
  gravandoAudio = signal(false);
  tempoGravacaoFormatado = signal('00:00');
  
  // Mock do Atendimento atual
  atendimento = signal<any>({
    id: 'session-123',
    clienteNome: 'João Pedro',
    status: 'OPEN',
    isBotActive: true // true = IA respondendo, false = Humano
  });

  // Mock de Mensagens
  mensagens = signal<any[]>([
    { id: 1, remetente: 'cliente', texto: 'Quero comprar um Whey', data: new Date(Date.now() - 60000), mediaType: 'text' },
    { id: 2, remetente: 'atendente', texto: 'Olá João! Aqui é a IA da Havoc. Temos Whey Concentrado e Isolado. Qual você prefere?', data: new Date(), mediaType: 'text' }
  ]);

  ngOnInit() {
    this.scrollParaBaixo();
  }

  // ─── AÇÕES DO CHAT ─────────────────────────────────────
  enviarMensagem() {
    const texto = this.novaMensagem().trim();
    if (!texto) return;

    this.mensagens.update(msgs => [...msgs, {
      id: Date.now(),
      remetente: 'atendente', // Se enviou daqui, é o humano
      texto: texto,
      data: new Date(),
      mediaType: 'text'
    }]);

    this.novaMensagem.set('');
    this.scrollParaBaixo();

    // Se o humano digitou, pausamos a IA automaticamente (Handoff)
    if (this.atendimento().isBotActive) {
      this.assumirAtendimento();
    }
  }

  aoSelecionarArquivo(event: any) {
    const files = event.target.files;
    if (files.length > 0) {
      // Lógica de upload aqui...
      console.log('Arquivos selecionados:', files);
    }
  }

  // ─── CONTROLES DE IA vs HUMANO ─────────────────────────
  assumirAtendimento() {
    this.atendimento.update(a => ({ ...a, isBotActive: false }));
    // TODO: Chamar API (PATCH /status) para isActive: false
  }

  devolverParaIA() {
    this.atendimento.update(a => ({ ...a, isBotActive: true }));
    // TODO: Chamar API (PATCH /status) para isActive: true
  }

  // ─── ÁUDIO (Mock visual) ───────────────────────────────
  iniciarGravacao() {
    this.gravandoAudio.set(true);
    this.tempoGravacaoFormatado.set('00:01');
    // Lógica real de MediaRecorder entraria aqui
  }

  cancelarGravacao() {
    this.gravandoAudio.set(false);
  }

  pararGravacaoEEnviar() {
    this.gravandoAudio.set(false);
    console.log('Áudio enviado!');
  }

  // ─── HELPERS ───────────────────────────────────────────
  private scrollParaBaixo() {
    setTimeout(() => {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }

  isAudio(msg: any): boolean {
    return msg.mediaType === 'audio';
  }
}