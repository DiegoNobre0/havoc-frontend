import { SupplementFacts } from './supplement-facts.models';

export interface CatalogCategory {
  id: string;
  name: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  unit?: string | null;
  price: number | string;
  cost_price?: number | string | null;
  costPrice?: number | string | null;
  price_wholesale?: number | string | null;
  priceWholesale?: number | string | null;
  stock?: number | null;
  stock_qty?: number | null;
  stock_min?: number | null;
  stockMin?: number | null;
  ncm?: string | null;
  cfop?: string | null;
  isActive: boolean;
  categories?: CatalogCategory[];
  manufacturer?: string | null;
  manufacturerDomain?: string | null;
  supplementFacts?: SupplementFacts | null;
}

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  isActive?: boolean;
}

export interface ProductPage {
  data: CatalogProduct[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SaveProductRequest {
  name: string;
  slug: string;
  description: string;
  price: number;
  cost_price: number;
  price_wholesale: number;
  stock_qty: number;
  stock_min: number;
  unit: string;
  ncm: string;
  cfop: string;
  isActive: boolean;
  manufacturer?: string;
  manufacturerDomain?: string;
  category_ids?: string[];
}

export interface PdfImportResponse {
  resumo: {
    criados: number;
    atualizados: number;
    semClassificacao: number;
    erros: number;
  };
}
