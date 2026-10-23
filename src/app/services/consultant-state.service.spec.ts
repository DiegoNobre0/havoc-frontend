import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { ConsultantAudioResponse, ConsultantMessageResponse } from '../models/consultant.models';
import { ConsultantApiService } from './consultant-api.service';
import { ConsultantStateService } from './consultant-state.service';

const session = {
  sessionId: 'session-id',
  sessionToken: 'session-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  clientId: 'client-id',
};

describe('ConsultantStateService', () => {
  const api = {
    createSession: vi.fn(),
    endSession: vi.fn(),
    sendMessage: vi.fn(),
    sendAudio: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.createSession.mockReturnValue(of({ session, messages: [] }));
    api.endSession.mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [{ provide: ConsultantApiService, useValue: api }],
    });
  });

  it('discards legacy persisted credentials instead of restoring them', async () => {
    localStorage.setItem('havoc-storefront-ai-session:v1', JSON.stringify(session));
    const state = TestBed.inject(ConsultantStateService);

    await state.hydrate();

    expect(localStorage.getItem('havoc-storefront-ai-session:v1')).toBeNull();
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it('keeps the session in memory without writing credentials to local storage', async () => {
    api.sendMessage.mockReturnValue(of({
      message: {
        id: 'answer-id',
        role: 'assistant',
        content: 'Resposta',
        createdAt: new Date().toISOString(),
      },
    }));
    const state = TestBed.inject(ConsultantStateService);

    state.sendMessage('Mensagem', { surface: 'catalog' });
    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1));

    expect(localStorage.getItem('havoc-storefront-ai-session:v1')).toBeNull();
  });

  it('inserts immediately and processes queued messages in submission order', async () => {
    const firstResponse = new Subject<ConsultantMessageResponse>();
    const secondResponse = new Subject<ConsultantMessageResponse>();
    api.sendMessage.mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse);
    const state = TestBed.inject(ConsultantStateService);
    const context = { surface: 'catalog' as const };

    expect(state.sendMessage('Primeira', context)).toBe(true);
    expect(state.messages().map((message) => message.content)).toEqual(['Primeira']);
    expect(state.messages()[0].deliveryStatus).toBe('pending');
    expect(state.sendMessage('Segunda', context)).toBe(true);
    expect(state.messages().map((message) => message.content)).toEqual(['Primeira', 'Segunda']);
    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1));

    firstResponse.next({
      message: {
        id: 'first-answer',
        role: 'assistant',
        content: 'Resposta 1',
        createdAt: new Date().toISOString(),
        recommendations: [],
      },
    });
    firstResponse.complete();
    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
    expect(api.sendMessage.mock.calls[0][2]).toBe('Primeira');
    expect(api.sendMessage.mock.calls[1][2]).toBe('Segunda');

    secondResponse.next({
      message: {
        id: 'second-answer',
        role: 'assistant',
        content: 'Resposta 2',
        createdAt: new Date().toISOString(),
      },
    });
    secondResponse.complete();
    await vi.waitFor(() => expect(state.isSending()).toBe(false));
    expect(state.messages().map((message) => message.content)).toEqual([
      'Primeira',
      'Resposta 1',
      'Segunda',
      'Resposta 2',
    ]);
  });

  it('keeps a failed turn and retries the exact request without duplicating it', async () => {
    api.sendMessage.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    const state = TestBed.inject(ConsultantStateService);

    state.sendMessage('Mensagem', { surface: 'catalog' });
    await vi.waitFor(() => expect(state.messages()[0].deliveryStatus).toBe('failed'));
    const requestId = state.messages()[0].requestId!;
    api.sendMessage.mockReturnValueOnce(of({
      message: {
        id: 'answer-id',
        role: 'assistant',
        content: 'Resposta',
        createdAt: new Date().toISOString(),
      },
    }));

    state.retryMessage(requestId);
    await vi.waitFor(() => expect(state.messages()[0].deliveryStatus).toBe('sent'));

    expect(api.sendMessage.mock.calls[0][3]).toBe(requestId);
    expect(api.sendMessage.mock.calls[1][3]).toBe(requestId);
    expect(state.messages().filter((message) => message.role === 'user')).toHaveLength(1);
  });

  it('honors Retry-After and pauses subsequent queued calls', async () => {
    api.sendMessage.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 429,
      headers: new HttpHeaders({ 'Retry-After': '10' }),
    })));
    const state = TestBed.inject(ConsultantStateService);
    const before = Date.now();

    state.sendMessage('Mensagem', { surface: 'catalog' });
    state.sendMessage('Segunda', { surface: 'catalog' });
    await vi.waitFor(() => expect(state.messages()[0].deliveryStatus).toBe('failed'));

    expect(state.retryAt()).toBeGreaterThanOrEqual(before + 10_000);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(state.error()).toBeNull();
  });

  it('shows an audio placeholder immediately and reconciles it to the transcript', async () => {
    const response = new Subject<ConsultantAudioResponse>();
    api.sendAudio.mockReturnValue(response);
    const state = TestBed.inject(ConsultantStateService);
    const audio = new Blob(['audio'], { type: 'audio/webm' });
    const context = { surface: 'catalog' as const };

    expect(state.sendAudio(audio, 'gravacao.webm', context)).toBe(true);
    expect(state.messages()[0]).toMatchObject({
      content: 'Mensagem de áudio · Transcrevendo...',
      inputKind: 'audio',
      deliveryStatus: 'pending',
    });
    await vi.waitFor(() => expect(api.sendAudio).toHaveBeenCalledTimes(1));
    response.next({
      transcript: 'Quero ganhar massa',
      message: {
        id: 'answer-id',
        role: 'assistant',
        content: 'Posso ajudar com isso.',
        createdAt: '2026-10-22T00:00:00.000Z',
        recommendations: [],
      },
    });
    response.complete();
    await vi.waitFor(() => expect(state.messages()[0].deliveryStatus).toBe('sent'));

    expect(api.sendAudio).toHaveBeenCalledWith(
      'session-id',
      'session-token',
      audio,
      'gravacao.webm',
      expect.any(String),
      context,
    );
    expect(state.messages().map((message) => message.content)).toEqual([
      'Quero ganhar massa',
      'Posso ajudar com isso.',
    ]);
  });

  it('clears the page session and creates a fresh token only on the next message', async () => {
    api.sendMessage.mockReturnValue(of({
      message: {
        id: 'answer-id',
        role: 'assistant',
        content: 'Resposta',
        createdAt: new Date().toISOString(),
      },
    }));
    const state = TestBed.inject(ConsultantStateService);

    state.sendMessage('Primeira conversa', { surface: 'catalog' });
    await vi.waitFor(() => expect(api.createSession).toHaveBeenCalledTimes(1));
    await state.newConversation();

    expect(state.messages()).toEqual([]);
    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(api.endSession).toHaveBeenCalledWith('session-id', 'session-token');

    state.sendMessage('Nova conversa', { surface: 'catalog' });
    await vi.waitFor(() => expect(api.createSession).toHaveBeenCalledTimes(2));
  });
});
