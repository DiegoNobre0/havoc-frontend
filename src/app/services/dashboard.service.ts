import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';


// Tipagens baseadas no que o Backend devolve
export interface DashboardSummary {
  ordersToday: number;
  revenueToday: number;
  pendingOrders: number;
}

export interface SalesReportItem {
  date: string;
  revenue: number;
}

export interface RecentOrder {
  id: string;
  code: string;
  customer: string;
  total: number;
  status: 'PENDENTE' | 'PAGO' | 'ENVIADO' | 'CANCELADO';
  itemsCount: number;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable({
  providedIn: 'root' // Disponível globalmente
})
export class DashboardService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/dashboard`; // Ex: http://localhost:3333/dashboard

  getSummary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.apiUrl}/summary`);
  }

  getSalesReport(startDate?: string, endDate?: string): Observable<SalesReportItem[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<SalesReportItem[]>(`${this.apiUrl}/sales-report`, { params });
  }

  getRecentOrders(page: number = 1, limit: number = 5, status?: string): Observable<PaginatedResponse<RecentOrder>> {
    
    // Começamos com a URL base (página e limite)
    let url = `${this.apiUrl}/recent-orders?page=${page}&limit=${limit}`;
    
    // Se o usuário selecionou algum status no filtro, adicionamos na URL!
    if (status) {
      url += `&status=${status}`;
    }

    return this.http.get<PaginatedResponse<RecentOrder>>(url);
  }
}