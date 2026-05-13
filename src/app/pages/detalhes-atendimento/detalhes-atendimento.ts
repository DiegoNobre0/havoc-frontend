import { Component, OnInit, signal, ViewChild, ElementRef, inject, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ChatService } from '../../services/chat.service'; // Ajuste o caminho
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-detalhes-atendimento',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './detalhes-atendimento.html',
  styleUrl: './detalhes-atendimento.scss'
})
export class DetalhesAtendimento implements OnInit, OnDestroy {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('visualizerCanvas') private visualizerCanvas!: ElementRef<HTMLCanvasElement>;

  private route = inject(ActivatedRoute);
  private chatService = inject(ChatService);
  private socketService = inject(SocketService);

  private sessionKeyAtual: any | null = null;

  // ─── ESTADOS (SIGNALS) ─────────────────────────────────
  novaMensagem = signal('');
  gravandoAudio = signal(false);
  tempoGravacaoFormatado = signal('00:00');

  // O atendimento e as mensagens começam vazios
  atendimento = signal<any>(null);
  mensagens = signal<any[]>([]);

  // ─── VARIÁVEIS PARA O GRAVADOR DE ÁUDIO ───────────────
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private timerInterval: any;
  private segundosGravacao = 0;
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private animationFrameId?: number;


  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const sessionId = params.get('id');
      if (sessionId) {
        this.carregarHistorico(sessionId);
      }
    });

    // ESCUTA MENSAGENS NOVAS SÓ DESTE CHAT
    this.socketService.onNewMessage.subscribe((msg: any) => {
      // Passa a mensagem pelo seu Parser (para renderizar fotos e botões em tempo real)
      const parsed = this.parseMessage(msg.content);

      const novaMsg = {
        id: Date.now().toString(),
        remetente: msg.role === 'USER' ? 'cliente' : 'atendente',
        texto: parsed.htmlTexto,
        mediaType: parsed.mediaType,
        mediaUrl: parsed.mediaUrl,
        buttons: parsed.buttons,
        data: new Date()
      };

      // Adiciona na tela instantaneamente e rola para baixo
      this.mensagens.update(msgs => [...msgs, novaMsg]);
      this.scrollParaBaixo();
    });

  }

  carregarHistorico(sessionId: string) {
    this.chatService.getSessionDetails(sessionId).subscribe(session => {

      if (this.sessionKeyAtual) {
        this.socketService.leaveChat(this.sessionKeyAtual);
      }
      this.sessionKeyAtual = session.sessionKey;
      this.socketService.joinChat(this.sessionKeyAtual);

      this.atendimento.set({
        id: session.id,
        clienteNome: session.sessionKey,
        status: session.status,
        isBotActive: session.isActive
      });
    });

    this.chatService.getMessages(sessionId).subscribe(msgs => {
      const msgsFormatadas = msgs.map(m => {

        const parsed = this.parseMessage(m.content);

        return {
          id: m.id,
          remetente: m.role === 'USER' ? 'cliente' : 'atendente',
          texto: parsed.htmlTexto,
          mediaType: parsed.mediaType,
          mediaUrl: parsed.mediaUrl,
          buttons: parsed.buttons,
          data: m.createdAt
        };
      });

      this.mensagens.set(msgsFormatadas);
      this.scrollParaBaixo();
    });
  }

  ngOnDestroy() {
    if (this.sessionKeyAtual) {
      this.socketService.leaveChat(this.sessionKeyAtual);
    }
  }


  private parseMessage(content: string) {
    let texto = content || '';
    let mediaType = 'text';
    let mediaUrl = null;
    let buttons: string[] = [];

    // 1. Extrai Imagem (ex: [IMG:https://...])
    const imgMatch = texto.match(/\[IMG:(.*?)\]/i);
    if (imgMatch) {
      mediaType = 'image';
      mediaUrl = imgMatch[1];
      texto = texto.replace(imgMatch[0], ''); // Remove a tag do texto visível
    }

    // 2. Extrai Áudio (se futuramente você salvar [AUDIO:url])
    const audioMatch = texto.match(/\[AUDIO:(.*?)\]/i);
    if (audioMatch) {
      mediaType = 'audio';
      mediaUrl = audioMatch[1];
      texto = texto.replace(audioMatch[0], '');
    }

    // 3. Traduz Tags Ocultas em Botões Visuais (Igual do WhatsApp)
    const confirmMatch = texto.match(/\[CONFIRM:(.*?)\]/i);
    if (confirmMatch) {
      buttons.push('✅ Sim, é esse!');
      buttons.push('🔄 Ver outros');
      buttons.push('🛒 Finalizar pedido');
      texto = texto.replace(confirmMatch[0], '');
    }

    const sugestaoMatch = texto.match(/\[SUGESTAO:(.*?)\]/i);
    if (sugestaoMatch) {
      buttons.push('👀 Ver sugestão');
      buttons.push('🛒 Finalizar pedido');
      texto = texto.replace(sugestaoMatch[0], '');
    }

    const docMatch = texto.match(/\[DOC:(.*?)\]/i);
    if (docMatch) {
      mediaType = 'document';
      mediaUrl = docMatch[1];
      texto = texto.replace(docMatch[0], '');
    }

    // Limpa outras tags de sistema para não poluir a tela
    texto = texto.replace(/\[FINALIZAR_PEDIDO\]/gi, '');
    texto = texto.replace(/\[FORCAR_BUSCA\]/gi, '');
    texto = texto.replace(/\[FORCAR_DETALHES:(.*?)\]/gi, '');

    // 4. Formatação de WhatsApp (*negrito*, _itálico_ e quebras de linha)
    let htmlTexto = texto.trim()
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    return { htmlTexto, mediaType, mediaUrl, buttons };
  }

  // ─── AÇÕES DO CHAT ─────────────────────────────────────
  enviarMensagem() {
    const texto = this.novaMensagem().trim();
    const sessionId = this.atendimento()?.id;
    if (!texto || !sessionId) return;

    // 1. Atualização Otimista (Mostra na tela na hora)
    const tempId = Date.now().toString();
    this.mensagens.update(msgs => [...msgs, {
      id: tempId,
      remetente: 'atendente',
      texto: texto,
      data: new Date(),
      mediaType: 'text'
    }]);

    this.novaMensagem.set('');
    this.scrollParaBaixo();

    // 2. Avisa o backend para disparar no WhatsApp real
    this.chatService.sendMessage(sessionId, texto).subscribe({
      next: (msgReal) => {
        // Se a IA estava ligada, o fato do humano mandar mensagem desliga ela automaticamente
        if (this.atendimento().isBotActive) {
          this.assumirAtendimento();
        }
      },
      error: () => {
        console.error('Erro ao enviar mensagem');
        // Em um app real, você marcaria a mensagem temporária com um ícone de erro (vermelho) aqui
      }
    });
  }

  // ─── CONTROLES DE IA vs HUMANO ─────────────────────────
  assumirAtendimento() {
    const sessionId = this.atendimento()?.id;
    if (!sessionId) return;

    this.atendimento.update(a => ({ ...a, isBotActive: false }));
    this.chatService.toggleBotStatus(sessionId, false).subscribe();

    // 👉 Avisa a barra lateral que o Humano assumiu!
    this.chatService.onBotStatusChanged.next({ sessionId, isBotActive: false });
  }
  devolverParaIA() {
    const sessionId = this.atendimento()?.id;
    if (!sessionId) return;

    this.atendimento.update(a => ({ ...a, isBotActive: true }));
    this.chatService.toggleBotStatus(sessionId, true).subscribe();

    // 👉 Avisa a barra lateral que a IA voltou!
    this.chatService.onBotStatusChanged.next({ sessionId, isBotActive: true });
  }

  // ─── MÉTODOS DE ÁUDIO / MÍDIA (MANTIDOS) ───────────────
  aoSelecionarArquivo(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      this.enviarMidiaParaBackend(file, file.name);


      event.target.value = '';
    }
  }

  async iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      // SETUP DO VISUALIZADOR DE ÁUDIO
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);
      this.analyser.fftSize = 64; // Quantidade de barrinhas (quanto menor, mais grossas)

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/ogg; codecs=opus' });

        if (audioBlob.size > 0) {
          const nomeAudio = `audio_atendente_${Date.now()}.ogg`;
          this.enviarMidiaParaBackend(audioBlob, nomeAudio);
        }

        stream.getTracks().forEach(track => track.stop());
        this.limparVisualizador(); // Limpa a memória quando parar
      };

      this.mediaRecorder.start();
      this.gravandoAudio.set(true);
      this.iniciarTimer();

      // 👉 Espera o Angular renderizar o HTML e começa a desenhar
      setTimeout(() => this.desenharOndas(), 50);

    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      alert('Por favor, permita o acesso ao microfone no seu navegador.');
    }
  }

  cancelarGravacao() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.audioChunks = [];
      this.mediaRecorder.stop();
    }
    this.gravandoAudio.set(false);
    this.pararTimer();
  }

  pararGravacaoEEnviar() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.gravandoAudio.set(false);
    this.pararTimer();
  }
  private enviarMidiaParaBackend(file: Blob, fileName: string) {
    const sessionId = this.atendimento()?.id;
    if (!sessionId) return;

    // this.enviandoArquivo.set(true)

    this.chatService.sendMediaMessage(sessionId, file, fileName).subscribe({
      next: (msgBanco) => {
        // Pega a mensagem com a [TAG] que o banco retornou e passa pelo nosso Parser para renderizar a imagem/áudio na tela!
        const parsed = this.parseMessage(msgBanco.content);

        const novaMsg = {
          id: msgBanco.id,
          remetente: 'atendente',
          texto: parsed.htmlTexto,
          mediaType: parsed.mediaType,
          mediaUrl: parsed.mediaUrl,
          data: new Date()
        };

        this.mensagens.update(msgs => [...msgs, novaMsg]);
        this.scrollParaBaixo();

        // Se a IA estava ligada, humano agindo desliga ela
        if (this.atendimento()?.isBotActive) {
          this.assumirAtendimento();
        }
      },
      error: (err) => {
        console.error('Erro ao enviar mídia:', err);
        alert('Erro ao enviar arquivo. Tente novamente.');
      }
    });
  }

  private desenharOndas() {
    if (!this.analyser || !this.visualizerCanvas) return;

    const canvas = this.visualizerCanvas.nativeElement;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    // Ajusta a resolução do canvas
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      // Se parou de gravar, quebra o loop da animação
      if (!this.gravandoAudio()) return;

      this.animationFrameId = requestAnimationFrame(draw);
      this.analyser!.getByteFrequencyData(dataArray);

      // Limpa o frame anterior (fundo transparente)
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // Pega a altura do som e diminui um pouco para caber na tela
        barHeight = dataArray[i] / 2;

        // Cor da Havoc
        canvasCtx.fillStyle = '#F2B90F';

        // Desenha a barra centralizada na vertical (estilo WhatsApp)
        canvasCtx.fillRect(x, (canvas.height - barHeight) / 2, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    draw();
  }

  private limparVisualizador() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private iniciarTimer() {
    this.segundosGravacao = 0;
    this.tempoGravacaoFormatado.set('00:00');
    this.timerInterval = setInterval(() => {
      this.segundosGravacao++;
      const min = Math.floor(this.segundosGravacao / 60).toString().padStart(2, '0');
      const sec = (this.segundosGravacao % 60).toString().padStart(2, '0');
      this.tempoGravacaoFormatado.set(`${min}:${sec}`);
    }, 1000);
  }

  private pararTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  // ─── HELPERS ───────────────────────────────────────────
  private scrollParaBaixo() {
    setTimeout(() => {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    }, 150);
  }

  isAudio(msg: any): boolean {
    return msg.mediaType === 'audio';
  }
}