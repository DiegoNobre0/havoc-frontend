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
  brand?: string | null;
  sizeLabel?: string | null;
  flavor?: string | null;
  imageUrl?: string | null;
  unit?: string | null;
  price: number | string;
  compareAtPrice?: number | string | null;
  cost_price?: number | string | null;
  costPrice?: number | string | null;
  price_wholesale?: number | string | null;
  priceWholesale?: number | string | null;
  stock?: number | null;
  stock_qty?: number | null;
  stock_min?: number | null;
  stockMin?: number | null;
  sku?: string | null;
  barcodes: ProductBarcode[];
  controlsBatch: boolean;
  ncm?: string | null;
  cfop?: string | null;
  cest?: string | null;
  origin?: number | null;
  csosn?: string | null;
  pisCst?: string | null;
  cofinsCst?: string | null;
  taxableUnit?: string | null;
  isActive: boolean;
  categories?: CatalogCategory[];
  manufacturer?: string | null;
  manufacturerDomain?: string | null;
  supplementFacts?: SupplementFacts | null;
}

export interface ProductBarcode {
  id: string;
  code: string;
  type: string;
  isPrimary: boolean;
}

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  lowStock?: boolean;
}

export interface ProductPage {
  data: CatalogProduct[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    lowStockCount?: number;
  };
}

export interface BarcodeLookupNutritionRow {
  nutrient: string;
  amount: string | { value: number; unit: string };
  dailyValuePercent: number | null;
}

export interface BarcodeLookupLabelFacts {
  manufacturer?: string | null;
  servingSize?: string | null;
  servingsPerContainer?: string | null;
  usageInstructions?: string | null;
  ingredients?: string | null;
  allergenStatement?: string | null;
  warnings?: string[] | null;
  nutritionFacts?: BarcodeLookupNutritionRow[] | null;
}

export interface BarcodeLookupResponse {
  code: string;
  found: boolean;
  source: 'OPEN_FOOD_FACTS' | 'WEB_SEARCH_AI' | 'AI_ESTIMATE' | 'NOT_FOUND';
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  manufacturerDomain?: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  message?: string | null;
  product: {
    name?: string | null;
    brand?: string | null;
    sizeLabel?: string | null;
    flavor?: string | null;
    description?: string | null;
    suggestedCategoryName?: string | null;
    imageUrl?: string | null;
  };
  labelFacts: BarcodeLookupLabelFacts;
}

export interface SaveProductRequest {
  name: string;
  slug: string;
  description: string;
  brand?: string | null;
  sizeLabel?: string | null;
  flavor?: string | null;
  price: number;
  compareAtPrice?: number | null;
  cost_price: number;
  price_wholesale: number;
  stock_qty?: number;
  stock_min: number;
  unit: string;
  ncm: string;
  cfop: string;
  cest: string;
  origin: number;
  csosn: string;
  pisCst: string;
  cofinsCst: string;
  taxableUnit: string;
  isActive: boolean;
  imageUrl?: string | null;
  sku?: string;
  barcodes: string[];
  controlsBatch: boolean;
  initialBatchCode?: string;
  initialBatchExpirationDate?: string;
  manufacturer?: string;
  manufacturerDomain?: string;
  labelSourceUrl?: string;
  labelSourceTitle?: string;
  labelFacts?: BarcodeLookupLabelFacts;
  category_ids?: string[];
}

export type StockOperation = 'IN' | 'OUT' | 'ADJUST';

export interface StockMovementRequest {
  operation: StockOperation;
  quantity: number;
  reason?: string;
  batchCode?: string;
  expirationDate?: string;
  unitCost?: number;
}

export interface StockMovement {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'INITIAL';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string | null;
  batch?: Pick<ProductBatch, 'id' | 'code' | 'expirationDate'> | null;
  user?: { id: string; name: string } | null;
  createdAt: string;
}

export interface ProductBatch {
  id: string;
  code: string;
  initialQuantity: number;
  currentQuantity: number;
  expirationDate: string;
  receivedAt: string;
  unitCost?: number | string | null;
}

export interface StockMovementResult {
  productId: string;
  previousStock: number;
  newStock: number;
  movements: StockMovement[];
}

export interface StockMovementPage {
  data: StockMovement[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface StockSummary {
  lowStockCount: number;
  expiredBatchCount: number;
  expiringBatchCount: number;
}

export interface PdfImportResponse {
  resumo: {
    criados: number;
    atualizados: number;
    semClassificacao: number;
    enriquecimentosEnfileirados?: number;
    erros: number;
  };
}
