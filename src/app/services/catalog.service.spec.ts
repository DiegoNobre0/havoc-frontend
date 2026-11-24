import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CatalogService } from './catalog.service';
import { SaveProductRequest } from '../models/product.models';

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('normalizes the automatic label state returned after product creation', () => {
    const payload: SaveProductRequest = {
      name: 'Creatina 300g',
      slug: 'creatina-300g',
      description: '',
      price: 99.9,
      cost_price: 0,
      price_wholesale: 0,
      stock_qty: 2,
      stock_min: 0,
      unit: 'UN',
      ncm: '',
      cfop: '',
      cest: '',
      origin: 0,
      csosn: '102',
      pisCst: '99',
      cofinsCst: '99',
      taxableUnit: 'UN',
      isActive: true,
      manufacturer: 'Marca',
      sku: 'CREATINA-300',
      barcodes: ['7891234567895'],
      controlsBatch: false,
    };

    let status: string | null | undefined;
    service
      .createProduct(payload)
      .subscribe((product) => (status = product.supplementFacts?.status));

    const request = http.expectOne((candidate) => candidate.url.endsWith('/catalog/products'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    expect('manufacturerDomain' in request.request.body).toBe(false);
    request.flush({
      id: 'product-1',
      name: payload.name,
      price: payload.price,
      isActive: true,
      labelFacts: {
        manufacturer: 'Marca',
        manufacturerDomain: null,
        status: 'PENDING',
        exactProductMatch: false,
      },
    });

    expect(status).toBe('PENDING');
  });

  it('sends the low-stock filter and integrates stock endpoints', () => {
    service.getProducts({ lowStock: true }).subscribe();
    const productsRequest = http.expectOne((candidate) =>
      candidate.url.endsWith('/catalog/products'),
    );
    expect(productsRequest.request.params.get('lowStock')).toBe('true');
    productsRequest.flush({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1, lowStockCount: 4 },
    });

    service.createStockMovement('product-1', { operation: 'ADJUST', quantity: 7 }).subscribe();
    const movementRequest = http.expectOne((candidate) =>
      candidate.url.endsWith('/products/product-1/stock-movements'),
    );
    expect(movementRequest.request.method).toBe('POST');
    expect(movementRequest.request.body).toEqual({ operation: 'ADJUST', quantity: 7 });
    movementRequest.flush({ id: 'movement-1', operation: 'ADJUST', quantity: 7 });

    service.getStockSummary().subscribe();
    const summaryRequest = http.expectOne((candidate) =>
      candidate.url.endsWith('/catalog/stock/summary'),
    );
    expect(summaryRequest.request.method).toBe('GET');
    summaryRequest.flush({ lowStockCount: 4, expiredBatchCount: 1, expiringBatchCount: 2 });
  });
});
