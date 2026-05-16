import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { OrderService } from '../../services/order.service';


// Tipos baseados no seu Prisma Schema
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

// No arquivo order.service.ts
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

  // 👉 STATUS ALINHADOS COM SEU PRISMA
  columns = signal<KanbanColumn[]>([
    { status: 'PENDING', label: 'Aguardando', icon: 'clock', color: 'warning', orders: [] },
    { status: 'CONFIRMED', label: 'Confirmado', icon: 'check-circle', color: 'info', orders: [] },
    { status: 'PROCESSING', label: 'Em Preparo', icon: 'package', color: 'havoc', orders: [] },
    { status: 'SHIPPED', label: 'Enviado', icon: 'truck', color: 'blue', orders: [] }
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

  // ─── Integração com API (Sem Mocks) ─────────────────────
  loadOrders() {
    this.isLoading.set(true);

    // Busca todos os pedidos ativos (limitando a 100 para o Kanban)
    this.orderService.listOrders(1, 100).subscribe({
      next: (res: any) => {
        const orders = res.data;
        this.columns.update(cols =>
          cols.map(col => ({
            ...col,
            orders: orders.filter((o: Order) => o.status === col.status)
              .sort((a: Order, b: Order) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
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

  // ─── Ações ──────────────────────────────────────────────
  advanceOrder(order: Order) {
    // 👉 FLUXO EXATO DO SEU PRISMA
    const flow: Record<string, OrderStatus> = {
      PENDING: 'CONFIRMED',
      CONFIRMED: 'PROCESSING',
      PROCESSING: 'SHIPPED',
      SHIPPED: 'DELIVERED',
    };

    const nextStatus = flow[order.status];
    if (!nextStatus) return;

    this.orderService.updateStatus(order.id, nextStatus, `Avançado para ${nextStatus} via Kanban`).subscribe({
      next: () => this.loadOrders(),
      error: (err) => console.error('Erro ao atualizar status', err)
    });
  }

  openDetail(order: Order) {
    // Busca os detalhes completos na API ao abrir o modal
    this.orderService.getOrderById(order.id).subscribe({
      next: (fullOrder) => {
        this.selectedOrder.set(fullOrder);
        this.isDetailOpen.set(true);
      }
    });
  }

  closeDetail() {
    this.isDetailOpen.set(false);
    this.selectedOrder.set(null);
  }

  openCancel(order: Order) {
    this.selectedOrder.set(order);
    this.isCancelOpen.set(true);
  }

  closeCancel() {
    this.isCancelOpen.set(false);
    this.cancelReason.set('');
  }

  confirmCancel() {
    const order = this.selectedOrder();
    if (!order || !this.cancelReason()) return;

    this.orderService.updateStatus(order.id, 'CANCELLED', `Motivo: ${this.cancelReason()}`).subscribe({
      next: () => {
        this.closeCancel();
        this.loadOrders();
      }
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
      hour: '2-digit', minute: '2-digit'
    });
  }

  formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL'
    }).format(Number(value));
  }
}