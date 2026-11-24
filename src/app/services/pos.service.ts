import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../environments/environment';

export type PosPaymentMethod = 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD';

export interface PosSessionSummary {
  cashSales?: number | string;
  supplies?: number | string;
  withdrawals?: number | string;
  refunds?: number | string;
  adjustments?: number | string;
}

export interface PosSession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openingBalance: number | string;
  expectedBalance?: number | string;
  countedBalance?: number | string | null;
  difference?: number | string | null;
  openedAt: string;
  closedAt?: string | null;
  notes?: string | null;
  openedBy?: { id: string; name: string } | null;
  closedBy?: { id: string; name: string } | null;
  operator?: { id?: string; name: string } | null;
  operatorName?: string | null;
  summary?: PosSessionSummary;
}

export interface PosSessionsPage {
  data: PosSession[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PosCustomerRequest {
  name?: string;
  cpf?: string;
  phone?: string;
}

export interface PosSaleItemRequest {
  type: 'product' | 'kit';
  id: string;
  quantity: number;
}

export interface PosPaymentRequest {
  method: PosPaymentMethod;
  amount: number;
  amountTendered?: number;
  installments?: number;
  authorizationCode?: string;
}

export interface CreatePosSaleRequest {
  customer?: PosCustomerRequest;
  items: PosSaleItemRequest[];
  discount?: number;
  notes?: string;
  payments: PosPaymentRequest[];
}

export interface PosSaleResponse {
  order: {
    id: string;
    code: string;
    total: number | string;
  };
  session: PosSession | null;
}

@Injectable({ providedIn: 'root' })
export class PosService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/pos`;

  getCurrentSession(): Observable<PosSession | null> {
    return this.http.get<PosSession | null>(`${this.apiUrl}/session/current`);
  }

  getSessions(page = 1, limit = 20): Observable<PosSessionsPage> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get<PosSessionsPage>(`${this.apiUrl}/sessions`, { params });
  }

  openSession(data: { openingBalance: number; notes?: string }): Observable<PosSession> {
    return this.http.post<PosSession>(`${this.apiUrl}/session/open`, data);
  }

  supply(sessionId: string, data: { amount: number; description: string }): Observable<PosSession> {
    return this.http.post<PosSession>(`${this.apiUrl}/session/${sessionId}/supply`, data);
  }

  withdrawal(
    sessionId: string,
    data: { amount: number; description: string },
  ): Observable<PosSession> {
    return this.http.post<PosSession>(`${this.apiUrl}/session/${sessionId}/withdrawal`, data);
  }

  closeSession(
    sessionId: string,
    data: { countedBalance: number; notes?: string },
  ): Observable<PosSession> {
    return this.http.post<PosSession>(`${this.apiUrl}/session/${sessionId}/close`, data);
  }

  createSale(data: CreatePosSaleRequest, idempotencyKey: string): Observable<PosSaleResponse> {
    const headers = new HttpHeaders().set('Idempotency-Key', idempotencyKey);
    return this.http.post<PosSaleResponse>(`${this.apiUrl}/sales`, data, { headers });
  }
}
