import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { FiscalService } from '../../services/fiscal.service';
import { FiscalDocuments, localDateBoundaryIso } from './fiscal-documents';

describe('FiscalDocuments', () => {
  let component: FiscalDocuments;
  let fixture: ComponentFixture<FiscalDocuments>;
  let fiscalService: Record<string, ReturnType<typeof vi.fn>>;
  let dialog: { open: ReturnType<typeof vi.fn> };

  const document = {
    id: 'document-1',
    status: 'AUTHORIZED',
    canRetry: false,
    number: 10,
    series: 1,
    environment: 'PRODUCAO',
    pdfAvailable: true,
    xmlAvailable: true,
    cancellationStatus: null,
    cancellationPdfAvailable: false,
    cancellationXmlAvailable: false,
    order: {
      id: 'order-1',
      code: 'HAV-1',
      customerName: 'Maria',
      customerCpf: '123',
      total: 100,
      createdAt: '2026-11-17T10:00:00Z',
      channel: 'POS',
    },
  } as const;

  beforeEach(async () => {
    fiscalService = {
      getDocuments: vi.fn(() =>
        of({ data: [document], meta: { total: 1, page: 1, limit: 15, totalPages: 1 } }),
      ),
      getSummary: vi.fn(() =>
        of({
          totalDocuments: 4,
          counts: { AUTHORIZED: 2, REJECTED: 1, CANCELLED: 1 },
          authorizedGrossAmount: 200,
          cancelledGrossAmount: 50,
        }),
      ),
      reconcileOrder: vi.fn(() => of(document)),
      retryOrder: vi.fn(() => of({ ...document, status: 'PROCESSING', canRetry: false })),
      cancelOrder: vi.fn(() => of(document)),
      downloadPdf: vi.fn(() => of(new Blob())),
      downloadXml: vi.fn(() => of(new Blob())),
      downloadCancellationPdf: vi.fn(() => of(new Blob())),
      downloadCancellationXml: vi.fn(() => of(new Blob())),
    };
    dialog = { open: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [FiscalDocuments],
      providers: [
        { provide: FiscalService, useValue: fiscalService },
        { provide: AuthService, useValue: { currentUser: () => ({ role: 'ADMIN' }) } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FiscalDocuments);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('loads documents and summary and calculates operational cards', () => {
    expect(component.documents()).toHaveLength(1);
    expect(component.summary().totalDocuments).toBe(4);
    expect(component.authorizedCount()).toBe(2);
    expect(component.attentionCount()).toBe(1);
    expect(component.cancelledCount()).toBe(1);
  });

  it('converts selected dates to local start and end of day before querying', () => {
    component.filters.patchValue({
      startDate: '2026-11-17',
      endDate: '2026-11-18',
      environment: 'HOMOLOGACAO',
    });
    component.applyFilters();
    expect(fiscalService['getDocuments']).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: new Date(2026, 10, 17, 0, 0, 0, 0).toISOString(),
        endDate: new Date(2026, 10, 18, 23, 59, 59, 999).toISOString(),
        environment: 'HOMOLOGACAO',
      }),
    );
    expect(localDateBoundaryIso('2026-11-17', 'start')).toBe(new Date(2026, 10, 17).toISOString());
  });

  it('reconciles and refreshes the operational data', () => {
    component.reconcile(document);
    expect(fiscalService['reconcileOrder']).toHaveBeenCalledWith('order-1');
    expect(fiscalService['getDocuments']).toHaveBeenCalledTimes(2);
  });

  it('uses justification and confirmation before an admin cancellation', () => {
    dialog.open
      .mockReturnValueOnce({ afterClosed: () => of('Cancelamento solicitado pelo cliente.') })
      .mockReturnValueOnce({ afterClosed: () => of(true) });
    component.requestCancellation(document);
    expect(dialog.open).toHaveBeenCalledTimes(2);
    expect(fiscalService['cancelOrder']).toHaveBeenCalledWith(
      'order-1',
      'Cancelamento solicitado pelo cliente.',
    );
  });

  it('only offers retry for retryable rejected documents and confirms before retrying', () => {
    const rejected = { ...document, status: 'REJECTED', canRetry: true };
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });

    expect(component.canRetry(rejected)).toBe(true);
    expect(component.canRetry({ ...rejected, status: 'UNKNOWN' })).toBe(false);
    expect(component.canRetry({ ...rejected, canRetry: false })).toBe(false);

    component.requestRetry(rejected);

    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.stringContaining('dados fiscais atuais dos produtos'),
        }),
      }),
    );
    expect(fiscalService['retryOrder']).toHaveBeenCalledWith('order-1', expect.any(String));
    expect(fiscalService['getDocuments']).toHaveBeenCalledTimes(2);
    expect(fiscalService['getSummary']).toHaveBeenCalledTimes(2);
  });
});
