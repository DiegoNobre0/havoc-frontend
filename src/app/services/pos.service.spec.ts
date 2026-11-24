import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PosService } from './pos.service';

describe('PosService', () => {
  let service: PosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the /pos session endpoints', () => {
    service.getCurrentSession().subscribe();
    const current = http.expectOne((request) => request.url.endsWith('/pos/session/current'));
    expect(current.request.method).toBe('GET');
    current.flush(null);

    service.openSession({ openingBalance: 100, notes: 'Turno da manhã' }).subscribe();
    const open = http.expectOne((request) => request.url.endsWith('/pos/session/open'));
    expect(open.request.method).toBe('POST');
    expect(open.request.body).toEqual({ openingBalance: 100, notes: 'Turno da manhã' });
    open.flush({ id: 'session-1' });
  });

  it('sends the idempotency key when creating a sale', () => {
    const payload = {
      items: [{ type: 'product' as const, id: 'product-1', quantity: 2 }],
      payments: [{ method: 'PIX' as const, amount: 20 }],
    };

    service.createSale(payload, 'sale-key-1').subscribe();

    const request = http.expectOne((candidate) => candidate.url.endsWith('/pos/sales'));
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('sale-key-1');
    expect(request.request.body).toEqual(payload);
    request.flush({
      order: { id: 'sale-1', code: 'HAV-PDV-42', total: 20 },
      session: null,
    });
  });
});
