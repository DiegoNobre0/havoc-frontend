import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { FiscalService, SaveFiscalSettingsRequest } from './fiscal.service';

describe('FiscalService', () => {
  let service: FiscalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FiscalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends fiscal settings as FormData including the optional certificate', () => {
    const certificate = new File(['certificate'], 'empresa.pfx');
    const data = {
      ambiente: 2,
      cnpj: '12345678000199',
      razao_social: 'Empresa Teste',
      crt: 1,
      logradouro: 'Rua A',
      numero: '10',
      bairro: 'Centro',
      cep: '40000000',
      nome_municipio: 'Salvador',
      codigo_municipio: '2927408',
      uf: 'BA',
      serie_nfce: 1,
      numero_nfce: 1,
      serie_nfce_homologacao: 1,
      numero_nfce_homologacao: 1,
      certificado: certificate,
      certificado_senha: 'segredo',
    } satisfies SaveFiscalSettingsRequest;

    service.saveSettings(data).subscribe();

    const request = http.expectOne((candidate) => candidate.url.endsWith('/fiscal/settings'));
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('cnpj')).toBe('12345678000199');
    expect((request.request.body as FormData).get('certificado')).toBe(certificate);
    request.flush({ id: 'settings-1', ambiente: 2, empresa: {} });
  });

  it('issues, consults, reconciles and cancels fiscal documents', () => {
    service.issueOrder('order-1').subscribe();
    const issue = http.expectOne((request) => request.url.endsWith('/fiscal/orders/order-1/issue'));
    expect(issue.request.method).toBe('POST');
    issue.flush({ id: 'document-1', status: 'AUTHORIZED' });

    service.getOrderDocument('order-1').subscribe();
    const query = http.expectOne((request) =>
      request.url.endsWith('/fiscal/orders/order-1/document'),
    );
    expect(query.request.method).toBe('GET');
    query.flush({ id: 'document-1', status: 'AUTHORIZED' });

    service.reconcileOrder('order-1').subscribe();
    const reconcile = http.expectOne((request) =>
      request.url.endsWith('/fiscal/orders/order-1/reconcile'),
    );
    expect(reconcile.request.method).toBe('POST');
    expect(reconcile.request.body).toEqual({});
    reconcile.flush({ id: 'document-1', status: 'AUTHORIZED' });

    service.cancelOrder('order-1', 'Cancelamento solicitado pelo cliente.').subscribe();
    const cancel = http.expectOne((request) =>
      request.url.endsWith('/fiscal/orders/order-1/cancel'),
    );
    expect(cancel.request.method).toBe('POST');
    expect(cancel.request.body).toEqual({
      justification: 'Cancelamento solicitado pelo cliente.',
    });
    cancel.flush({ id: 'document-1', status: 'AUTHORIZED', cancellationStatus: 'PROCESSING' });
  });

  it('retries an order with an idempotency header and gets its issuance attempts', () => {
    service.retryOrder('order-1', 'retry-key-1').subscribe();
    const retry = http.expectOne((request) => request.url.endsWith('/fiscal/orders/order-1/retry'));
    expect(retry.request.method).toBe('POST');
    expect(retry.request.body).toEqual({});
    expect(retry.request.headers.get('Idempotency-Key')).toBe('retry-key-1');
    retry.flush({ id: 'document-2', status: 'PROCESSING', canRetry: false });

    service.getIssuanceAttempts('order-1').subscribe();
    const attempts = http.expectOne((request) =>
      request.url.endsWith('/fiscal/orders/order-1/attempts'),
    );
    expect(attempts.request.method).toBe('GET');
    attempts.flush({ data: [] });
  });

  it('lists fiscal documents with pagination and optional filters', () => {
    service
      .getDocuments({
        page: 2,
        limit: 20,
        search: 'HAV-100',
        status: 'AUTHORIZED',
        environment: 'HOMOLOGACAO',
        startDate: '2026-11-01T03:00:00.000Z',
        endDate: '2026-12-01T02:59:59.999Z',
      })
      .subscribe();

    const request = http.expectOne((candidate) => candidate.url.endsWith('/fiscal/documents'));
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('20');
    expect(request.request.params.get('search')).toBe('HAV-100');
    expect(request.request.params.get('status')).toBe('AUTHORIZED');
    expect(request.request.params.get('environment')).toBe('HOMOLOGACAO');
    expect(request.request.params.get('startDate')).toBe('2026-11-01T03:00:00.000Z');
    expect(request.request.params.get('endDate')).toBe('2026-12-01T02:59:59.999Z');
    request.flush({ data: [], meta: { total: 0, page: 2, limit: 20, totalPages: 0 } });
  });

  it('gets the fiscal summary without sending empty filters', () => {
    service.getSummary({ environment: 'PRODUCAO', startDate: '', endDate: undefined }).subscribe();

    const request = http.expectOne((candidate) => candidate.url.endsWith('/fiscal/summary'));
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual(['environment']);
    expect(request.request.params.get('environment')).toBe('PRODUCAO');
    request.flush({
      totalDocuments: 3,
      counts: { AUTHORIZED: 2, CANCELLED: 1 },
      authorizedGrossAmount: 200,
      cancelledGrossAmount: 50,
    });
  });

  it('downloads NFC-e and cancellation event files as blobs', () => {
    service.downloadPdf('order-1').subscribe();
    const pdf = http.expectOne((request) =>
      request.url.endsWith('/fiscal/orders/order-1/document/pdf'),
    );
    expect(pdf.request.responseType).toBe('blob');
    pdf.flush(new Blob(['pdf']));

    service.downloadXml('order-1').subscribe();
    const xml = http.expectOne((request) =>
      request.url.endsWith('/fiscal/orders/order-1/document/xml'),
    );
    expect(xml.request.responseType).toBe('blob');
    xml.flush(new Blob(['xml']));

    service.downloadCancellationPdf('order-1').subscribe();
    const cancellationPdf = http.expectOne((request) =>
      request.url.endsWith('/fiscal/orders/order-1/document/cancellation/pdf'),
    );
    expect(cancellationPdf.request.responseType).toBe('blob');
    cancellationPdf.flush(new Blob(['pdf']));

    service.downloadCancellationXml('order-1').subscribe();
    const cancellationXml = http.expectOne((request) =>
      request.url.endsWith('/fiscal/orders/order-1/document/cancellation/xml'),
    );
    expect(cancellationXml.request.responseType).toBe('blob');
    cancellationXml.flush(new Blob(['xml']));
  });
});
