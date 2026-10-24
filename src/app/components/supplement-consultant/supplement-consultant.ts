import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ConsultantContext, ConsultantRecommendation } from '../../models/consultant.models';
import { StorefrontItemDetail } from '../../models/storefront.models';
import { ConsultantStateService } from '../../services/consultant-state.service';

const AUDIO_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
];
const MAX_RECORDING_MS = 60_000;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-supplement-consultant',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './supplement-consultant.html',
  styleUrl: './supplement-consultant.scss',
})
export class SupplementConsultantComponent implements OnDestroy {
  readonly context = input<ConsultantContext>({ surface: 'catalog' });
  readonly featuredItem = input<StorefrontItemDetail | null>(null);
  readonly clearMobileBottomBar = input(false);
  readonly state = inject(ConsultantStateService);
  readonly isOpen = signal(false);
  readonly isRecording = signal(false);
  readonly recordingSeconds = signal(0);
  readonly recordingError = signal<string | null>(null);
  readonly audioPhase = signal<'idle' | 'recording' | 'stopping'>('idle');
  draft = '';

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private recordingMimeType = '';
  private sendRecordingOnStop = false;
  private recordingAttempt = 0;
  private recordingStartedAt = 0;
  private recordingInterval: ReturnType<typeof setInterval> | null = null;
  private recordingTimeout: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('launcher') private launcher?: ElementRef<HTMLButtonElement>;
  @ViewChild('closeButton') private closeButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;

  constructor() {
    effect(() => {
      this.state.messages();
      if (this.isOpen()) setTimeout(() => this.scrollToLatest());
    });
  }

  async open(): Promise<void> {
    this.isOpen.set(true);
    await this.state.hydrate();
    setTimeout(() => {
      this.closeButton?.nativeElement.focus();
      this.scrollToLatest();
    });
  }

  close(): void {
    if (!this.isOpen()) return;
    this.cancelRecording();
    this.isOpen.set(false);
    setTimeout(() => this.launcher?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void this.submit();
  }

  submit(): void {
    if (this.isRecording()) {
      this.stopRecording(true);
      return;
    }
    const content = this.draft.trim();
    if (!content || content.length > 500 || this.audioPhase() !== 'idle') return;
    if (this.state.sendMessage(content, this.context())) {
      this.draft = '';
      setTimeout(() => this.scrollToLatest());
    }
  }

  isSelectionPrompt(content: string): boolean {
    return content.includes('Escolha uma opção abaixo');
  }

  selectRecommendation(index: number): void {
    if (this.state.sendMessage(String(index + 1), this.context())) {
      setTimeout(() => this.scrollToLatest());
    }
  }

  isFeaturedRecommendation(recommendation: ConsultantRecommendation): boolean {
    const item = this.featuredItem();
    return !!item && item.id === recommendation.id && item.type === recommendation.type;
  }

  async startNewConversation(): Promise<void> {
    this.cancelRecording();
    await this.state.newConversation();
    this.draft = '';
  }

  async toggleRecording(): Promise<void> {
    if (this.isRecording()) {
      this.cancelRecording();
      return;
    }
    if (this.audioPhase() !== 'idle' || this.state.isLoading()) return;

    this.recordingError.set(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.recordingError.set('Seu navegador não oferece suporte à gravação de áudio.');
      return;
    }

    const attempt = ++this.recordingAttempt;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      if (attempt !== this.recordingAttempt) return;
      const denied = error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      this.recordingError.set(denied
        ? 'Permissão para usar o microfone negada.'
        : 'Não foi possível acessar o microfone. Tente novamente.');
      return;
    }

    if (attempt !== this.recordingAttempt || !this.isOpen()) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    try {
      const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
        ? AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
        : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      this.stream = stream;
      this.recorder = recorder;
      this.recordingMimeType = mimeType;
      this.audioChunks = [];
      this.sendRecordingOnStop = false;
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) this.audioChunks.push(event.data);
      });
      recorder.addEventListener('error', () => {
        this.recordingError.set('Não foi possível gravar o áudio. Tente novamente.');
        this.cancelRecording();
      });
      recorder.addEventListener('stop', () => void this.finishRecording(recorder));
      recorder.start();
      this.recordingStartedAt = Date.now();
      this.recordingSeconds.set(0);
      this.isRecording.set(true);
      this.audioPhase.set('recording');
      this.recordingInterval = setInterval(() => {
        this.recordingSeconds.set(Math.min(
          60,
          Math.floor((Date.now() - this.recordingStartedAt) / 1000),
        ));
      }, 250);
      this.recordingTimeout = setTimeout(() => {
        this.recordingSeconds.set(60);
        this.stopRecording(true);
      }, MAX_RECORDING_MS);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      this.resetRecording();
      this.recordingError.set('Não foi possível iniciar a gravação neste navegador.');
    }
  }

  recordingTime(): string {
    return `00:${this.recordingSeconds().toString().padStart(2, '0')}`;
  }

  cancelAudioRecording(): void {
    if (this.isRecording()) this.cancelRecording();
  }

  ngOnDestroy(): void {
    this.cancelRecording();
    this.state.endPageSession();
  }

  private stopRecording(send: boolean): void {
    const recorder = this.recorder;
    this.sendRecordingOnStop = send;
    this.isRecording.set(false);
    this.audioPhase.set(send ? 'stopping' : 'idle');
    this.clearRecordingTimers();
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      this.resetRecording();
    }
    this.stopStream();
  }

  private cancelRecording(): void {
    this.recordingAttempt++;
    this.stopRecording(false);
  }

  private async finishRecording(recorder: MediaRecorder): Promise<void> {
    if (recorder !== this.recorder) return;
    const shouldSend = this.sendRecordingOnStop;
    const chunks = this.audioChunks;
    const mimeType = recorder.mimeType || this.recordingMimeType || chunks[0]?.type || '';
    this.resetRecording();
    if (!shouldSend) return;

    const blob = new Blob(chunks, mimeType ? { type: mimeType } : undefined);
    if (!blob.size) {
      this.recordingError.set('Nenhum áudio foi gravado. Tente novamente.');
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      this.recordingError.set('O áudio excedeu o limite de 5 MB.');
      return;
    }

    const extension = mimeType.includes('mp4')
      ? 'mp4'
      : mimeType.includes('ogg')
        ? 'ogg'
        : 'webm';
    this.audioPhase.set('idle');
    if (this.state.sendAudio(blob, `gravacao.${extension}`, this.context())) {
      setTimeout(() => this.scrollToLatest());
    }
  }

  private resetRecording(): void {
    this.clearRecordingTimers();
    this.stopStream();
    this.recorder = null;
    this.audioChunks = [];
    this.recordingMimeType = '';
    this.sendRecordingOnStop = false;
    this.recordingStartedAt = 0;
    this.recordingSeconds.set(0);
    this.isRecording.set(false);
    if (!this.sendRecordingOnStop) this.audioPhase.set('idle');
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private clearRecordingTimers(): void {
    if (this.recordingInterval) clearInterval(this.recordingInterval);
    if (this.recordingTimeout) clearTimeout(this.recordingTimeout);
    this.recordingInterval = null;
    this.recordingTimeout = null;
  }

  private scrollToLatest(): void {
    const list = this.messageList?.nativeElement;
    if (list) list.scrollTop = list.scrollHeight;
  }
}
