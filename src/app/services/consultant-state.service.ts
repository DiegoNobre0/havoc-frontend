import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ConsultantAudioResponse,
  ConsultantContext,
  ConsultantMessage,
  ConsultantMessageResponse,
  ConsultantSession,
} from '../models/consultant.models';
import { ConsultantApiService } from './consultant-api.service';

const LEGACY_STORAGE_KEY = 'havoc-storefront-ai-session:v1';
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const AUDIO_PLACEHOLDER = 'Mensagem de áudio · Transcrevendo...';

interface QueuedTurn {
  requestId: string;
  inputKind: 'text' | 'audio';
  content?: string;
  audio?: Blob;
  fileName?: string;
  context: ConsultantContext;
  conversation: number;
}

@Injectable({ providedIn: 'root' })
export class ConsultantStateService {
  private readonly api = inject(ConsultantApiService);
  private session: ConsultantSession | null = null;
  private hydrated = false;
  private queue: QueuedTurn[] = [];
  private failedTurns = new Map<string, QueuedTurn>();
  private processingQueue = false;
  private conversation = 0;
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  readonly messages = signal<ConsultantMessage[]>([]);
  readonly isLoading = signal(false);
  readonly isSending = signal(false);
  readonly error = signal<string | null>(null);
  readonly retryAt = signal<number | null>(null);
  readonly activeRequestId = signal<string | null>(null);

  hydrate(): Promise<void> {
    if (this.hydrated) return Promise.resolve();
    this.removeLegacySession();
    this.hydrated = true;
    return Promise.resolve();
  }

  async createSession(): Promise<void> {
    if (this.session) return;
    this.error.set(null);
    const clientId = crypto.randomUUID();
    try {
      const response = await firstValueFrom(this.api.createSession(clientId));
      this.acceptSession(response.session, response.messages);
    } catch (error) {
      this.handleError(error, 'Não foi possível iniciar o consultor. Tente novamente.');
      throw error;
    }
  }

  sendMessage(content: string, context: ConsultantContext): boolean {
    const text = content.trim();
    if (!text || text.length > 500) return false;
    const requestId = crypto.randomUUID();
    this.enqueue({ requestId, inputKind: 'text', content: text, context, conversation: this.conversation });
    return true;
  }

  sendAudio(blob: Blob, fileName: string, context: ConsultantContext): boolean {
    if (!blob.size) {
      return false;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      return false;
    }
    const requestId = crypto.randomUUID();
    this.enqueue({ requestId, inputKind: 'audio', audio: blob, fileName, context, conversation: this.conversation });
    return true;
  }

  retryMessage(requestId: string): void {
    const turn = this.failedTurns.get(requestId);
    if (!turn || turn.conversation !== this.conversation) return;
    this.failedTurns.delete(requestId);
    this.messages.update((messages) => messages.map((message) =>
      message.requestId === requestId
        ? { ...message, deliveryStatus: 'pending', deliveryError: undefined }
        : message
    ));
    this.queue.unshift(turn);
    if (this.retryAt() && this.retryAt()! > Date.now()) {
      this.scheduleCooldown();
      return;
    }
    void this.processQueue();
  }

  async newConversation(): Promise<void> {
    this.endPageSession();
  }

  endPageSession(): void {
    const session = this.session;
    this.conversation++;
    this.queue = [];
    this.failedTurns.clear();
    this.clearCooldown();
    this.clearSession(true);
    this.activeRequestId.set(null);
    this.isSending.set(false);
    this.hydrated = true;
    if (session) {
      this.api.endSession(session.sessionId, session.sessionToken).subscribe({
        error: () => undefined,
      });
    }
  }

  private async prepareSession(): Promise<ConsultantSession> {
    await this.hydrate();
    if (!this.session) {
      const response = await firstValueFrom(this.api.createSession(crypto.randomUUID()));
      this.acceptSession(response.session, response.messages, true);
    }
    return this.session!;
  }

  private acceptSession(
    session: ConsultantSession,
    messages: ConsultantMessage[],
    preserveLocal = false,
  ): void {
    this.session = session;
    this.error.set(null);
    const hydratedMessages = (Array.isArray(messages) ? messages : []).map((message) => ({
      ...message,
      deliveryStatus: 'sent' as const,
    }));
    const localMessages = preserveLocal
      ? this.messages().filter((message) => message.deliveryStatus !== 'sent')
      : [];
    this.messages.set([...hydratedMessages, ...localMessages]);
  }

