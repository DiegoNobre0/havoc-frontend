import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../environments/environment';

export interface FiscalCompany {
  id: string | number;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  codigo_municipio: string;
  nome_municipio: string;
  uf: string;
  inscricao_estadual?: string | null;
  crt: number;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cep: string;
  telefone?: string | null;
  ambiente: 1 | 2;
  has_certificate: boolean;
  csc_id?: string | null;
  serie_nfce?: number | null;
  numero_nfce?: number | null;
  serie_nfce_homologacao?: number | null;
  numero_nfce_homologacao?: number | null;
}

export interface FiscalSettings {
  id: string;
  ambiente: 1 | 2;
  empresa: FiscalCompany;
}

export interface SaveFiscalSettingsRequest {
  ambiente: 1 | 2;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  inscricao_estadual?: string;
  crt: number;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cep: string;
  nome_municipio: string;
  codigo_municipio: string;
  uf: string;
  telefone?: string;
  csc_id?: string;
  csc_token?: string;
  serie_nfce: number;
  numero_nfce: number;
  serie_nfce_homologacao: number;
  numero_nfce_homologacao: number;
  certificado?: File;
  certificado_senha?: string;
}

export interface FiscalDocument {
  id: string;
  status: string;
  canRetry: boolean;
  number?: number | string | null;
  series?: number | string | null;
  environment?: 'HOMOLOGACAO' | 'PRODUCAO' | null;
  accessKey?: string | null;
  protocol?: string | null;
  sefazStatus?: string | number | null;
  sefazReason?: string | null;
  pdfAvailable: boolean;
  xmlAvailable: boolean;
  cancellationStatus: 'PROCESSING' | 'CONFIRMED' | 'REJECTED' | 'UNKNOWN' | null;
  cancellationReason?: string | null;
  cancellationProtocol?: string | null;
  cancellationSefazStatus?: string | number | null;
  cancellationSefazReason?: string | null;
  cancelledAt?: string | null;
  lastReconciledAt?: string | null;
  cancellationPdfAvailable: boolean;
  cancellationXmlAvailable: boolean;
}

export interface FiscalIssuanceAttempt {
  id: string;
  sequence: number;
  status: string;
  environment: 'HOMOLOGACAO' | 'PRODUCAO';
  number: number | string | null;
  series: number | string | null;
  accessKey: string | null;
  protocol: string | null;
  sefazStatus: string | number | null;
  sefazReason: string | null;
  errorMessage: string | null;
  pdfAvailable: boolean;
  xmlAvailable: boolean;
  requestedBy?: { id: string; name: string };
  completedAt: string | null;
  createdAt: string;
}

export interface FiscalIssuanceAttemptsResponse {
  data: FiscalIssuanceAttempt[];
}

export interface FiscalDocumentOrder {
  id: string;
  code: string;
  customerName: string;
  customerCpf?: string | null;
  total: number;
  createdAt: string;
  channel?: string | null;
}

export interface FiscalDocumentListItem extends FiscalDocument {
  order: FiscalDocumentOrder;
}

export interface FiscalDocumentFilters {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  environment?: 'HOMOLOGACAO' | 'PRODUCAO';
  startDate?: string;
  endDate?: string;
}

export interface FiscalDocumentListResponse {
  data: FiscalDocumentListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface FiscalSummaryFilters {
  environment?: 'HOMOLOGACAO' | 'PRODUCAO';
  startDate?: string;
  endDate?: string;
}

export interface FiscalSummary {
  totalDocuments: number;
  counts: Record<string, number>;
  authorizedGrossAmount: number;
  cancelledGrossAmount: number;
}

export interface CancelFiscalOrderRequest {
  justification: string;
}

export function createFiscalIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error('A plataforma não oferece geração criptográfica segura.');
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

@Injectable({ providedIn: 'root' })
export class FiscalService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/fiscal`;

  getSettings(): Observable<FiscalSettings | null> {
    return this.http.get<FiscalSettings | null>(`${this.apiUrl}/settings`);
  }

  saveSettings(data: SaveFiscalSettingsRequest): Observable<FiscalSettings> {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, value instanceof File ? value : String(value));
      }
    });
    return this.http.put<FiscalSettings>(`${this.apiUrl}/settings`, formData);
  }

  issueOrder(orderId: string): Observable<FiscalDocument> {
    return this.http.post<FiscalDocument>(`${this.apiUrl}/orders/${orderId}/issue`, {});
  }

  retryOrder(orderId: string, idempotencyKey: string): Observable<FiscalDocument> {
    const headers = new HttpHeaders().set('Idempotency-Key', idempotencyKey);
    return this.http.post<FiscalDocument>(
      `${this.apiUrl}/orders/${orderId}/retry`,
      {},
      { headers },
    );
  }

  getIssuanceAttempts(orderId: string): Observable<FiscalIssuanceAttemptsResponse> {
    return this.http.get<FiscalIssuanceAttemptsResponse>(
      `${this.apiUrl}/orders/${orderId}/attempts`,
    );
  }

  getOrderDocument(orderId: string): Observable<FiscalDocument> {
    return this.http.get<FiscalDocument>(`${this.apiUrl}/orders/${orderId}/document`);
  }

  getDocuments(filters: FiscalDocumentFilters): Observable<FiscalDocumentListResponse> {
    let params = new HttpParams().set('page', filters.page).set('limit', filters.limit);
    params = this.appendParams(params, filters);
    return this.http.get<FiscalDocumentListResponse>(`${this.apiUrl}/documents`, { params });
  }

  getSummary(filters: FiscalSummaryFilters): Observable<FiscalSummary> {
    const params = this.appendParams(new HttpParams(), filters);
    return this.http.get<FiscalSummary>(`${this.apiUrl}/summary`, { params });
  }

  reconcileOrder(orderId: string): Observable<FiscalDocument> {
    return this.http.post<FiscalDocument>(`${this.apiUrl}/orders/${orderId}/reconcile`, {});
  }

  cancelOrder(orderId: string, justification: string): Observable<FiscalDocument> {
    const body: CancelFiscalOrderRequest = { justification };
    return this.http.post<FiscalDocument>(`${this.apiUrl}/orders/${orderId}/cancel`, body);
  }

  downloadPdf(orderId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/orders/${orderId}/document/pdf`, { responseType: 'blob' });
  }

  downloadXml(orderId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/orders/${orderId}/document/xml`, { responseType: 'blob' });
  }

  downloadCancellationPdf(orderId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/orders/${orderId}/document/cancellation/pdf`, {
      responseType: 'blob',
    });
  }

  downloadCancellationXml(orderId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/orders/${orderId}/document/cancellation/xml`, {
      responseType: 'blob',
    });
  }

  private appendParams(
    params: HttpParams,
    values: Omit<FiscalDocumentFilters, 'page' | 'limit'> | FiscalSummaryFilters,
  ): HttpParams {
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return params;
  }
}
