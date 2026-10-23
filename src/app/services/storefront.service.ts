import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';
import {
  BestSellersResponse,
  CatalogFilters,
  PaginatedResponse,
  StorefrontCategory,
  StorefrontItem,
  StorefrontItemDetail,
  StorefrontItemType,
} from '../models/storefront.models';
import { SKIP_AUTH, SKIP_GLOBAL_LOADING } from '../interceptors/http-context.tokens';
import { normalizeSupplementFacts } from '../models/supplement-facts.models';

export interface ShippingRegion {
  id: string;
  name: string;
  region: string;
  price: number;
  estimatedDays: number;
}

export type CheckoutDeliveryMethod = 'DELIVERY' | 'PICKUP';
export type CheckoutPaymentMethod = 'PIX' | 'CREDIT_CARD' | 'CASH';
export type CheckoutOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';
export type CheckoutPaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUNDED';

export interface CheckoutAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
}

export type CheckoutDelivery =
  | { method: 'PICKUP' }
  | {
      method: 'DELIVERY';
      shippingRuleId?: string;
      customNeighborhood?: string;
      address: CheckoutAddress;
    };

export interface CreateCheckoutRequest {
  customer: {
    name: string;
    phone: string;
    cpf: string;
    email?: string;
    notes?: string;
  };
  items: {
    type: StorefrontItemType;
    id: string;
    quantity: number;
  }[];
  delivery: CheckoutDelivery;
  paymentMethod: CheckoutPaymentMethod;
}

export interface CheckoutOrderItem {
  id: string;
  type: StorefrontItemType;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CheckoutOrder {
  id: string;
  code: string;
  status: CheckoutOrderStatus;
  customerName: string;
  customerPhone: string;
  deliveryMethod: CheckoutDeliveryMethod;
  deliveryAddress: string | null;
  paymentMethod: CheckoutPaymentMethod;
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  notes?: string | null;
  items: CheckoutOrderItem[];
}

export interface CheckoutPayment {
  id: string;
  method: CheckoutPaymentMethod;
  status: CheckoutPaymentStatus;
  pixCode: string | null;
  qrCodeImage: string | null;
  expiresAt: string | null;
  redirectUrl: string | null;
}

export interface CreateCheckoutResponse {
  order: CheckoutOrder;
  payment: CheckoutPayment | null;
  checkoutToken: string;
}

export interface CheckoutStatusResponse {
  orderCode: string;
  orderStatus: CheckoutOrderStatus;
  paymentStatus: CheckoutPaymentStatus | null;
  providerStatus: string | null;
  statusDetail: string | null;
  paidAt: string | null;
  expiresAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class StorefrontService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/storefront`;
  private readonly publicContext = new HttpContext().set(SKIP_AUTH, true);

  getCatalog(filters: CatalogFilters): Observable<PaginatedResponse<StorefrontItem>> {
    let params = new HttpParams()
      .set('page', filters.page)
      .set('limit', filters.limit);

    if (filters.search) params = params.set('search', filters.search);
    if (filters.categoryId) params = params.set('categoryId', filters.categoryId);
    if (filters.type) params = params.set('type', filters.type);

    return this.http.get<PaginatedResponse<StorefrontItem>>(`${this.baseUrl}/catalog`, {
      params,
      context: this.publicContext,
    });
  }

  getCategories(): Observable<{ data: StorefrontCategory[] }> {
    return this.http.get<{ data: StorefrontCategory[] }>(`${this.baseUrl}/categories`, {
      context: this.publicContext,
    });
  }

  getBestSellers(limit = 8, period: '30d' | '90d' | 'all' = '90d'): Observable<BestSellersResponse> {
    const params = new HttpParams().set('limit', limit).set('period', period);
    return this.http.get<BestSellersResponse>(`${this.baseUrl}/best-sellers`, {
      params,
      context: this.publicContext,
    });
  }

  getItem(type: StorefrontItemType, slug: string): Observable<StorefrontItemDetail> {
    return this.http.get<StorefrontItemDetail>(
      `${this.baseUrl}/catalog/${type}/${encodeURIComponent(slug)}`,
      { context: this.publicContext },
    ).pipe(
      map((item) => item.type === 'product'
        ? { ...item, supplementFacts: normalizeSupplementFacts(item) }
        : item),
    );
  }

  getShippingRegions(): Observable<{ data: ShippingRegion[] }> {
    return this.http.get<{ data: ShippingRegion[] }>(`${this.baseUrl}/shipping/regions`, {
      context: this.publicContext,
    });
  }

  createCheckout(data: CreateCheckoutRequest, idempotencyKey: string): Observable<CreateCheckoutResponse> {
    const headers = new HttpHeaders().set('Idempotency-Key', idempotencyKey);
    return this.http.post<CreateCheckoutResponse>(`${this.baseUrl}/checkout`, data, {
      headers,
      context: this.publicContext,
    });
  }

  getCheckoutStatus(
    orderId: string,
    token: string,
    providerPaymentId?: string,
  ): Observable<CheckoutStatusResponse> {
    const params = new HttpParams().set('token', token);
    const requestParams = providerPaymentId ? params.set('paymentId', providerPaymentId) : params;
    return this.http.get<CheckoutStatusResponse>(
      `${this.baseUrl}/checkout/${encodeURIComponent(orderId)}/status`,
      {
        params: requestParams,
        context: new HttpContext().set(SKIP_AUTH, true).set(SKIP_GLOBAL_LOADING, true),
      },
    );
  }
}