  private handleError(error: unknown, fallback: string): void {
    if (
      error instanceof HttpErrorResponse &&
      [401, 403, 404, 410].includes(error.status)
    ) {
      this.clearSession(false);
      this.hydrated = true;
      this.error.set('Esta conversa expirou. Envie a mensagem novamente para começar outra.');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 429) {
      const delay = this.retryAfterMilliseconds(error.headers.get('Retry-After'));
      this.retryAt.set(Date.now() + delay);
      this.error.set('Muitas mensagens em sequência. Aguarde um instante e tente novamente.');
      return;
    }
    this.error.set(fallback);
  }

  private retryAfterMilliseconds(value: string | null): number {
    if (!value) return 30_000;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 30_000;
  }

  private enqueue(turn: QueuedTurn): void {
    this.messages.update((messages) => [...messages, {
      id: turn.requestId,
      requestId: turn.requestId,
      role: 'user',
      content: turn.inputKind === 'audio' ? AUDIO_PLACEHOLDER : turn.content!,
      createdAt: new Date().toISOString(),
      deliveryStatus: 'pending',
      inputKind: turn.inputKind,
    }]);
    this.queue.push(turn);
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    const retryAt = this.retryAt();
    if (retryAt && retryAt > Date.now()) {
      this.scheduleCooldown();
      return;
    }

    this.processingQueue = true;
    try {
      while (this.queue.length) {
        const turn = this.queue.shift()!;
        if (turn.conversation !== this.conversation) continue;
        this.isSending.set(true);
        this.activeRequestId.set(turn.requestId);
        try {
          const session = await this.prepareSession();
          if (turn.conversation !== this.conversation) continue;
          const response: ConsultantMessageResponse | ConsultantAudioResponse = turn.inputKind === 'text'
            ? await firstValueFrom(this.api.sendMessage(
              session.sessionId,
              session.sessionToken,
              turn.content!,
              turn.requestId,
              turn.context,
            ))
            : await firstValueFrom(this.api.sendAudio(
              session.sessionId,
              session.sessionToken,
              turn.audio!,
              turn.fileName!,
              turn.requestId,
              turn.context,
            ));
          if (turn.conversation !== this.conversation) continue;
          const transcript = turn.inputKind === 'audio'
            ? (response as ConsultantAudioResponse).transcript
            : turn.content!;
          this.messages.update((messages) => messages.flatMap((message) =>
            message.requestId === turn.requestId
              ? [
                { ...message, content: transcript, deliveryStatus: 'sent' as const, deliveryError: undefined },
                { ...response.message, deliveryStatus: 'sent' as const },
              ]
              : [message]
          ));
          this.failedTurns.delete(turn.requestId);
          turn.audio = undefined;
        } catch (error) {
          if (turn.conversation !== this.conversation) continue;
          const expired = error instanceof HttpErrorResponse && [401, 403, 404, 410].includes(error.status);
          const limited = error instanceof HttpErrorResponse && error.status === 429;
          if (expired) this.clearCredentials();
          if (limited) {
            this.retryAt.set(Date.now() + this.retryAfterMilliseconds(error.headers.get('Retry-After')));
          }
          const deliveryError = limited
            ? 'Muitas mensagens. Aguarde e tente novamente.'
            : expired
              ? 'A conversa expirou. Tente novamente.'
              : turn.inputKind === 'audio'
                ? 'Não foi possível enviar o áudio.'
                : 'Não foi possível enviar a mensagem.';
          this.failedTurns.set(turn.requestId, turn);
          this.messages.update((messages) => messages.map((message) =>
            message.requestId === turn.requestId
              ? { ...message, deliveryStatus: 'failed', deliveryError }
              : message
          ));
          if (limited) {
            this.scheduleCooldown();
            break;
          }
        } finally {
          this.activeRequestId.set(null);
          this.isSending.set(false);
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private scheduleCooldown(): void {
    if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
    const delay = Math.max(0, (this.retryAt() ?? Date.now()) - Date.now());
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      this.retryAt.set(null);
      void this.processQueue();
    }, delay);
  }

  private clearCooldown(): void {
    if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
    this.cooldownTimer = null;
    this.retryAt.set(null);
  }

  private clearCredentials(): void {
    this.session = null;
    this.removeLegacySession();
  }

  private removeLegacySession(): void {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Ignore unavailable browser storage.
    }
  }

  private clearSession(clearMessages: boolean): void {
    this.clearCredentials();
    if (clearMessages) this.messages.set([]);
    this.error.set(null);
    this.retryAt.set(null);
  }
}
