import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';


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
    getProducts(filters: any): Observable<any> {
        let params = new HttpParams();

        if (filters.page) params = params.set('page', filters.page);
        if (filters.limit) params = params.set('limit', filters.limit);
        if (filters.search) params = params.set('search', filters.search);
        if (filters.categoryId) params = params.set('categoryId', filters.categoryId);

        return this.http.get<any>(`${this.apiUrl}/products`, { params });
    }

    createProduct(data: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/products`, data);
    }

    updateProduct(id: string, data: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/products/${id}`, data);
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