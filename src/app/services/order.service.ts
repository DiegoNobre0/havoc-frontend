import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { Order, OrderStatus } from '../pages/orders/orders';




@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private readonly http = inject(HttpClient);
 
  private readonly baseUrl = `${environment.apiUrl}/orders`; 

  /**
   * 1. Lista os pedidos com paginação e filtros (Usado no Kanban)
   */
  listOrders(page: number = 1, limit: number = 100, search?: string, status?: OrderStatus): Observable<any> {
    let params = new HttpParams()
      .set('page', page)
      .set('limit', limit);

    if (search) {
      params = params.set('search', search);
    }

    if (status) {
      params = params.set('status', status);
    }

    return this.http.get<any>(this.baseUrl, { params });
  }

  /**
   * 2. Busca os detalhes completos de um pedido específico
   */
  getOrderById(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/${id}`);
  }

  /**
   * 3. Atualiza o status do pedido (Gera histórico automaticamente no Backend)
   */
  updateStatus(id: string, status: OrderStatus, note?: string): Observable<any> {
    const payload: any = { status };
    
    // Só envia a nota se ela existir, para o backend não receber `undefined`
    if (note) {
      payload.note = note;
    }

    return this.http.patch<any>(`${this.baseUrl}/${id}/status`, payload);
  }
}