import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CatalogService } from './catalog.service';
import { SaveProductRequest } from '../models/product.models';

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
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
      isActive: true,
      manufacturer: 'Marca',
    };

    let status: string | null | undefined;
    service.createProduct(payload).subscribe((product) => status = product.supplementFacts?.status);

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
});
