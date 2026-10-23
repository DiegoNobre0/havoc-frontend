import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';
import {
    CatalogProduct,
    PdfImportResponse,
    ProductFilters,
    ProductPage,
    SaveProductRequest,
} from '../models/product.models';
import { SupplementFacts, normalizeSupplementFacts } from '../models/supplement-facts.models';


@Injectable({
    providedIn: 'root'
})
export class CatalogService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apiUrl}/catalog`;

    // ==========================================
    // CATEGORIAS
    // ==========================================
    getCategories(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/categories`);
    }

    createCategory(data: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/categories`, data);
    }

    updateCategory(id: string, data: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/categories/${id}`, data);
    }

    deleteCategory(id: string): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/categories/${id}`);
    }

    // ==========================================
    // PRODUTOS
    // ==========================================
    getProducts(filters: ProductFilters = {}): Observable<ProductPage> {
  let params = new HttpParams();

  params = params.set('page', filters.page || 1);
  params = params.set('limit', filters.limit || 2000);

  if (filters.search) params = params.set('search', filters.search);
  if (filters.categoryId) params = params.set('categoryId', filters.categoryId);
  if (filters.isActive !== undefined) params = params.set('isActive', String(filters.isActive));

  return this.http.get<ProductPage>(`${this.apiUrl}/products`, { params }).pipe(
      map((response) => ({
          ...response,
          data: response.data.map((product) => ({
              ...product,
              supplementFacts: normalizeSupplementFacts(product),
          })),
      })),
  );
}

    createProduct(data: SaveProductRequest): Observable<CatalogProduct> {
        return this.http.post<CatalogProduct>(`${this.apiUrl}/products`, data);
    }

    updateProduct(id: string, data: SaveProductRequest): Observable<CatalogProduct> {
        return this.http.put<CatalogProduct>(`${this.apiUrl}/products/${id}`, data);
    }

    syncProductLabel(id: string): Observable<SupplementFacts | null> {
        return this.http.post<unknown>(`${this.apiUrl}/products/${id}/sync-label`, {}).pipe(
            map((response) => normalizeSupplementFacts(response)),
        );
    }

    importPdf(file: File): Observable<PdfImportResponse> {
        const formData = new FormData();
        formData.append('file', file);

        // O Fastify multipart requer que seja enviado como FormData
        return this.http.post<PdfImportResponse>(`${this.apiUrl}/products/import-pdf`, formData);
    }

    deleteProduct(id: string): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/products/${id}`);
    }

    // Upload Otimizado para Cloudflare R2
    uploadProductImage(productId: string, file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file); // O nome 'file' deve bater com o request.file() do Fastify

        return this.http.post(`${this.apiUrl}/products/${productId}/image`, formData);
    }

    // (Pausar/Ativar)
    pauseProduct(id: string, isActive: boolean): Observable<any> {
        return this.http.patch<any>(`${this.apiUrl}/products/${id}/status`, { isActive });
    }

    // ==========================================
    // KITS PROMOCIONAIS
    // ==========================================
    getKits(params?: any): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/kits`, { params });
    }

    createKit(data: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/kits`, data);
    }

    updateKit(id: string, data: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/kits/${id}`, data);
    }

    deleteKit(id: string): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/kits/${id}`);
    }

    uploadKitImage(id: string, file: File): Observable<any> {
        const formData = new FormData();
        formData.append('image', file);
        return this.http.post<any>(`${this.apiUrl}/kits/${id}/image`, formData);
    }

    pauseKit(id: string, isActive: boolean) {
        return this.http.patch(`${this.apiUrl}/kits/${id}/status`, { isActive });
    }
}
