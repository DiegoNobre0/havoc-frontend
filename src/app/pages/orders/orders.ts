import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog';
import { FiscalAttemptsDialogComponent } from '../../components/fiscal-attempts-dialog/fiscal-attempts-dialog';
import { FiscalCancelDialogComponent } from '../../components/fiscal-cancel-dialog/fiscal-cancel-dialog';
import { AuthService } from '../../services/auth.service';
import {
  createFiscalIdempotencyKey,
  FiscalDocument,
  FiscalService,
} from '../../services/fiscal.service';
import { OrderService } from '../../services/order.service';
import { SocketService } from '../../services/socket.service';

export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

export interface Order {
  id: string;
  code: string;
  status: OrderStatus;
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  notes?: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  channel?: string | null;
  deliveryAddress?: string;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    product?: { name: string; imageUrl?: string };
    kit?: { name: string; imageUrl?: string };
  }>;
}

interface KanbanColumn {
  status: OrderStatus;
  label: string;
  icon: string;
  color: string;
  orders: Order[];
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './orders.html',
  styleUrls: ['./orders.scss'],
})
export class Orders implements OnInit, OnDestroy {
  private readonly orderService = inject(OrderService);
  private readonly socketService = inject(SocketService);
  private readonly fiscalService = inject(FiscalService);
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private newOrderSubscription?: Subscription;
  private deepLinkSubscription?: Subscription;

  // ─── State ──────────────────────────────────────────────
  isLoading = signal(true);
  selectedOrder = signal<Order | null>(null);
  isDetailOpen = signal(false);
  isCancelOpen = signal(false);
  cancelReason = signal('');
  fiscalDocument = signal<FiscalDocument | null>(null);
  isFiscalLoading = signal(false);
  isReconcilingFiscal = signal(false);
  isCancellingFiscal = signal(false);
  isRetryingFiscal = signal(false);
  downloadingFiscal = signal<'pdf' | 'xml' | 'cancellation-pdf' | 'cancellation-xml' | null>(null);
  isAdmin = computed(() => this.authService.currentUser()?.role === 'ADMIN');
  refreshTimer?: ReturnType<typeof setInterval>;

  columns = signal<KanbanColumn[]>([
    { status: 'PENDING', label: 'Aguardando', icon: 'clock', color: 'warning', orders: [] },
    { status: 'CONFIRMED', label: 'Confirmado', icon: 'check-circle', color: 'info', orders: [] },
    { status: 'PROCESSING', label: 'Em Preparo', icon: 'package', color: 'havoc', orders: [] },
    { status: 'SHIPPED', label: 'Enviado', icon: 'truck', color: 'blue', orders: [] },
  ]);

  totalActive = computed(() => this.columns().reduce((sum, col) => sum + col.orders.length, 0));

  // ─── Lifecycle ──────────────────────────────────────────
  ngOnInit() {
    this.loadOrders();
    this.newOrderSubscription = this.socketService.onNewOrder.subscribe(() =>
      this.loadOrders(false),
    );
    this.deepLinkSubscription = this.route.queryParamMap.subscribe((params) => {
      const orderId = params.get('orderId');
      if (orderId) this.openOrderById(orderId);
    });
    this.refreshTimer = setInterval(() => this.loadOrders(false), 30_000);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.newOrderSubscription?.unsubscribe();
    this.deepLinkSubscription?.unsubscribe();
  }

  // ─── API (só na carga inicial e refresh silencioso) ──────
  loadOrders(showLoading = true) {
    if (showLoading) this.isLoading.set(true);
    this.orderService.listOrders(1, 100).subscribe({
      next: (res: any) => {
        const orders: Order[] = res.data;
        this.columns.update((cols) =>
          cols.map((col) => ({
            ...col,
            orders: orders
              .filter((o) => o.status === col.status)
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
          })),
        );
        if (showLoading) this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erro ao buscar pedidos', err);
        if (showLoading) this.isLoading.set(false);
      },
    });
  }

