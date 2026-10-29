import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../environments/environment';
import { SKIP_AUTH, SKIP_GLOBAL_LOADING } from '../interceptors/http-context.tokens';
import { StorefrontService } from './storefront.service';

describe('StorefrontService payment status', () => {
  let service: StorefrontService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StorefrontService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the checkout token and Mercado Pago payment id for reconciliation', () => {
    service.getCheckoutStatus('order-id', 'checkout-token', '123456').subscribe();

    const request = http.expectOne((candidate) =>
      candidate.url === `${environment.apiUrl}/storefront/checkout/order-id/status`,
    );
    expect(request.request.params.get('token')).toBe('checkout-token');
    expect(request.request.params.get('paymentId')).toBe('123456');
    expect(request.request.context.get(SKIP_AUTH)).toBe(true);
    expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    request.flush({
      orderCode: 'HAV-TEST',
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      providerStatus: 'approved',
      statusDetail: 'accredited',
      paidAt: new Date().toISOString(),
      expiresAt: null,
      order: {
        id: 'order-id',
        code: 'HAV-TEST',
        status: 'CONFIRMED',
        customerName: 'Cliente',
        customerPhone: '5571999999999',
        deliveryMethod: 'PICKUP',
        deliveryAddress: null,
        paymentMethod: 'PIX',
        subtotal: 100,
        shippingCost: 0,
        discount: 0,
        total: 100,
        items: [],
      },
    });
  });
});
