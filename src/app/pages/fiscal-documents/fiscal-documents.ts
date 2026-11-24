import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog';
import { FiscalAttemptsDialogComponent } from '../../components/fiscal-attempts-dialog/fiscal-attempts-dialog';
import { FiscalCancelDialogComponent } from '../../components/fiscal-cancel-dialog/fiscal-cancel-dialog';
import { AuthService } from '../../services/auth.service';
import {
  createFiscalIdempotencyKey,
  FiscalDocumentFilters,
  FiscalDocumentListItem,
  FiscalService,
  FiscalSummary,
} from '../../services/fiscal.service';

export type FiscalDownloadKind = 'pdf' | 'xml' | 'cancellation-pdf' | 'cancellation-xml';

export function localDateBoundaryIso(value: string, boundary: 'start' | 'end'): string | undefined {
  if (!value) return undefined;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return undefined;
  const [year, month, day] = parts;
  const date = new Date(
    year,
    month - 1,
    day,
    boundary === 'start' ? 0 : 23,
    boundary === 'start' ? 0 : 59,
    boundary === 'start' ? 0 : 59,
    boundary === 'start' ? 0 : 999,
  );
  return date.toISOString();
}

const EMPTY_SUMMARY: FiscalSummary = {
  totalDocuments: 0,
  counts: {},
  authorizedGrossAmount: 0,
  cancelledGrossAmount: 0,
};

@Component({
  selector: 'app-fiscal-documents',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './fiscal-documents.html',
  styleUrl: './fiscal-documents.scss',
})
export class FiscalDocuments implements OnInit {
  private readonly fiscalService = inject(FiscalService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly documents = signal<FiscalDocumentListItem[]>([]);
  readonly summary = signal<FiscalSummary>(EMPTY_SUMMARY);
  readonly isLoading = signal(true);
  readonly isSummaryLoading = signal(true);
  readonly activeOrderId = signal<string | null>(null);
  readonly downloading = signal<{ orderId: string; kind: FiscalDownloadKind } | null>(null);
  readonly currentPage = signal(1);
  readonly totalPages = signal(1);
  readonly totalItems = signal(0);
  readonly pageSize = 15;

  readonly filters = this.fb.group({
    search: [''],
    status: [''],
    environment: [''],
    startDate: [''],
    endDate: [''],
  });

  readonly isAdmin = computed(() => this.authService.currentUser()?.role === 'ADMIN');
  readonly authorizedCount = computed(() => this.countFor('AUTHORIZED', 'AUTORIZADO'));
  readonly cancelledCount = computed(() =>
    this.countFor('CANCELLED', 'CANCELED', 'CANCELADA', 'CANCELADO'),
  );
  readonly attentionCount = computed(() => {
    const ignored = new Set([
      'AUTHORIZED',
      'AUTORIZADO',
      'CANCELLED',
      'CANCELED',
      'CANCELADA',
      'CANCELADO',
    ]);
    return Object.entries(this.summary().counts).reduce(
      (total, [status, count]) => total + (ignored.has(status.toUpperCase()) ? 0 : Number(count)),
      0,
    );
  });

  ngOnInit(): void {
    this.filters.controls.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters(false));
    this.refresh();
  }

  applyFilters(refreshSummary = true): void {
    this.currentPage.set(1);
    this.loadDocuments();
    if (refreshSummary) this.loadSummary();
  }

  clearFilters(): void {
    this.filters.reset(
      { search: '', status: '', environment: '', startDate: '', endDate: '' },
      { emitEvent: false },
    );
    this.currentPage.set(1);
    this.refresh();
  }

  refresh(): void {
    this.loadDocuments();
    this.loadSummary();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.currentPage.set(page);
    this.loadDocuments();
  }

  openOrder(document: FiscalDocumentListItem): void {
    void this.router.navigate(['/orders'], { queryParams: { orderId: document.order.id } });
  }

