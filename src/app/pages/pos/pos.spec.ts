import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { CatalogProduct } from '../../models/product.models';
import { AuthService } from '../../services/auth.service';
import { CatalogService } from '../../services/catalog.service';
import { PosService } from '../../services/pos.service';
import { FiscalService } from '../../services/fiscal.service';
import { Pos } from './pos';

describe('Pos', () => {
  let component: Pos;
  let fixture: ComponentFixture<Pos>;
  let catalogService: {
    resolveProduct: ReturnType<typeof vi.fn>;
    getProducts: ReturnType<typeof vi.fn>;
    getKits: ReturnType<typeof vi.fn>;
  };
  let posService: {
    getCurrentSession: ReturnType<typeof vi.fn>;
    createSale: ReturnType<typeof vi.fn>;
  };
  let fiscalService: {
    issueOrder: ReturnType<typeof vi.fn>;
    downloadPdf: ReturnType<typeof vi.fn>;
    downloadXml: ReturnType<typeof vi.fn>;
    reconcileOrder: ReturnType<typeof vi.fn>;
    retryOrder: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };

  const product: CatalogProduct = {
    id: 'product-1',
    name: 'Creatina 300g',
    price: 50,
    stock: 3,
    sku: 'CRE-300',
    barcodes: [],
    controlsBatch: false,
    isActive: true,
  };

  beforeEach(async () => {
    catalogService = {
      resolveProduct: vi.fn(() => of(product)),
      getProducts: vi.fn(() =>
        of({ data: [], meta: { total: 0, page: 1, limit: 12, totalPages: 0 } }),
      ),
      getKits: vi.fn(() => of({ data: [] })),
    };
    posService = {
      getCurrentSession: vi.fn(() => of(null)),
      createSale: vi.fn(() =>
        of({ order: { id: 'sale-1', code: 'HAV-PDV-123', total: 50 }, session: null }),
      ),
    };
    fiscalService = {
      issueOrder: vi.fn(() =>
        of({
          id: 'document-1',
          status: 'AUTHORIZED',
          canRetry: false,
          pdfAvailable: true,
          xmlAvailable: true,
        }),
      ),
      downloadPdf: vi.fn(() => of(new Blob(['pdf']))),
      downloadXml: vi.fn(() => of(new Blob(['xml']))),
      reconcileOrder: vi.fn(() =>
        of({
          id: 'document-1',
          status: 'CANCELLED',
          canRetry: false,
          pdfAvailable: true,
          xmlAvailable: true,
          cancellationStatus: 'CONFIRMED',
          cancellationPdfAvailable: true,
          cancellationXmlAvailable: true,
        }),
      ),
      retryOrder: vi.fn(() =>
        of({
          id: 'document-2',
          status: 'PROCESSING',
          canRetry: false,
          pdfAvailable: false,
          xmlAvailable: false,
          cancellationStatus: null,
          cancellationPdfAvailable: false,
          cancellationXmlAvailable: false,
        }),
      ),
    };
    dialog = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Pos],
      providers: [
        { provide: CatalogService, useValue: catalogService },
        {
          provide: PosService,
          useValue: {
            ...posService,
            openSession: vi.fn(),
            supply: vi.fn(),
            withdrawal: vi.fn(),
            closeSession: vi.fn(),
          },
        },
        { provide: FiscalService, useValue: fiscalService },
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ id: 'user-1', name: 'Operador', role: 'OPERADOR' }) },
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: dialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Pos);
    component = fixture.componentInstance;
    component.ngOnInit();
    component.session.set({
      id: 'session-1',
      status: 'OPEN',
      openingBalance: 100,
      expectedBalance: 100,
      openedAt: '2026-11-17T10:00:00.000Z',
    });
  });

  it('resolves a scanner code and increments the cart item', () => {
    component.scannerForm.setValue({ code: '7890000000001' });
    component.submitScanner();
    component.scannerForm.setValue({ code: '7890000000001' });
    component.submitScanner();

    expect(catalogService.resolveProduct).toHaveBeenCalledTimes(2);
    expect(component.cart()).toEqual([
      expect.objectContaining({ id: 'product-1', type: 'product', quantity: 2 }),
    ]);
    expect(component.scannerForm.controls.code.value).toBe('');
  });

  it('calculates subtotal, discount, total and cash change', () => {
    component.addProduct(product);
    component.changeQuantity(component.cart()[0], 1);
    component.saleForm.controls.discount.setValue(10);
    component.openModal('payment');
    component.payments.at(0).controls.amount.setValue(90);
    component.payments.at(0).controls.amountTendered.setValue(100);

    expect(component.subtotal()).toBe(100);
    expect(component.total()).toBe(90);
    expect(component.paymentTotal()).toBe(90);
    expect(component.changeDue()).toBe(10);
    expect(component.paymentIsValid()).toBe(true);
  });

  it('validates split payments and builds the API payload', () => {
    component.addProduct(product);
    component.customerForm.setValue({ name: 'Maria', cpf: '12345678900', phone: '71999999999' });
    component.openModal('payment');
    component.payments.at(0).patchValue({ method: 'CASH', amount: 20, amountTendered: 30 });
    component.addPayment();
    component.payments.at(1).patchValue({ method: 'CREDIT_CARD', amount: 30, installments: 3 });

    expect(component.paymentRemaining()).toBe(0);
    expect(component.paymentIsValid()).toBe(true);
    expect(component.buildSalePayload()).toEqual({
      customer: { name: 'Maria', cpf: '12345678900', phone: '71999999999' },
      items: [{ type: 'product', id: 'product-1', quantity: 1 }],
      payments: [
        { method: 'CASH', amount: 20, amountTendered: 30 },
        { method: 'CREDIT_CARD', amount: 30, installments: 3 },
      ],
    });
  });

  it('rejects more than one cash payment in a split sale', () => {
    component.addProduct(product);
    component.openModal('payment');
    component.payments.at(0).patchValue({ method: 'CASH', amount: 20, amountTendered: 20 });
    component.addPayment();
    component.payments.at(1).patchValue({ method: 'CASH', amount: 30, amountTendered: 30 });

    expect(component.paymentRemaining()).toBe(0);
    expect(component.paymentIsValid()).toBe(false);
  });

  it('preserves the idempotency key when retrying an unchanged sale', () => {
    posService.createSale.mockReturnValue(throwError(() => ({ error: { message: 'Falha' } })));
    component.addProduct(product);
    component.openModal('payment');

    component.submitSale();
    component.submitSale();

    const firstKey = posService.createSale.mock.calls[0][1];
    const secondKey = posService.createSale.mock.calls[1][1];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });

  it('preserves the order id and issues and downloads the NFC-e on demand', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    component.addProduct(product);
    component.openModal('payment');

    component.submitSale();

    expect(component.lastSale()).toEqual(expect.objectContaining({ id: 'sale-1' }));
    component.issueNfce();
    expect(fiscalService.issueOrder).toHaveBeenCalledWith('sale-1');
    expect(component.fiscalDocument()?.status).toBe('AUTHORIZED');

    component.downloadFiscal('pdf');
    component.downloadFiscal('xml');
    expect(fiscalService.downloadPdf).toHaveBeenCalledWith('sale-1');
    expect(fiscalService.downloadXml).toHaveBeenCalledWith('sale-1');
  });

  it('reconciles the last NFC-e and recognizes the cancelled status', () => {
    component.lastSale.set({ id: 'sale-1', code: 'HAV-PDV-123', total: 50 });
    component.fiscalDocument.set({
      id: 'document-1',
      status: 'AUTHORIZED',
      canRetry: false,
      pdfAvailable: true,
      xmlAvailable: true,
      cancellationStatus: 'UNKNOWN',
      cancellationPdfAvailable: false,
      cancellationXmlAvailable: false,
    });

    expect(component.canReconcileFiscal(component.fiscalDocument())).toBe(true);
    component.reconcileFiscal();

    expect(fiscalService.reconcileOrder).toHaveBeenCalledWith('sale-1');
    expect(component.isFiscalCancelled(component.fiscalDocument())).toBe(true);
  });

  it('confirms and uses retry instead of issue for a rejected NFC-e', () => {
    component.lastSale.set({ id: 'sale-1', code: 'HAV-PDV-123', total: 50 });
    component.fiscalDocument.set({
      id: 'document-1',
      status: 'REJECTED',
      canRetry: true,
      pdfAvailable: false,
      xmlAvailable: false,
      cancellationStatus: null,
      cancellationPdfAvailable: false,
      cancellationXmlAvailable: false,
    });
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });

    component.requestFiscalRetry();

    expect(fiscalService.retryOrder).toHaveBeenCalledWith('sale-1', expect.any(String));
    expect(fiscalService.issueOrder).not.toHaveBeenCalled();
    expect(component.fiscalDocument()?.status).toBe('PROCESSING');
  });

  it('keeps the processing document when initial issuance fails ambiguously', () => {
    fiscalService.issueOrder.mockReturnValue(throwError(() => ({ status: 0 })));
    component.lastSale.set({ id: 'sale-1', code: 'HAV-PDV-123', total: 50 });

    component.issueNfce();

    expect(component.fiscalDocument()?.status).toBe('PROCESSING');
    expect(component.canReconcileFiscal(component.fiscalDocument())).toBe(true);
  });

  it('never retries unknown, processing, authorized or cancelled documents', () => {
    component.lastSale.set({ id: 'sale-1', code: 'HAV-PDV-123', total: 50 });

    for (const status of ['UNKNOWN', 'PROCESSING', 'AUTHORIZED', 'CANCELLED']) {
      component.fiscalDocument.set({
        id: 'document-1',
        status,
        canRetry: true,
        pdfAvailable: false,
        xmlAvailable: false,
        cancellationStatus: null,
        cancellationPdfAvailable: false,
        cancellationXmlAvailable: false,
      });
      component.requestFiscalRetry();
    }

    expect(dialog.open).not.toHaveBeenCalled();
    expect(fiscalService.retryOrder).not.toHaveBeenCalled();
  });
});
