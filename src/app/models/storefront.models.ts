import { SupplementFacts } from './supplement-facts.models';

export type StorefrontItemType = 'product' | 'kit';

export interface StorefrontCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

interface StorefrontItemBase {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  available: boolean;
  categories: StorefrontCategory[];
  createdAt?: string;
}

export interface StorefrontProduct extends StorefrontItemBase {
  type: 'product';
  unit?: string;
  stock?: number;
  sku?: string | null;
  priceWholesale?: number | null;
  manufacturer?: string | null;
  supplementFacts?: SupplementFacts | null;
}

export interface StorefrontKitItem {
  product: {
    id: string;
    name: string;
    slug: string;
    unit: string;
    imageUrl: string | null;
    price: number;
    available: boolean;
  };
  quantity: number;
}

export interface StorefrontKit extends StorefrontItemBase {
  type: 'kit';
  originalPrice?: number;
  discount?: number;
  discountType?: string;
  discountValue?: number;
  items?: StorefrontKitItem[];
}

export type StorefrontItem = StorefrontProduct | StorefrontKit;
export type StorefrontItemDetail = StorefrontProduct | StorefrontKit;

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface CatalogFilters {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  type?: StorefrontItemType;
}

export interface BestSellersResponse {
  data: (StorefrontItem & { soldQuantity: number })[];
  meta: {
    limit: number;
    period: '30d' | '90d' | 'all';
    fallbackApplied: boolean;
  };
}
