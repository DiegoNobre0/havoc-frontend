import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../environments/environment';
import { SKIP_AUTH, SKIP_GLOBAL_LOADING } from '../interceptors/http-context.tokens';
import { ConsultantApiService } from './consultant-api.service';

describe('ConsultantApiService', () => {
  let service: ConsultantApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ConsultantApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates an anonymous session without auth or global loading', () => {
    service.createSession('client-id').subscribe();

    const request = http.expectOne(`${environment.apiUrl}/storefront/consultant/sessions`);
    expect(request.request.body).toEqual({ clientId: 'client-id' });
    expect(request.request.context.get(SKIP_AUTH)).toBe(true);
    expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    request.flush({ session: {}, messages: [] });
  });

  it('ends the session with its anonymous token', () => {
    service.endSession('session/id', 'secret').subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/storefront/consultant/sessions/session%2Fid`,
    );
    expect(request.request.method).toBe('DELETE');
    expect(request.request.headers.get('X-Consultant-Token')).toBe('secret');
    expect(request.request.context.get(SKIP_AUTH)).toBe(true);
    expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    request.flush(null);
  });

  it('sends the consultant token and product context', () => {
    const context = {
      surface: 'product-detail' as const,
      item: { type: 'product' as const, id: 'product-id', slug: 'whey' },
    };
    service.sendMessage('session-id', 'secret', 'Qual whey?', 'request-id', context).subscribe();

    const request = http.expectOne(
      `${environment.apiUrl}/storefront/consultant/sessions/session-id/messages`,
    );
    expect(request.request.headers.get('X-Consultant-Token')).toBe('secret');
    expect(request.request.body).toEqual({
      content: 'Qual whey?',
      requestId: 'request-id',
      context,
    });
    request.flush({ message: {} });
  });

  it('uploads multipart audio with query context and anonymous request settings', () => {
    const audio = new Blob(['audio'], { type: 'audio/webm' });
    const context = {
      surface: 'kit-detail' as const,
      item: { type: 'kit' as const, id: 'kit-id', slug: 'kit-massa' },
    };

    service.sendAudio(
      'session/id',
      'secret',
      audio,
      'gravacao.webm',
      'request-id',
      context,
    ).subscribe();

    const request = http.expectOne((candidate) =>
      candidate.url === `${environment.apiUrl}/storefront/consultant/sessions/session%2Fid/audio`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-Consultant-Token')).toBe('secret');
    expect(request.request.context.get(SKIP_AUTH)).toBe(true);
    expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    expect(request.request.params.get('requestId')).toBe('request-id');
    expect(request.request.params.get('surface')).toBe('kit-detail');
    expect(request.request.params.get('itemType')).toBe('kit');
    expect(request.request.params.get('itemId')).toBe('kit-id');
    expect(request.request.params.get('itemSlug')).toBe('kit-massa');
    expect(request.request.body).toBeInstanceOf(FormData);
    const formData = request.request.body as FormData;
    expect(formData.get('audio')).toBeInstanceOf(File);
    expect((formData.get('audio') as File).name).toBe('gravacao.webm');
    request.flush({ transcript: 'Quero ganhar massa', message: {} });
  });
});
