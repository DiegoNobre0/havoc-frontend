import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  ImagePlus,
  Info,
  LucideAngularModule,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-angular';
import { of } from 'rxjs';

import { CatalogProduct } from '../../../models/product.models';
import { CatalogService } from '../../../services/catalog.service';
import { isValidGtin, Products } from './products';

describe('Products', () => {
  let component: Products;
  let fixture: ComponentFixture<Products>;
  let catalogService: {
    createProduct: ReturnType<typeof vi.fn>;
    createStockMovement: ReturnType<typeof vi.fn>;
    getStockSummary: ReturnType<typeof vi.fn>;
    lookupBarcode: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    catalogService = {
      createProduct: vi.fn(() =>
        of({
          id: 'created-product',
          name: 'Produto',
          price: 10,
          isActive: true,
          barcodes: [],
          controlsBatch: false,
        }),
      ),
      createStockMovement: vi.fn(() => of({ id: 'movement-1' })),
      getStockSummary: vi.fn(() =>
        of({ lowStockCount: 2, expiredBatchCount: 1, expiringBatchCount: 3 }),
      ),
      lookupBarcode: vi.fn(() =>
        of({
          code: '7891234567895',
          found: true,
          source: 'OPEN_FOOD_FACTS',
          sourceUrl: 'https://world.openfoodfacts.org/product/7891234567895',
          sourceTitle: 'Whey Test — Open Food Facts',
          manufacturerDomain: 'world.openfoodfacts.org',
          confidence: 'HIGH',
          message: 'Dados encontrados.',
          product: {
            name: 'Whey Isolate 900g',
            brand: 'Havoc Labs',
            sizeLabel: '900g',
            flavor: 'Chocolate',
            description: 'Proteína isolada de rápida absorção.',
            suggestedCategoryName: null,
            imageUrl: null,
          },
          labelFacts: {
            manufacturer: 'Havoc Labs',
            servingSize: '30g',
            servingsPerContainer: '30 doses',
            usageInstructions: 'Misturar 1 scoop em 200ml de água.',
            ingredients: 'Proteína isolada do soro do leite.',
            allergenStatement: null,
            warnings: null,
            nutritionFacts: [
              { nutrient: 'Proteínas', amount: '24 g', dailyValuePercent: null },
            ],
          },
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [
        Products,
        LucideAngularModule.pick({
          AlertTriangle,
          CalendarClock,
          CheckCircle,
          ChevronDown,
          ChevronUp,
          ExternalLink,
          Eye,
          EyeOff,
          FileText,
          FileUp,
          ImagePlus,
          Info,
          Package,
          PackagePlus,
          Pencil,
          Plus,
          RefreshCw,
          Save,
          Search,
          Sparkles,
          Trash2,
          TrendingUp,
          X,
        }),
      ],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            getCategories: () => of([]),
            getProducts: () =>
              of({
                data: [],
                meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
              }),
            getStockSummary: catalogService.getStockSummary,
            createProduct: catalogService.createProduct,
            createStockMovement: catalogService.createStockMovement,
            lookupBarcode: catalogService.lookupBarcode,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Products);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('fills every persisted field when editing a product', () => {
    const product: CatalogProduct = {
      id: 'product-1',
      name: 'Whey Protein',
      description: 'Chocolate',
      unit: 'UN',
      price: 149.9,
      cost_price: 70,
      price_wholesale: 119.9,
      stock_qty: 8,
      stock_min: 3,
      ncm: '2106.90.30',
      cfop: '5102',
      cest: '2803800',
      origin: 0,
      csosn: '102',
      pisCst: '99',
      cofinsCst: '99',
      taxableUnit: 'UN',
      isActive: false,
      categories: [{ id: 'category-1', name: 'Proteínas' }],
      manufacturer: 'Havoc Labs',
      sku: 'WHEY-900',
      barcodes: [{ id: 'barcode-1', code: '7891234567895', type: 'EAN_13', isPrimary: true }],
      controlsBatch: true,
    };

    component.openModal(product);

    expect(component.productForm.getRawValue()).toEqual({
      name: 'Whey Protein',
      brand: '',
      sizeLabel: '',
      flavor: '',
      sku: 'WHEY-900',
      barcode: '7891234567895',
      controlsBatch: true,
      unit: 'UN',
      category_ids: ['category-1'],
      description: 'Chocolate',
      price: 149.9,
      compareAtPrice: 0,
      cost_price: 70,
      price_wholesale: 119.9,
      stock_qty: 8,
      stock_min: 3,
      initialBatchCode: '',
      initialBatchExpirationDate: '',
      ncm: '2106.90.30',
      cfop: '5102',
      cest: '2803800',
      origin: '0',
      csosn: '102',
      pisCst: '99',
      cofinsCst: '99',
      taxableUnit: 'UN',
      manufacturer: 'Havoc Labs',
      isActive: false,
    });
    expect(component.showFiscal()).toBe(true);
  });

  it('fills manufacturer settings from nested label facts', () => {
    const product: CatalogProduct = {
      id: 'product-1',
      name: 'Creatina',
      price: 99.9,
      isActive: true,
      barcodes: [],
      controlsBatch: false,
      supplementFacts: {
        manufacturer: 'Havoc Labs',
        manufacturerDomain: 'havoclabs.example',
        source: { url: null, title: null, retrievedAt: null },
        servingSize: null,
        servingsPerContainer: null,
        usageInstructions: null,
        ingredients: null,
        allergenStatement: null,
        warnings: [],
        nutritionFacts: [],
        status: 'SOURCE_NOT_FOUND',
        exactProductMatch: false,
      },
    };

    component.openModal(product);

    expect(component.productForm.controls.manufacturer.value).toBe('Havoc Labs');
    expect(component.currentFacts()?.manufacturerDomain).toBe('havoclabs.example');
  });

  it('keeps the manufacturer domain read-only and retries only terminal failures', () => {
    component.openModal({
      id: 'product-1',
      name: 'Creatina',
      price: 99.9,
      isActive: true,
      barcodes: [],
      controlsBatch: false,
      supplementFacts: {
        manufacturer: null,
        manufacturerDomain: 'fabricante.example',
        source: { url: null, title: null, retrievedAt: null },
        servingSize: null,
        servingsPerContainer: null,
        usageInstructions: null,
        ingredients: null,
        allergenStatement: null,
        warnings: [],
        nutritionFacts: [],
        status: 'FAILED',
        exactProductMatch: false,
      },
    });

    expect(component.productForm.contains('manufacturerDomain')).toBe(false);
    expect(component.canRetryFacts()).toBe(true);
    component.currentFacts.update((facts) => (facts ? { ...facts, status: 'PROCESSING' } : facts));
    expect(component.canRetryFacts()).toBe(false);
  });

  it('validates GTIN/EAN/UPC checksums', () => {
    expect(isValidGtin('7891234567895')).toBe(true);
    expect(isValidGtin('7891234567894')).toBe(false);
    expect(isValidGtin('ABC123')).toBe(false);
  });

  it('requires and sends the initial batch when creating controlled stock', () => {
    component.openModal();
    component.productForm.patchValue({
      name: 'Produto com lote',
      price: 10,
      sku: 'PROD-01',
      barcode: '7891234567895',
      controlsBatch: true,
      stock_qty: 5,
    });

    expect(component.productForm.controls.initialBatchCode.hasError('required')).toBe(true);
    component.productForm.patchValue({
      initialBatchCode: 'LOTE-01',
      initialBatchExpirationDate: '2027-12-31',
    });
    component.onSubmit();

    expect(catalogService.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'PROD-01',
        barcodes: ['7891234567895'],
        controlsBatch: true,
        stock_qty: 5,
        initialBatchCode: 'LOTE-01',
        initialBatchExpirationDate: '2027-12-31',
      }),
    );
  });

  it('validates and normalizes fiscal product fields in the payload', () => {
    component.openModal();
    component.productForm.patchValue({
      name: 'Produto fiscal',
      price: 10,
      ncm: '2106.90.30',
      cfop: '5102',
      cest: '28.038.00',
      origin: '0',
      csosn: '102',
      pisCst: '99',
      cofinsCst: '99',
      taxableUnit: 'UN',
    });

    expect(component.productForm.valid).toBe(true);
    component.onSubmit();

    expect(catalogService.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        ncm: '21069030',
        cfop: '5102',
        cest: '2803800',
        origin: 0,
        csosn: '102',
        pisCst: '99',
        cofinsCst: '99',
        taxableUnit: 'UN',
      }),
    );
  });

  it('requires batch data for controlled entries and sends the stock movement', () => {
    const product: CatalogProduct = {
      id: 'product-1',
      name: 'Produto controlado',
      price: 10,
      isActive: true,
      barcodes: [],
      controlsBatch: true,
      stock: 4,
    };
    component.openStockModal(product);

    expect(component.stockForm.controls.batchCode.hasError('required')).toBe(true);
    expect(component.availableStockOperations().map((item) => item.value)).not.toContain('ADJUST');
    component.stockForm.patchValue({
      quantity: 3,
      reason: 'Compra',
      batchCode: 'LOTE-02',
      expirationDate: '2027-06-30',
      unitCost: 8.5,
    });
    component.onStockSubmit();

    expect(catalogService.createStockMovement).toHaveBeenCalledWith('product-1', {
      operation: 'IN',
      quantity: 3,
      reason: 'Compra',
      batchCode: 'LOTE-02',
      expirationDate: '2027-06-30',
      unitCost: 8.5,
    });
  });

  it('fills product fields and pending label facts from barcode lookup', () => {
    component.openModal();
    component.productForm.patchValue({ barcode: '7891234567895' });

    component.lookupByBarcode();

    expect(catalogService.lookupBarcode).toHaveBeenCalledWith('7891234567895');
    expect(component.productForm.controls.name.value).toBe('Whey Isolate 900g');
    expect(component.productForm.controls.brand.value).toBe('Havoc Labs');
    expect(component.productForm.controls.sizeLabel.value).toBe('900g');
    expect(component.productForm.controls.flavor.value).toBe('Chocolate');
    expect(component.pendingLabelFacts()?.nutritionFacts?.length).toBe(1);

    component.productForm.patchValue({ price: 159.9 });
    component.onSubmit();

    expect(catalogService.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'Havoc Labs',
        sizeLabel: '900g',
        flavor: 'Chocolate',
        manufacturerDomain: 'world.openfoodfacts.org',
        labelSourceUrl: 'https://world.openfoodfacts.org/product/7891234567895',
      }),
    );
  });
});
