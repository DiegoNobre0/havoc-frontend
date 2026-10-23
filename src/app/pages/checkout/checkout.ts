import { Component, DestroyRef, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgxMaskDirective } from 'ngx-mask';

import { CartService } from '../../services/cart.service';
import {
  CheckoutOrder,
  CheckoutPayment,
  CheckoutStatusResponse,
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  ShippingRegion,
  StorefrontService,
} from '../../services/storefront.service';
import { PaginationMeta, StorefrontCategory, StorefrontItem, StorefrontItemType } from '../../models/storefront.models';
import { Subject, catchError, debounceTime, finalize, of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupplementConsultantComponent } from '../../components/supplement-consultant/supplement-consultant';

export type DeliveryMethod = 'DELIVERY' | 'PICKUP';
export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'CASH';

type CompletedOrder = CheckoutOrder;
type PaymentReturnStatus = 'success' | 'pending' | 'failure';

interface StoredCheckoutSession {
  orderId: string;
  token: string;
  checkout?: CreateCheckoutResponse;
}

const CHECKOUT_SESSION_KEY = 'havoc-storefront-checkout';
const CUSTOM_SHIPPING_COST = 15;

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    LucideAngularModule,
    NgxMaskDirective,
    SupplementConsultantComponent
  ],
  templateUrl: './checkout.html',
  styleUrls: ['./checkout.scss']
})
export class CheckoutComponent implements OnInit {
  private readonly storefrontService = inject(StorefrontService);
  readonly cartService = inject(CartService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly catalogRequests = new Subject<void>();
  private featuredAutoplay?: ReturnType<typeof setInterval>;
  private paymentPolling?: ReturnType<typeof setInterval>;
  private paymentPollInFlight = false;
  private paymentPollAttempts = 0;
  private idempotencyKey = crypto.randomUUID();

  @ViewChild('catalogSection') private catalogSection?: ElementRef<HTMLElement>;
  @ViewChild('featuredCarousel') private featuredCarousel?: ElementRef<HTMLElement>;

  isLoadingCatalog = signal(true);
  catalogError = signal(false);
  catalog = signal<StorefrontItem[]>([]);
  categories = signal<StorefrontCategory[]>([]);
  bestSellers = signal<StorefrontItem[]>([]);
  featuredIndex = signal(0);
  isFeaturedPaused = signal(false);
  searchQuery = signal('');
  selectedCategoryId = signal('');
  activeCatalogType = signal<'all' | StorefrontItemType>('all');
  page = signal(1);
  readonly pageSize = 24;
  meta = signal<PaginationMeta>({ total: 0, page: 1, limit: this.pageSize, totalPages: 0 });
  pageNumbers = computed(() => {
    const total = this.meta().totalPages;
    const current = this.page();
    const start = Math.max(1, Math.min(current - 2, total - 4));
    return Array.from({ length: Math.min(5, total) }, (_, index) => start + index);
  });

  readonly cart = this.cartService.items;
  readonly cartCount = this.cartService.count;
  readonly subtotal = this.cartService.subtotal;
  isCartDrawerOpen = signal<boolean>(false);

  // ─── ENTREGA E PAGAMENTO ────────────────────────────────────
  deliveryMethod = signal<DeliveryMethod>('DELIVERY');
  shippingCost = signal(0);
  shippingRegions = signal<ShippingRegion[]>([]);
  selectedShippingRegion = signal<ShippingRegion | null>(null);
  isCustomNeighborhood = signal(false);
  isShippingRegionsLoading = signal(true);

  paymentMethod = signal<PaymentMethod>('PIX');

  // ─── ESTADOS DO FLUXO DO PEDIDO ─────────────────────────────
  currentStep = signal<1 | 2 | 3>(1); // 1 = Escolha, 2 = Dados & Entrega, 3 = Pagamento
  isSubmitting = signal<boolean>(false);
  isOrderCompleted = signal<boolean>(false);
  completedOrder = signal<CompletedOrder | null>(null);
  completedPayment = signal<CheckoutPayment | null>(null);
  checkoutStatus = signal<CheckoutStatusResponse | null>(null);
  paymentReturnStatus = signal<PaymentReturnStatus | null>(null);
  returnOrderCode = signal<string | null>(null);
  pixCopied = signal<boolean>(false);

  // ─── FORMULÁRIO DO CLIENTE & ENDEREÇO ───────────────────────
  customerForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', [Validators.required, Validators.minLength(10)]],
    cpf: ['', [Validators.required]],
    email: ['', [Validators.email]],
    notes: ['']
  });

  addressForm = this.fb.nonNullable.group({
    street: ['', [Validators.required]],
    number: ['', [Validators.required]],
    complement: [''],
    neighborhood: ['', [Validators.required]],
    city: ['Camaçari', [Validators.required]],
    state: ['BA', [Validators.required]],
    reference: ['']
  });

  effectiveShipping = computed(() => {
    if (this.deliveryMethod() === 'PICKUP') return 0;
    return this.shippingCost();
  });

  grandTotal = computed(() => {
    const total = this.subtotal() + this.effectiveShipping();
    return Math.max(0, total);
  });

  finalButtonLabel = computed(() => {
    if (this.paymentMethod() === 'PIX') return 'Gerar PIX';
    if (this.paymentMethod() === 'CREDIT_CARD') return 'Pagar com cartão';
    return 'Confirmar pedido para retirada';
  });

  pixQrCodeSrc = computed(() => {
    const image = this.completedPayment()?.qrCodeImage;
    if (!image || image.startsWith('data:') || image.startsWith('http')) return image;
    return `data:image/png;base64,${image}`;
  });

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.searchQuery.set(params.get('search') ?? '');
    this.selectedCategoryId.set(params.get('categoryId') ?? '');
    const type = params.get('type');
    this.activeCatalogType.set(type === 'product' || type === 'kit' ? type : 'all');
    const requestedPage = Number(params.get('page'));
    this.page.set(Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
    if (params.get('cart') === 'open') this.isCartDrawerOpen.set(true);
    if (params.get('step') === '2' && this.cart().length > 0) this.currentStep.set(2);
    this.restoreCheckoutSession();
    this.handlePaymentReturn(
      params.get('payment') ?? params.get('status') ?? params.get('collection_status'),
      params.get('payment_id') ?? params.get('collection_id') ?? undefined,
      params.get('orderId') ?? undefined,
      params.get('token') ?? undefined,
    );

    this.catalogRequests.pipe(
      debounceTime(300),
      switchMap(() => {
        this.isLoadingCatalog.set(true);
        this.catalogError.set(false);
        this.syncQueryParams();
        const catalogType = this.activeCatalogType();
        return this.storefrontService.getCatalog({
          page: this.page(),
          limit: this.pageSize,
          search: this.searchQuery().trim() || undefined,
          categoryId: this.selectedCategoryId() || undefined,
          type: catalogType === 'all' ? undefined : catalogType,
        }).pipe(
          catchError(() => {
            this.catalogError.set(true);
            return of(null);
          }),
          finalize(() => this.isLoadingCatalog.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((response) => {
      if (!response) {
        this.catalog.set([]);
        return;
      }
      this.catalog.set(response.data);
      this.meta.set(response.meta);
    });

    this.storefrontService.getCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => this.categories.set(data),
      error: () => this.categories.set([]),
    });
    this.storefrontService.getBestSellers().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data }) => {
        this.bestSellers.set(data);
        this.featuredIndex.set(0);
      },
      error: () => this.bestSellers.set([]),
    });
    this.storefrontService.getShippingRegions().pipe(
      finalize(() => this.isShippingRegionsLoading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ({ data }) => this.shippingRegions.set(data),
      error: () => {
        this.shippingRegions.set([]);
        this.showToast('Não foi possível carregar os bairros de entrega.', 'error');
      },
    });
    this.startFeaturedAutoplay();
    this.destroyRef.onDestroy(() => {
      if (this.featuredAutoplay) clearInterval(this.featuredAutoplay);
      this.stopPaymentPolling();
    });
    this.catalogRequests.next();
  }

  goToFeatured(index: number): void {
    const total = this.bestSellers().length;
    const carousel = this.featuredCarousel?.nativeElement;
    if (!carousel || total === 0) return;

    const nextIndex = (index + total) % total;
    const slide = carousel.querySelector<HTMLElement>(`[data-featured-index="${nextIndex}"]`);
    if (!slide) return;

    this.featuredIndex.set(nextIndex);
    carousel.scrollTo({ left: slide.offsetLeft - carousel.offsetLeft, behavior: 'smooth' });
  }

  onFeaturedScroll(): void {
    const carousel = this.featuredCarousel?.nativeElement;
    if (!carousel) return;

    const slides = Array.from(carousel.querySelectorAll<HTMLElement>('[data-featured-index]'));
    const closest = slides.reduce(
      (result, slide, index) => {
        const target = slide.offsetLeft - carousel.offsetLeft;
        const distance = Math.abs(target - carousel.scrollLeft);
        return distance < result.distance ? { index, distance } : result;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    );
    this.featuredIndex.set(closest.index);
  }

  setFeaturedPaused(paused: boolean): void {
    this.isFeaturedPaused.set(paused);
  }

  private startFeaturedAutoplay(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    this.featuredAutoplay = setInterval(() => {
      if (!this.isFeaturedPaused() && this.bestSellers().length > 1) {
        this.goToFeatured(this.featuredIndex() + 1);
      }
    }, 5000);
  }

  onSearch(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
    this.catalogRequests.next();
  }

  clearSearch(): void {
    this.onSearch('');
  }

  setCatalogType(type: 'all' | StorefrontItemType): void {
    this.activeCatalogType.set(type);
    this.page.set(1);
    this.catalogRequests.next();
  }

  setCategory(categoryId: string): void {
    this.selectedCategoryId.set(categoryId);
    this.page.set(1);
    this.catalogRequests.next();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.meta().totalPages || page === this.page()) return;
    this.page.set(page);
    this.catalogRequests.next();
    setTimeout(() => this.catalogSection?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  retryCatalog(): void {
    this.catalogRequests.next();
  }

  addToCart(item: StorefrontItem): void {
    this.cartService.add(item);
    this.showToast('Adicionado ao carrinho.', 'cart');
  }

  removeFromCart(id: string, type: StorefrontItemType): void {
    this.cartService.remove(type, id);
    if (this.cart().length === 0) {
      this.isCartDrawerOpen.set(false);
      this.currentStep.set(1);
      this.showToast('Seu carrinho ficou vazio. Escolha novos produtos.', 'warning');
    }
  }

  updateQuantity(id: string, type: StorefrontItemType, quantity: number): void {
    this.cartService.update(type, id, quantity);
  }

  clearCart(): void {
    this.cartService.clear();
  }

  private syncQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        page: this.page() > 1 ? this.page() : null,
        search: this.searchQuery().trim() || null,
        categoryId: this.selectedCategoryId() || null,
        type: this.activeCatalogType() === 'all' ? null : this.activeCatalogType(),
      },
      queryParamsHandling: 'merge',
    });
  }

  toggleCartDrawer(): void {
    this.isCartDrawerOpen.update(v => !v);
  }

  selectShippingRegion(ruleId: string): void {
    this.shippingCost.set(0);
    this.selectedShippingRegion.set(null);

    if (ruleId === 'custom') {
      this.isCustomNeighborhood.set(true);
      this.addressForm.controls.neighborhood.setValue('');
      this.shippingCost.set(CUSTOM_SHIPPING_COST);
      return;
    }

    this.isCustomNeighborhood.set(false);
    const rule = this.shippingRegions().find((region) => region.id === ruleId) ?? null;
    this.selectedShippingRegion.set(rule);
    this.addressForm.controls.neighborhood.setValue(rule?.region ?? '');
    this.shippingCost.set(rule?.price ?? 0);
  }

  // ─── SELETORES E PASSOS ─────────────────────────────────────
  setDeliveryMethod(method: DeliveryMethod): void {
    this.deliveryMethod.set(method);
    if (method === 'PICKUP') {
      this.shippingCost.set(0);
    } else {
      this.shippingCost.set(
        this.isCustomNeighborhood() ? CUSTOM_SHIPPING_COST : (this.selectedShippingRegion()?.price ?? 0),
      );
      if (this.paymentMethod() === 'CASH') this.paymentMethod.set('PIX');
    }
  }

  setPaymentMethod(method: PaymentMethod): void {
    if (method === 'CASH' && this.deliveryMethod() !== 'PICKUP') return;
    this.paymentMethod.set(method);
  }

  goToStep(step: 1 | 2 | 3): void {
    if (step > 1 && this.cart().length === 0) {
      this.showToast('Selecione pelo menos um produto para continuar.', 'warning');
      return;
    }

    if (step === 3 && this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      this.showToast('Por favor, preencha os dados cadastrais obrigatórios.', 'warning');
      return;
    }

    if (step === 3 && this.deliveryMethod() === 'DELIVERY' && this.addressForm.invalid) {
      this.addressForm.markAllAsTouched();
      this.showToast('Por favor, complete os campos do endereço de entrega.', 'warning');
      return;
    }

    if (
      step === 3 &&
      this.deliveryMethod() === 'DELIVERY' &&
      !this.selectedShippingRegion() &&
      !this.isCustomNeighborhood()
    ) {
      this.showToast('Selecione ou informe seu bairro antes de continuar.', 'warning');
      return;
    }

    this.currentStep.set(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── FINALIZAÇÃO DO PEDIDO ──────────────────────────────────
  submitOrder(): void {
    if (this.cart().length === 0) {
      this.showToast('Seu carrinho está vazio!', 'warning');
      return;
    }

    if (this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      this.currentStep.set(2);
      this.showToast('Preencha seus dados de contato.', 'warning');
      return;
    }

    if (this.deliveryMethod() === 'DELIVERY' && this.addressForm.invalid) {
      this.addressForm.markAllAsTouched();
      this.currentStep.set(2);
      this.showToast('Preencha o endereço completo para entrega.', 'warning');
      return;
    }

    if (
      this.deliveryMethod() === 'DELIVERY' &&
      !this.selectedShippingRegion() &&
      !this.isCustomNeighborhood()
    ) {
      this.currentStep.set(2);
      this.showToast('Selecione ou informe seu bairro antes de finalizar.', 'warning');
      return;
    }

    if (this.paymentMethod() === 'CASH' && this.deliveryMethod() !== 'PICKUP') {
      this.paymentMethod.set('PIX');
      this.showToast('Dinheiro está disponível somente para retirada.', 'warning');
      return;
    }

    this.isSubmitting.set(true);

    const cust = this.customerForm.getRawValue();
    const addr = this.addressForm.getRawValue();

    const orderPayload: CreateCheckoutRequest = {
      customer: {
        name: cust.name.trim(),
        phone: cust.phone,
        cpf: cust.cpf,
        email: cust.email.trim() || undefined,
        notes: cust.notes.trim() || undefined,
      },
      items: this.cart().map((item) => ({
        type: item.type,
        id: item.id,
        quantity: item.quantity,
      })),
      delivery: this.deliveryMethod() === 'PICKUP'
        ? { method: 'PICKUP' }
        : {
            method: 'DELIVERY',
            shippingRuleId: this.selectedShippingRegion()?.id,
            customNeighborhood: this.isCustomNeighborhood() ? addr.neighborhood.trim() : undefined,
            address: {
              street: addr.street.trim(),
              number: addr.number.trim(),
              complement: addr.complement.trim() || undefined,
              neighborhood: addr.neighborhood.trim(),
              city: addr.city.trim(),
              state: addr.state.trim(),
              reference: addr.reference.trim() || undefined,
            },
          },
      paymentMethod: this.paymentMethod(),
    };

    this.storefrontService.createCheckout(orderPayload, this.idempotencyKey).pipe(
      finalize(() => this.isSubmitting.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (response) => this.finishOrderSuccess(response),
      error: () => {
        this.showToast('Não foi possível registrar o pedido. Tente novamente.', 'error');
      }
    });
  }

  private finishOrderSuccess(response: CreateCheckoutResponse): void {
    this.completedOrder.set(response.order);
    this.completedPayment.set(response.payment);
    this.isOrderCompleted.set(true);
    this.saveCheckoutSession(response);
    if (response.order.paymentMethod === 'CREDIT_CARD' && !response.payment?.redirectUrl) {
      this.showToast('O Mercado Pago não retornou o link de pagamento. Tente novamente.', 'error');
      return;
    }
    if (
      response.order.paymentMethod === 'PIX' &&
      (!response.payment?.pixCode || !response.payment?.qrCodeImage)
    ) {
      this.showToast('O Mercado Pago não retornou os dados do PIX. Tente novamente.', 'error');
      return;
    }
    this.clearCart();
    this.idempotencyKey = crypto.randomUUID();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const redirectUrl = response.payment?.redirectUrl;
    if (response.order.paymentMethod === 'CREDIT_CARD' && redirectUrl) {
      window.location.href = redirectUrl;
      return;
    }
    if (response.order.paymentMethod === 'PIX') this.startPaymentPolling(response.order.id, response.checkoutToken);
    this.showToast('Pedido realizado com sucesso!', 'success');
  }

  copyPixCode(): void {
    const pixCode = this.completedPayment()?.pixCode;
    if (!pixCode) return;

    navigator.clipboard.writeText(pixCode)
      .then(() => {
        this.pixCopied.set(true);
        this.showToast('Código PIX copiado para a área de transferência!');
        setTimeout(() => this.pixCopied.set(false), 4000);
      })
      .catch(() => this.showToast('Não foi possível copiar o código PIX.', 'error'));
  }

  resetOrderFlow(): void {
    this.isOrderCompleted.set(false);
    this.completedOrder.set(null);
    this.completedPayment.set(null);
    this.checkoutStatus.set(null);
    this.paymentReturnStatus.set(null);
    this.returnOrderCode.set(null);
    this.stopPaymentPolling();
    sessionStorage.removeItem(CHECKOUT_SESSION_KEY);
    this.currentStep.set(1);
    this.customerForm.reset();
    this.addressForm.reset({ city: 'Camaçari', state: 'BA' });
    this.selectedShippingRegion.set(null);
    this.isCustomNeighborhood.set(false);
    this.shippingCost.set(0);
  }

  private saveCheckoutSession(checkout: CreateCheckoutResponse): void {
    const session: StoredCheckoutSession = {
      orderId: checkout.order.id,
      token: checkout.checkoutToken,
      checkout,
    };
    try {
      sessionStorage.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Checkout continues even when storage is unavailable.
    }
  }

  private restoreCheckoutSession(): void {
    const session = this.getStoredCheckoutSession();
    if (!session?.checkout) return;
    this.completedOrder.set(session.checkout.order);
    this.completedPayment.set(session.checkout.payment);
    this.isOrderCompleted.set(true);
    if (
      session.checkout.order.paymentMethod === 'PIX' &&
      session.checkout.payment?.status === 'PENDING'
    ) {
      this.startPaymentPolling(session.orderId, session.token);
    }
  }

  private handlePaymentReturn(
    value: string | null,
    providerPaymentId?: string,
    returnedOrderId?: string,
    returnedToken?: string,
  ): void {
    const normalized = value?.toLowerCase();
    const mappedStatus: PaymentReturnStatus | null =
      normalized === 'approved' || normalized === 'success'
        ? 'pending'
        : ['pending', 'in_process', 'authorized'].includes(normalized ?? '')
          ? 'pending'
          : ['failure', 'rejected', 'cancelled'].includes(normalized ?? '')
            ? 'failure'
            : null;
    if (!mappedStatus) return;
    const session = this.getStoredCheckoutSession();
    const orderId = session?.orderId ?? returnedOrderId;
    const token = session?.token ?? returnedToken;
    if (!orderId || !token) return;

    this.isOrderCompleted.set(true);
    this.paymentReturnStatus.set(mappedStatus);
    this.returnOrderCode.set(session?.checkout?.order.code ?? null);
    if (mappedStatus === 'failure') {
      this.checkPaymentStatus(orderId, token, true, providerPaymentId);
    } else {
      this.startPaymentPolling(orderId, token, true, providerPaymentId);
    }
  }

  private getStoredCheckoutSession(): StoredCheckoutSession | null {
    try {
      const raw = sessionStorage.getItem(CHECKOUT_SESSION_KEY);
      return raw ? JSON.parse(raw) as StoredCheckoutSession : null;
    } catch {
      return null;
    }
  }

  private startPaymentPolling(
    orderId: string,
    token: string,
    isReturn = false,
    providerPaymentId?: string,
  ): void {
    this.stopPaymentPolling();
    this.paymentPollAttempts = 0;
    this.checkPaymentStatus(orderId, token, isReturn, providerPaymentId);
    this.paymentPolling = setInterval(
      () => this.checkPaymentStatus(orderId, token, isReturn, providerPaymentId),
      5000,
    );
  }

  private stopPaymentPolling(): void {
    if (this.paymentPolling) clearInterval(this.paymentPolling);
    this.paymentPolling = undefined;
    this.paymentPollInFlight = false;
  }

  private checkPaymentStatus(
    orderId: string,
    token: string,
    isReturn = false,
    providerPaymentId?: string,
  ): void {
    if (this.paymentPollInFlight) return;
    if (this.paymentPollAttempts >= 60) {
      this.stopPaymentPolling();
      return;
    }
    this.paymentPollInFlight = true;
    this.paymentPollAttempts += 1;
    this.storefrontService.getCheckoutStatus(orderId, token, providerPaymentId).pipe(
      finalize(() => this.paymentPollInFlight = false),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (status) => {
        this.checkoutStatus.set(status);
        this.returnOrderCode.set(status.orderCode);
        if (status.paymentStatus === 'PAID') {
          if (isReturn) this.paymentReturnStatus.set('success');
          this.stopPaymentPolling();
        } else if (
          status.paymentStatus === 'FAILED' ||
          status.paymentStatus === 'EXPIRED' ||
          status.paymentStatus === 'REFUNDED'
        ) {
          if (isReturn) this.paymentReturnStatus.set('failure');
          this.stopPaymentPolling();
        } else if (isReturn) {
          this.paymentReturnStatus.set('pending');
        }
      },
      error: () => {
        if (isReturn) this.showToast('Não foi possível consultar o pagamento.', 'error');
      },
    });
  }

  private showToast(message: string, type: 'success' | 'error' | 'warning' | 'cart' = 'success'): void {
    this.snackBar.open(message, type === 'cart' ? undefined : 'OK', {
      duration: type === 'cart' ? 1800 : 3500,
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
      panelClass: type === 'cart'
        ? 'havoc-snackbar-cart'
        : type === 'error'
        ? 'havoc-snackbar-error'
        : type === 'warning'
          ? 'havoc-snackbar-warning'
          : 'havoc-snackbar-success'
    });
  }
}
