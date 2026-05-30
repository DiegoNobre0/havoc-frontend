import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { OrderService } from '../../services/order.service';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

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

  // ─── State ──────────────────────────────────────────────
  isLoading = signal(true);
  selectedOrder = signal<Order | null>(null);
  isDetailOpen = signal(false);
  isCancelOpen = signal(false);
  cancelReason = signal('');
  refreshTimer?: ReturnType<typeof setInterval>;

  columns = signal<KanbanColumn[]>([
    { status: 'PENDING',    label: 'Aguardando', icon: 'clock',        color: 'warning', orders: [] },
    { status: 'CONFIRMED',  label: 'Confirmado', icon: 'check-circle', color: 'info',    orders: [] },
    { status: 'PROCESSING', label: 'Em Preparo', icon: 'package',      color: 'havoc',   orders: [] },
    { status: 'SHIPPED',    label: 'Enviado',    icon: 'truck',        color: 'blue',    orders: [] },
  ]);

  totalActive = computed(() =>
    this.columns().reduce((sum, col) => sum + col.orders.length, 0)
  );

  // ─── Lifecycle ──────────────────────────────────────────
  ngOnInit() {
    this.loadOrders();
    this.refreshTimer = setInterval(() => this.loadOrders(), 30_000);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  // ─── API (só na carga inicial e refresh silencioso) ──────
  loadOrders() {
    this.isLoading.set(true);
    this.orderService.listOrders(1, 100).subscribe({
      next: (res: any) => {
        const orders: Order[] = res.data;
        this.columns.update(cols =>
          cols.map(col => ({
            ...col,
            orders: orders
              .filter(o => o.status === col.status)
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
          }))
        );
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erro ao buscar pedidos', err);
        this.isLoading.set(false);
      },
    });
  }

  // ─── Atualiza o signal localmente sem reload ─────────────
  private moveOrderToStatus(orderId: string, newStatus: OrderStatus) {
    this.columns.update(cols => {
      // Encontra o pedido em qualquer coluna
      let movedOrder: Order | undefined;
      const withoutOrder = cols.map(col => ({
        ...col,
        orders: col.orders.filter(o => {
          if (o.id === orderId) { movedOrder = o; return false; }
          return true;
        }),
      }));

      if (!movedOrder) return cols;

      const updatedOrder: Order = { ...movedOrder, status: newStatus };

      return withoutOrder.map(col => {
        if (col.status !== newStatus) return col;
        return {
          ...col,
          orders: [...col.orders, updatedOrder].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          ),
        };
      });
    });
  }

  private removeOrder(orderId: string) {
    this.columns.update(cols =>
      cols.map(col => ({
        ...col,
        orders: col.orders.filter(o => o.id !== orderId),
      }))
    );
  }

  // ─── Ações ──────────────────────────────────────────────
  advanceOrder(order: Order) {
    const flow: Record<string, OrderStatus> = {
      PENDING:    'CONFIRMED',
      CONFIRMED:  'PROCESSING',
      PROCESSING: 'SHIPPED',
      SHIPPED:    'DELIVERED',
    };

    const nextStatus = flow[order.status];
    if (!nextStatus) return;

    // ✅ Atualiza o kanban na hora, sem reload
    this.moveOrderToStatus(order.id, nextStatus);

    // Persiste na API em background; reverte se falhar
    this.orderService.updateStatus(order.id, nextStatus, `Avançado para ${nextStatus} via Kanban`).subscribe({
      error: (err) => {
        console.error('Erro ao atualizar status', err);
        this.moveOrderToStatus(order.id, order.status); // reverte
      },
    });
  }

  confirmCancel() {
    const order = this.selectedOrder();
    if (!order || !this.cancelReason()) return;

    // ✅ Remove do kanban na hora, sem reload
    this.removeOrder(order.id);
    this.closeCancel();

    // Persiste na API em background; reverte se falhar
    this.orderService.updateStatus(order.id, 'CANCELLED', `Motivo: ${this.cancelReason()}`).subscribe({
      error: (err) => {
        console.error('Erro ao cancelar pedido', err);
        // Reinsere o pedido na coluna original caso a API falhe
        this.columns.update(cols =>
          cols.map(col => {
            if (col.status !== order.status) return col;
            return {
              ...col,
              orders: [...col.orders, order].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              ),
            };
          })
        );
      },
    });
  }

  // ─── Modal de Detalhe ────────────────────────────────────
  openDetail(order: Order) {
    this.orderService.getOrderById(order.id).subscribe({
      next: (fullOrder) => {
        this.selectedOrder.set(fullOrder);
        this.isDetailOpen.set(true);
      },
    });
  }

  closeDetail() {
    this.isDetailOpen.set(false);
    this.selectedOrder.set(null);
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

  // ─── Helpers ────────────────────────────────────────────
  getNextActionLabel(status: OrderStatus): string {
    const labels: Partial<Record<OrderStatus, string>> = {
      PENDING:    'Confirmar',
      CONFIRMED:  'Preparar',
      PROCESSING: 'Despachar',
      SHIPPED:    'Marcar Entregue',
    };
    return labels[status] ?? '';
  }

  formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL',
    }).format(Number(value));
  }
}