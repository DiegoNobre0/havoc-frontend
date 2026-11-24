import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { FiscalService } from '../../services/fiscal.service';
import { OrderService } from '../../services/order.service';
import { SocketService } from '../../services/socket.service';
import { Order, Orders } from './orders';

describe('Orders', () => {
  let component: Orders;
  let fixture: ComponentFixture<Orders>;
  let fiscalService: {
    getOrderDocument: ReturnType<typeof vi.fn>;
    reconcileOrder: ReturnType<typeof vi.fn>;
    retryOrder: ReturnType<typeof vi.fn>;
    cancelOrder: ReturnType<typeof vi.fn>;
    downloadPdf: ReturnType<typeof vi.fn>;
    downloadXml: ReturnType<typeof vi.fn>;
    downloadCancellationPdf: ReturnType<typeof vi.fn>;
    downloadCancellationXml: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };

  const order: Order = {
    id: 'order-1',
    code: 'HAV-PDV-1',
    channel: 'POS',
    status: 'CONFIRMED',
    subtotal: 100,
    shippingCost: 0,
    discount: 0,
    total: 100,
    createdAt: '2026-11-17T10:00:00.000Z',
    customerName: 'Maria',
    customerPhone: '71999999999',
    items: [],
  };
  const document = {
    id: 'document-1',
    status: 'AUTHORIZED',
    canRetry: false,
    number: 10,
    series: 1,
    pdfAvailable: true,
    xmlAvailable: true,
    cancellationStatus: null,
    cancellationPdfAvailable: false,
    cancellationXmlAvailable: false,
  } as const;

  beforeEach(async () => {
    fiscalService = {
      getOrderDocument: vi.fn(() => of(document)),
      reconcileOrder: vi.fn(() => of({ ...document, lastReconciledAt: '2026-11-17T11:00:00Z' })),
      retryOrder: vi.fn(() => of({ ...document, status: 'PROCESSING', canRetry: false })),
      cancelOrder: vi.fn(() => of({ ...document, cancellationStatus: 'PROCESSING' as const })),
      downloadPdf: vi.fn(() => of(new Blob())),
      downloadXml: vi.fn(() => of(new Blob())),
      downloadCancellationPdf: vi.fn(() => of(new Blob())),
      downloadCancellationXml: vi.fn(() => of(new Blob())),
    };
    dialog = { open: vi.fn() };
    snackBar = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Orders],
      providers: [
        {
          provide: OrderService,
          useValue: {
            listOrders: vi.fn(() => of({ data: [] })),
            getOrderById: vi.fn(() => of(order)),
            updateStatus: vi.fn(() => of({})),
          },
        },
        { provide: FiscalService, useValue: fiscalService },
        { provide: AuthService, useValue: { currentUser: () => ({ role: 'ADMIN' }) } },
        { provide: SocketService, useValue: { onNewOrder: new Subject<void>() } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Orders);
    component = fixture.componentInstance;
  });

  afterEach(() => component.ngOnDestroy());

  it('loads the fiscal document when opening a POS order', () => {
    component.openDetail(order);

    expect(fiscalService.getOrderDocument).toHaveBeenCalledWith('order-1');
    expect(component.fiscalDocument()).toEqual(document);
    expect(component.isDetailOpen()).toBe(true);
  });

  it('treats a fiscal document 404 as an empty state without an error snackbar', () => {
    fiscalService.getOrderDocument.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );

    component.openDetail(order);

    expect(component.fiscalDocument()).toBeNull();
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('reconciles the document and updates its state', () => {
    component.selectedOrder.set(order);
    component.fiscalDocument.set(document);

    component.reconcileFiscal();

    expect(fiscalService.reconcileOrder).toHaveBeenCalledWith('order-1');
    expect(component.fiscalDocument()?.lastReconciledAt).toBe('2026-11-17T11:00:00Z');
  });

  it('only cancels the NFC-e after collecting a justification and dangerous confirmation', () => {
    component.selectedOrder.set(order);
    component.fiscalDocument.set(document);
    dialog.open
      .mockReturnValueOnce({ afterClosed: () => of('Cancelamento solicitado pelo cliente.') })
      .mockReturnValueOnce({ afterClosed: () => of(true) });

    component.requestFiscalCancellation();

    expect(dialog.open).toHaveBeenCalledTimes(2);
    expect(fiscalService.cancelOrder).toHaveBeenCalledWith(
      'order-1',
      'Cancelamento solicitado pelo cliente.',
    );
    expect(component.fiscalDocument()?.cancellationStatus).toBe('PROCESSING');
  });

  it('confirms a retry for a retryable rejection and updates the fiscal document', () => {
    component.selectedOrder.set(order);
    component.fiscalDocument.set({ ...document, status: 'REJECTED', canRetry: true });
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });

    component.requestFiscalRetry();

    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({ confirmText: 'Reemitir NFC-e' }),
      }),
    );
    expect(fiscalService.retryOrder).toHaveBeenCalledWith('order-1', expect.any(String));
    expect(component.fiscalDocument()?.status).toBe('PROCESSING');
  });

  it('does not retry unknown, processing, authorized or cancelled documents', () => {
    component.selectedOrder.set(order);

    for (const status of ['UNKNOWN', 'PROCESSING', 'AUTHORIZED', 'CANCELLED']) {
      component.fiscalDocument.set({ ...document, status, canRetry: true });
      expect(component.canRetryFiscal()).toBe(false);
      component.requestFiscalRetry();
    }

    expect(dialog.open).not.toHaveBeenCalled();
    expect(fiscalService.retryOrder).not.toHaveBeenCalled();
  });
});
