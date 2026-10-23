import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import {
  ConsultantAudioResponse,
  ConsultantContext,
  ConsultantMessageResponse,
  ConsultantSessionResponse,
} from '../models/consultant.models';
import { SKIP_AUTH, SKIP_GLOBAL_LOADING } from '../interceptors/http-context.tokens';

@Injectable({ providedIn: 'root' })
export class ConsultantApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/storefront/consultant/sessions`;
  private readonly context = new HttpContext()
    .set(SKIP_AUTH, true)
    .set(SKIP_GLOBAL_LOADING, true);

  createSession(clientId: string): Observable<ConsultantSessionResponse> {
    return this.http.post<ConsultantSessionResponse>(this.baseUrl, { clientId }, {
      context: this.context,
    });
  }

  endSession(sessionId: string, sessionToken: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(sessionId)}`, {
      headers: this.headers(sessionToken),
      context: this.context,
    });
  }

  sendMessage(
    sessionId: string,
    sessionToken: string,
    content: string,
    requestId: string,
    context: ConsultantContext,
  ): Observable<ConsultantMessageResponse> {
    return this.http.post<ConsultantMessageResponse>(
      `${this.baseUrl}/${encodeURIComponent(sessionId)}/messages`,
      { content, requestId, context },
      { headers: this.headers(sessionToken), context: this.context },
    );
  }

  sendAudio(
    sessionId: string,
    sessionToken: string,
    audio: Blob,
    fileName: string,
    requestId: string,
    consultantContext: ConsultantContext,
  ): Observable<ConsultantAudioResponse> {
    const formData = new FormData();
    formData.append('audio', audio, fileName);

    let params = new HttpParams()
      .set('requestId', requestId)
      .set('surface', consultantContext.surface);
    if (consultantContext.item) {
      params = params
        .set('itemType', consultantContext.item.type)
        .set('itemId', consultantContext.item.id)
        .set('itemSlug', consultantContext.item.slug);
    }

    return this.http.post<ConsultantAudioResponse>(
      `${this.baseUrl}/${encodeURIComponent(sessionId)}/audio`,
      formData,
      {
        headers: this.headers(sessionToken),
        context: this.context,
        params,
      },
    );
  }

  private headers(sessionToken: string): HttpHeaders {
    return new HttpHeaders().set('X-Consultant-Token', sessionToken);
  }
}