  // ─── Atualiza o signal localmente sem reload ─────────────
  private moveOrderToStatus(orderId: string, newStatus: OrderStatus) {
    this.columns.update((cols) => {
      // Encontra o pedido em qualquer coluna
      let movedOrder: Order | undefined;
      const withoutOrder = cols.map((col) => ({
        ...col,
        orders: col.orders.filter((o) => {
          if (o.id === orderId) {
            movedOrder = o;
            return false;
          }
          return true;
        }),
      }));

      if (!movedOrder) return cols;

      const updatedOrder: Order = { ...movedOrder, status: newStatus };

      return withoutOrder.map((col) => {
        if (col.status !== newStatus) return col;
        return {
          ...col,
          orders: [...col.orders, updatedOrder].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          ),
        };
      });
    });
  }

  private removeOrder(orderId: string) {
    this.columns.update((cols) =>
      cols.map((col) => ({
        ...col,
        orders: col.orders.filter((o) => o.id !== orderId),
      })),
    );
  }

  // ─── Ações ──────────────────────────────────────────────
  advanceOrder(order: Order) {
    const flow: Record<string, OrderStatus> = {
      PENDING: 'CONFIRMED',
      CONFIRMED: 'PROCESSING',
      PROCESSING: 'SHIPPED',
      SHIPPED: 'DELIVERED',
    };

    const nextStatus = flow[order.status];
    if (!nextStatus) return;

    // ✅ Atualiza o kanban na hora, sem reload
    this.moveOrderToStatus(order.id, nextStatus);

    // Persiste na API em background; reverte se falhar
    this.orderService
      .updateStatus(order.id, nextStatus, `Avançado para ${nextStatus} via Kanban`)
      .subscribe({
        error: (err) => {
          console.error('Erro ao atualizar status', err);
          this.moveOrderToStatus(order.id, order.status); // reverte
        },
      });
  }

  confirmCancel() {
    const order = this.selectedOrder();
    if (!order || !this.cancelReason()) return;
    if (this.isFiscalAuthorized()) {
      this.showError('Cancele e confirme a NFC-e antes de cancelar o pedido comercial.');
      return;
    }

    // ✅ Remove do kanban na hora, sem reload
    this.removeOrder(order.id);
    this.closeCancel();

    // Persiste na API em background; reverte se falhar
    this.orderService
      .updateStatus(order.id, 'CANCELLED', `Motivo: ${this.cancelReason()}`)
      .subscribe({
        error: (err) => {
          console.error('Erro ao cancelar pedido', err);
          // Reinsere o pedido na coluna original caso a API falhe
          this.columns.update((cols) =>
            cols.map((col) => {
              if (col.status !== order.status) return col;
              return {
                ...col,
                orders: [...col.orders, order].sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                ),
              };
            }),
          );
        },
      });
  }

  // ─── Modal de Detalhe ────────────────────────────────────
  openDetail(order: Order) {
    this.openOrderById(order.id);
  }

  private openOrderById(orderId: string): void {
    this.orderService.getOrderById(orderId).subscribe({
      next: (fullOrder) => {
        this.selectedOrder.set(fullOrder);
        this.isDetailOpen.set(true);
        this.fiscalDocument.set(null);
        if (!fullOrder.channel || fullOrder.channel.toUpperCase() === 'POS') {
          this.loadFiscalDocument(fullOrder.id);
        }
      },
      error: (error) =>
        this.showError(this.errorMessage(error, 'Não foi possível abrir o pedido.')),
    });
  }

  closeDetail() {
    this.isDetailOpen.set(false);
    this.selectedOrder.set(null);
    this.fiscalDocument.set(null);
    this.isFiscalLoading.set(false);
  }

  // ─── Modal de Cancelamento ───────────────────────────────
  openCancel(order: Order) {
    this.selectedOrder.set(order);
    this.isCancelOpen.set(true);
  }

  closeCancel() {
    this.isCancelOpen.set(false);
    this.cancelReason.set('');
  }

  loadFiscalDocument(orderId: string): void {
    this.isFiscalLoading.set(true);
    this.fiscalService.getOrderDocument(orderId).subscribe({
      next: (document) => {
        this.fiscalDocument.set(document);
        this.isFiscalLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.fiscalDocument.set(null);
        this.isFiscalLoading.set(false);
        if (error.status !== 404) {
          this.showError(
            this.errorMessage(error, 'Não foi possível consultar o documento fiscal.'),
          );
        }
      },
    });
  }

  reconcileFiscal(): void {
    const order = this.selectedOrder();
    if (!order || this.fiscalActionInProgress()) return;
    this.isReconcilingFiscal.set(true);
    this.fiscalService.reconcileOrder(order.id).subscribe({
      next: (document) => {
        this.fiscalDocument.set(document);
        this.isReconcilingFiscal.set(false);
        this.showSuccess('Situação da NFC-e atualizada pela SEFAZ.');
      },
      error: (error) => {
        this.isReconcilingFiscal.set(false);
        this.showError(this.errorMessage(error, 'Não foi possível consultar a SEFAZ.'));
      },
    });
  }

  requestFiscalRetry(): void {
    const order = this.selectedOrder();
    if (!order || !this.canRetryFiscal() || this.fiscalActionInProgress()) return;
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
        if (confirmed) this.retryFiscal(order.id);
      });
  }

  openFiscalHistory(): void {
    const order = this.selectedOrder();
    if (!order) return;
    this.dialog.open(FiscalAttemptsDialogComponent, {
      width: 'min(760px, calc(100vw - 24px))',
      maxWidth: '100vw',
      data: { orderId: order.id, orderCode: order.code },
    });
  }

  requestFiscalCancellation(): void {
    const order = this.selectedOrder();
    if (!order || !this.canCancelFiscal() || this.fiscalActionInProgress()) return;
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
              message:
                'Esta ação solicitará o cancelamento da NFC-e à SEFAZ e não cancela o pedido comercial.',
              confirmText: 'Cancelar NFC-e',
              cancelText: 'Voltar',
              isDanger: true,
            },
          })
          .afterClosed()
          .subscribe((confirmed: boolean) => {
            if (confirmed) this.cancelFiscal(order.id, justification);
          });
      });
  }

  private cancelFiscal(orderId: string, justification: string): void {
    if (this.fiscalActionInProgress()) return;
    this.isCancellingFiscal.set(true);
    this.fiscalService.cancelOrder(orderId, justification).subscribe({
      next: (document) => {
        this.fiscalDocument.set(document);
        this.isCancellingFiscal.set(false);
        this.showSuccess(
          document.cancellationStatus === 'CONFIRMED'
            ? 'NFC-e cancelada pela SEFAZ.'
            : 'Solicitação de cancelamento enviada à SEFAZ.',
        );
      },
      error: (error) => {
        this.isCancellingFiscal.set(false);
        this.showError(this.errorMessage(error, 'Não foi possível cancelar a NFC-e.'));
      },
    });
  }

  downloadFiscal(kind: 'pdf' | 'xml' | 'cancellation-pdf' | 'cancellation-xml'): void {
    const order = this.selectedOrder();
    if (!order || this.downloadingFiscal()) return;
    this.downloadingFiscal.set(kind);
    const requests = {
      pdf: () => this.fiscalService.downloadPdf(order.id),
      xml: () => this.fiscalService.downloadXml(order.id),
      'cancellation-pdf': () => this.fiscalService.downloadCancellationPdf(order.id),
      'cancellation-xml': () => this.fiscalService.downloadCancellationXml(order.id),
    };
    requests[kind]().subscribe({
      next: (blob) => {
        const extension = kind.endsWith('pdf') ? 'pdf' : 'xml';
        const prefix = kind.startsWith('cancellation') ? 'cancelamento-nfce' : 'nfce';
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${prefix}-${order.code}.${extension}`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.downloadingFiscal.set(null);
      },
      error: (error) => {
        this.downloadingFiscal.set(null);
        this.showError(this.errorMessage(error, 'Não foi possível baixar o arquivo fiscal.'));
      },
    });
  }

  isFiscalAuthorized(): boolean {
    const status = this.fiscalDocument()?.status.toUpperCase() ?? '';
    return status === 'AUTHORIZED' || status === 'AUTORIZADO';
  }

  canCancelFiscal(): boolean {
    const cancellationStatus = this.fiscalDocument()?.cancellationStatus;
    return (
      this.isAdmin() &&
      this.isFiscalAuthorized() &&
      (!cancellationStatus || cancellationStatus === 'REJECTED')
    );
  }

  canRetryFiscal(): boolean {
    const document = this.fiscalDocument();
    return Boolean(document?.canRetry && document.status.toUpperCase() === 'REJECTED');
  }

  fiscalActionInProgress(): boolean {
    return this.isReconcilingFiscal() || this.isCancellingFiscal() || this.isRetryingFiscal();
  }

  fiscalStatusLabel(document: FiscalDocument): string {
    if (document.status.toUpperCase() === 'CANCELLED') return 'Cancelada';
    if (this.isFiscalAuthorized()) return 'Autorizada';
    if (document.status.toUpperCase() === 'REJECTED') return 'Rejeitada';
    if (document.status.toUpperCase() === 'UNKNOWN') return 'Situação desconhecida';
    return 'Em processamento';
  }

  cancellationStatusLabel(status: FiscalDocument['cancellationStatus']): string {
    const labels: Record<Exclude<FiscalDocument['cancellationStatus'], null>, string> = {
      PROCESSING: 'Cancelamento em processamento',
      CONFIRMED: 'Cancelamento confirmado',
      REJECTED: 'Cancelamento rejeitado',
      UNKNOWN: 'Situação do cancelamento desconhecida',
    };
    return status ? labels[status] : '';
  }

  formatDate(date?: string | null): string {
    if (!date) return 'Não informado';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(date),
    );
  }

  private errorMessage(error: any, fallback: string): string {
    return error?.error?.message || fallback;
  }

  private retryFiscal(orderId: string): void {
    if (this.fiscalActionInProgress()) return;
    this.isRetryingFiscal.set(true);
    this.fiscalService.retryOrder(orderId, createFiscalIdempotencyKey()).subscribe({
      next: (document) => {
        this.fiscalDocument.set(document);
        this.isRetryingFiscal.set(false);
        this.showSuccess('Reemissão da NFC-e solicitada com sucesso.');
      },
      error: (error) => {
        this.isRetryingFiscal.set(false);
        this.showError(this.errorMessage(error, 'Não foi possível reemitir a NFC-e.'));
      },
    });
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

  // ─── Helpers ────────────────────────────────────────────
  getNextActionLabel(status: OrderStatus): string {
    const labels: Partial<Record<OrderStatus, string>> = {
      PENDING: 'Confirmar',
      CONFIRMED: 'Preparar',
      PROCESSING: 'Despachar',
      SHIPPED: 'Marcar Entregue',
    };
    return labels[status] ?? '';
  }

  formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(value));
  }
}