  reconcile(document: FiscalDocumentListItem): void {
    if (this.activeOrderId()) return;
    this.activeOrderId.set(document.order.id);
    this.fiscalService.reconcileOrder(document.order.id).subscribe({
      next: () => {
        this.activeOrderId.set(null);
        this.showSuccess('Situação fiscal atualizada pela SEFAZ.');
        this.refresh();
      },
      error: (error) => {
        this.activeOrderId.set(null);
        this.showError(error?.error?.message || 'Não foi possível consultar a SEFAZ.');
      },
    });
  }

  requestRetry(document: FiscalDocumentListItem): void {
    if (!this.canRetry(document) || this.activeOrderId()) return;
    this.dialog
      .open(ConfirmDialogComponent, {
        width: 'min(500px, calc(100vw - 32px))',
        data: {
          title: 'Confirmar reemissão da NFC-e',
          message:
            'A nova tentativa usará os dados fiscais atuais dos produtos, mantendo a identidade e o ambiente da emissão original. A tentativa rejeitada continuará preservada no histórico.',
          confirmText: 'Reemitir NFC-e',
          cancelText: 'Voltar',
          isDanger: false,
        },
      })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (confirmed) this.retry(document);
      });
  }

  openHistory(document: FiscalDocumentListItem): void {
    this.dialog.open(FiscalAttemptsDialogComponent, {
      width: 'min(760px, calc(100vw - 24px))',
      maxWidth: '100vw',
      data: { orderId: document.order.id, orderCode: document.order.code },
    });
  }

  canRetry(document: FiscalDocumentListItem): boolean {
    return document.canRetry && document.status.toUpperCase() === 'REJECTED';
  }

  requestCancellation(document: FiscalDocumentListItem): void {
    if (!this.canCancel(document) || this.activeOrderId()) return;
    this.dialog
      .open(FiscalCancelDialogComponent, { width: 'min(560px, calc(100vw - 32px))' })
      .afterClosed()
      .subscribe((justification?: string) => {
        if (!justification) return;
        this.dialog
          .open(ConfirmDialogComponent, {
            width: 'min(460px, calc(100vw - 32px))',
            data: {
              title: 'Confirmar cancelamento fiscal',
              message: `A NFC-e do pedido ${document.order.code} será enviada para cancelamento na SEFAZ.`,
              confirmText: 'Cancelar NFC-e',
              cancelText: 'Voltar',
              isDanger: true,
            },
          })
          .afterClosed()
          .subscribe((confirmed: boolean) => {
            if (confirmed) this.cancel(document, justification);
          });
      });
  }

  canCancel(document: FiscalDocumentListItem): boolean {
    const status = document.status.toUpperCase();
    return (
      this.isAdmin() &&
      (status === 'AUTHORIZED' || status === 'AUTORIZADO') &&
      document.cancellationStatus !== 'PROCESSING' &&
      document.cancellationStatus !== 'CONFIRMED'
    );
  }

  download(document: FiscalDocumentListItem, kind: FiscalDownloadKind): void {
    if (this.downloading()) return;
    this.downloading.set({ orderId: document.order.id, kind });
    const requests = {
      pdf: () => this.fiscalService.downloadPdf(document.order.id),
      xml: () => this.fiscalService.downloadXml(document.order.id),
      'cancellation-pdf': () => this.fiscalService.downloadCancellationPdf(document.order.id),
      'cancellation-xml': () => this.fiscalService.downloadCancellationXml(document.order.id),
    };
    requests[kind]().subscribe({
      next: (blob) => {
        const isEvent = kind.startsWith('cancellation');
        const extension = kind.endsWith('pdf') ? 'pdf' : 'xml';
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download = `${isEvent ? 'cancelamento-nfce' : 'nfce'}-${document.order.code}.${extension}`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.downloading.set(null);
      },
      error: (error) => {
        this.downloading.set(null);
        this.showError(error?.error?.message || 'Não foi possível baixar o arquivo fiscal.');
      },
    });
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      AUTHORIZED: 'Autorizada',
      AUTORIZADO: 'Autorizada',
      PROCESSING: 'Processando',
      PENDING: 'Pendente',
      REJECTED: 'Rejeitada',
      CANCELLED: 'Cancelada',
      CANCELED: 'Cancelada',
      UNKNOWN: 'Atenção',
      ERROR: 'Erro',
    };
    return labels[status.toUpperCase()] ?? status;
  }

  statusTone(status: string): string {
    const value = status.toUpperCase();
    if (['AUTHORIZED', 'AUTORIZADO'].includes(value)) return 'success';
    if (['CANCELLED', 'CANCELED', 'CANCELADA', 'CANCELADO'].includes(value)) return 'muted';
    if (['REJECTED', 'ERROR'].includes(value)) return 'danger';
    return 'warning';
  }

  environmentLabel(environment?: string | null): string {
    return environment === 'PRODUCAO' ? 'Produção' : 'Homologação';
  }

  isProductionEnvironment(environment?: string | null): boolean {
    return environment === 'PRODUCAO';
  }

  formatDate(value?: string | null): string {
    if (!value) return 'Não informado';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(value),
    );
  }

  formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(value),
    );
  }

  private loadDocuments(): void {
    const filters = this.buildFilters();
    if (!filters) return;
    this.isLoading.set(true);
    this.fiscalService.getDocuments(filters).subscribe({
      next: (response) => {
        this.documents.set(response.data);
        this.totalItems.set(response.meta.total);
        this.totalPages.set(Math.max(1, response.meta.totalPages));
        this.isLoading.set(false);
      },
      error: (error) => {
        this.isLoading.set(false);
        this.showError(error?.error?.message || 'Não foi possível carregar os documentos fiscais.');
      },
    });
  }

  private loadSummary(): void {
    const filters = this.buildFilters();
    if (!filters) return;
    this.isSummaryLoading.set(true);
    this.fiscalService
      .getSummary({
        environment: filters.environment,
        startDate: filters.startDate,
        endDate: filters.endDate,
      })
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.isSummaryLoading.set(false);
        },
        error: (error) => {
          this.isSummaryLoading.set(false);
          this.showError(error?.error?.message || 'Não foi possível atualizar o resumo fiscal.');
        },
      });
  }

  private buildFilters(): FiscalDocumentFilters | null {
    const value = this.filters.getRawValue();
    const startDate = localDateBoundaryIso(value.startDate, 'start');
    const endDate = localDateBoundaryIso(value.endDate, 'end');
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      this.isLoading.set(false);
      this.isSummaryLoading.set(false);
      this.showError('A data inicial deve ser anterior à data final.');
      return null;
    }
    return {
      page: this.currentPage(),
      limit: this.pageSize,
      search: value.search.trim() || undefined,
      status: value.status || undefined,
      environment: value.environment
        ? (value.environment as 'HOMOLOGACAO' | 'PRODUCAO')
        : undefined,
      startDate,
      endDate,
    };
  }

  private cancel(document: FiscalDocumentListItem, justification: string): void {
    this.activeOrderId.set(document.order.id);
    this.fiscalService.cancelOrder(document.order.id, justification).subscribe({
      next: () => {
        this.activeOrderId.set(null);
        this.showSuccess('Solicitação de cancelamento enviada à SEFAZ.');
        this.refresh();
      },
      error: (error) => {
        this.activeOrderId.set(null);
        this.showError(error?.error?.message || 'Não foi possível cancelar a NFC-e.');
      },
    });
  }

  private retry(document: FiscalDocumentListItem): void {
    if (this.activeOrderId()) return;
    this.activeOrderId.set(document.order.id);
    this.fiscalService.retryOrder(document.order.id, createFiscalIdempotencyKey()).subscribe({
      next: () => {
        this.activeOrderId.set(null);
        this.showSuccess('Reemissão da NFC-e solicitada com sucesso.');
        this.refresh();
      },
      error: (error) => {
        this.activeOrderId.set(null);
        this.showError(error?.error?.message || 'Não foi possível reemitir a NFC-e.');
      },
    });
  }

  private countFor(...statuses: string[]): number {
    const counts = this.summary().counts;
    return statuses.reduce((total, status) => total + Number(counts[status] ?? 0), 0);
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Fechar', {
      duration: 4000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['ui-snackbar-success'],
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Fechar', {
      duration: 5000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['ui-snackbar-error'],
    });
  }
}
