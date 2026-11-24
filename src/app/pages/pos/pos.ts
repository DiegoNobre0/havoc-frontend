import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule } from 'lucide-angular';
import { NgxCurrencyDirective } from 'ngx-currency';
import { NgxMaskDirective } from 'ngx-mask';
import {
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  switchMap,
  takeUntil,
} from 'rxjs';

import { CatalogProduct } from '../../models/product.models';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog';
import { AuthService } from '../../services/auth.service';
import { CatalogService } from '../../services/catalog.service';
import {
  createFiscalIdempotencyKey,
  FiscalDocument,
  FiscalService,
} from '../../services/fiscal.service';
import {
  CreatePosSaleRequest,
  PosPaymentMethod,
  PosSaleResponse,
  PosService,
  PosSession,
} from '../../services/pos.service';

interface PosKit {
  id: string;
  name: string;
  finalPrice: number | string;
  imageUrl?: string | null;
  isActive?: boolean;
  items?: Array<{ quantity: number; product?: { name: string } }>;
}

interface LastPosSale {
  id: string;
  code: string;
  total: number | string;
}

export interface PosCartItem {
  type: 'product' | 'kit';
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  stock: number | null;
  imageUrl?: string | null;
  sku?: string | null;
}

type PosModal = 'open' | 'supply' | 'withdrawal' | 'close' | 'payment' | null;

type PaymentForm = FormGroup<{
  method: FormControl<PosPaymentMethod>;
  amount: FormControl<number>;
  amountTendered: FormControl<number>;
  installments: FormControl<number>;
  authorizationCode: FormControl<string>;
}>;

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LucideAngularModule,
    NgxCurrencyDirective,
    NgxMaskDirective,
    MatSelectModule,
    MatOptionModule,
  ],
  templateUrl: './pos.html',
  styleUrl: './pos.scss',
})
export class Pos implements OnInit, OnDestroy {
  @ViewChild('scannerInput') private scannerInput?: ElementRef<HTMLInputElement>;

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly posService = inject(PosService);
  private readonly catalogService = inject(CatalogService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly fiscalService = inject(FiscalService);
  private readonly destroy$ = new Subject<void>();

  readonly session = signal<PosSession | null>(null);
  readonly cart = signal<PosCartItem[]>([]);
  readonly searchResults = signal<CatalogProduct[]>([]);
  readonly kits = signal<PosKit[]>([]);
  readonly activeModal = signal<PosModal>(null);
  readonly isLoadingSession = signal(true);
  readonly isSearching = signal(false);
  readonly isLoadingKits = signal(false);
  readonly isResolvingScanner = signal(false);
  readonly isSubmitting = signal(false);
  readonly customerExpanded = signal(false);
  readonly lastSaleNumber = signal<string | null>(null);
  readonly lastSale = signal<LastPosSale | null>(null);
  readonly lastSaleHasKit = signal(false);
  readonly fiscalDocument = signal<FiscalDocument | null>(null);
  readonly isIssuingFiscal = signal(false);
  readonly isRetryingFiscal = signal(false);
  readonly isReconcilingFiscal = signal(false);
  readonly downloadingDocument = signal<'pdf' | 'xml' | null>(null);
  readonly paymentVersion = signal(0);
  readonly paymentMethods: Array<{ value: PosPaymentMethod; label: string }> = [
    { value: 'CASH', label: 'Dinheiro' },
    { value: 'PIX', label: 'Pix' },
    { value: 'DEBIT_CARD', label: 'Cartão de débito' },
    { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  ];
  readonly installments = Array.from({ length: 24 }, (_, index) => index + 1);
  readonly currencyMaskOptions = {
    prefix: '',
    thousands: '.',
    decimal: ',',
    align: 'left',
    allowNegative: false,
  };

  readonly scannerForm = this.fb.group({ code: [''] });
  readonly searchControl = this.fb.control('');
  readonly saleForm = this.fb.group({
    discount: [0, [Validators.min(0)]],
    notes: [''],
  });
  readonly customerForm = this.fb.group({
    name: [''],
    cpf: [''],
    phone: [''],
  });
  readonly openForm = this.fb.group({
    openingBalance: [0, [Validators.required, Validators.min(0)]],
    notes: [''],
  });
  readonly movementForm = this.fb.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    description: ['', [Validators.required, Validators.maxLength(160)]],
  });
  readonly closeForm = this.fb.group({
    countedBalance: [0, [Validators.required, Validators.min(0)]],
    notes: [''],
  });
  readonly paymentForm = this.fb.group({
    payments: this.fb.array<PaymentForm>([]),
    issueNfce: [false],
  });

  private readonly discountValue = toSignal(this.saleForm.controls.discount.valueChanges, {
    initialValue: 0,
  });
  private readonly countedBalanceValue = toSignal(
    this.closeForm.controls.countedBalance.valueChanges,
    { initialValue: 0 },
  );
  private idempotencyKey: string | null = null;

  readonly subtotal = computed(() =>
    this.cart().reduce((total, item) => total + item.unitPrice * item.quantity, 0),
  );
  readonly discount = computed(() =>
    Math.min(Math.max(Number(this.discountValue()) || 0, 0), this.subtotal()),
  );
  readonly total = computed(() => Math.max(0, this.subtotal() - this.discount()));
  readonly totalItems = computed(() =>
    this.cart().reduce((total, item) => total + item.quantity, 0),
  );
  readonly hasKit = computed(() => this.cart().some((item) => item.type === 'kit'));
  readonly expectedBalance = computed(() => {
    const current = this.session();
    return Number(current?.expectedBalance ?? 0);
  });
  readonly closeDifference = computed(
    () => (Number(this.countedBalanceValue()) || 0) - this.expectedBalance(),
  );
  readonly paymentTotal = computed(() => {
    this.paymentVersion();
    return this.payments.controls.reduce(
      (total, payment) => total + (Number(payment.controls.amount.value) || 0),
      0,
    );
  });
  readonly paymentRemaining = computed(() => this.total() - this.paymentTotal());
  readonly changeDue = computed(() => {
    this.paymentVersion();
    return this.payments.controls.reduce((total, payment) => {
      if (payment.controls.method.value !== 'CASH') return total;
      return (
        total +
        Math.max(
          0,
          Number(payment.controls.amountTendered.value) - Number(payment.controls.amount.value),
        )
      );
    }, 0);
  });
  readonly operatorName = computed(
    () =>
      this.session()?.openedBy?.name ||
      this.session()?.operator?.name ||
      this.session()?.operatorName ||
      this.authService.currentUser()?.name ||
      'Operador',
  );

  get payments(): FormArray<PaymentForm> {
    return this.paymentForm.controls.payments;
  }

  ngOnInit(): void {
    this.loadCurrentSession();
    this.loadKits();

    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const search = term.trim();
          if (search.length < 2) {
            this.isSearching.set(false);
            return of({ data: [], meta: { total: 0, page: 1, limit: 12, totalPages: 0 } });
          }
          this.isSearching.set(true);
          return this.catalogService
            .getProducts({ page: 1, limit: 12, search, isActive: true })
            .pipe(
              catchError(() => {
                this.showError('Não foi possível buscar produtos no catálogo.');
                return of({
                  data: [],
                  meta: { total: 0, page: 1, limit: 12, totalPages: 0 },
                });
              }),
            );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((response) => {
        this.searchResults.set(response.data);
        this.isSearching.set(false);
      });

    this.saleForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.saleChanged());
    this.customerForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.saleChanged());
    this.paymentForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.paymentVersion.update((value) => value + 1);
      this.idempotencyKey = null;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCurrentSession(): void {
    this.isLoadingSession.set(true);
    this.posService.getCurrentSession().subscribe({
      next: (session) => {
        this.session.set(session);
        this.isLoadingSession.set(false);
        if (session) this.focusScanner();
      },
      error: (error) => {
        this.isLoadingSession.set(false);
        this.showError(this.errorMessage(error, 'Não foi possível consultar o caixa atual.'));
      },
    });
  }

  loadKits(): void {
    this.isLoadingKits.set(true);
    this.catalogService.getKits({ isActive: true }).subscribe({
      next: (response: { data?: PosKit[] } | PosKit[]) => {
        const kits = Array.isArray(response) ? response : response.data || [];
        this.kits.set(kits.filter((kit) => kit.isActive !== false));
        this.isLoadingKits.set(false);
      },
      error: () => {
        this.kits.set([]);
        this.isLoadingKits.set(false);
        this.showError('Não foi possível carregar os kits.');
      },
    });
  }

  submitScanner(): void {
    const code = this.scannerForm.controls.code.value.trim();
    if (!code || !this.session() || this.isResolvingScanner()) return;

    this.isResolvingScanner.set(true);
    this.catalogService.resolveProduct(code).subscribe({
      next: (product) => {
        this.addProduct(product);
        this.scannerForm.reset({ code: '' });
        this.isResolvingScanner.set(false);
        this.focusScanner();
      },
      error: (error) => {
        this.isResolvingScanner.set(false);
        this.showError(this.errorMessage(error, `Produto não encontrado para o código "${code}".`));
        this.focusScanner();
      },
    });
  }

  addProduct(product: CatalogProduct): void {
    const stock = this.productStock(product);
    this.addCartItem({
      type: 'product',
      id: product.id,
      name: product.name,
      unitPrice: Number(product.price),
      quantity: 1,
      stock,
      imageUrl: product.imageUrl,
      sku: product.sku,
    });
  }

  addKit(kit: PosKit): void {
    this.addCartItem({
      type: 'kit',
      id: kit.id,
      name: kit.name,
      unitPrice: Number(kit.finalPrice),
      quantity: 1,
      stock: null,
      imageUrl: kit.imageUrl,
      sku: 'KIT',
    });
  }

  addCartItem(item: PosCartItem): void {
    if (!this.session()) {
      this.showError('Abra o caixa antes de adicionar itens.');
      return;
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      this.showError('Este item não possui preço de venda válido.');
      return;
    }
    if (item.type === 'product' && item.stock !== null && item.stock < 1) {
      this.showError(`${item.name} está sem estoque disponível.`);
      return;
    }

    const current = this.cart().find(
      (cartItem) => cartItem.id === item.id && cartItem.type === item.type,
    );
    if (current) {
      this.changeQuantity(current, 1);
      return;
    }
    this.cart.update((items) => [...items, item]);
    this.saleChanged();
  }

  changeQuantity(item: PosCartItem, delta: number): void {
    const nextQuantity = item.quantity + delta;
    if (nextQuantity < 1) {
      this.removeItem(item);
      return;
    }
    if (item.type === 'product' && item.stock !== null && nextQuantity > item.stock) {
      this.showError(`Estoque disponível de ${item.name}: ${item.stock} unidade(s).`);
      return;
    }
    this.cart.update((items) =>
      items.map((current) =>
        current.id === item.id && current.type === item.type
          ? { ...current, quantity: nextQuantity }
          : current,
      ),
    );
    this.saleChanged();
  }

  removeItem(item: PosCartItem): void {
    this.cart.update((items) =>
      items.filter((current) => current.id !== item.id || current.type !== item.type),
    );
    this.saleChanged();
  }

  clearCart(): void {
    this.cart.set([]);
    this.saleForm.reset({ discount: 0, notes: '' });
    this.customerForm.reset({ name: '', cpf: '', phone: '' });
    this.lastSaleNumber.set(null);
    this.saleChanged();
    this.focusScanner();
  }

  openModal(modal: Exclude<PosModal, null>): void {
    if (modal !== 'open' && modal !== 'payment' && !this.session()) return;

    if (modal === 'open') this.openForm.reset({ openingBalance: 0, notes: '' });
    if (modal === 'supply' || modal === 'withdrawal') {
      this.movementForm.reset({ amount: 0, description: '' });
    }
    if (modal === 'close') {
      this.closeForm.reset({ countedBalance: this.expectedBalance(), notes: '' });
    }
    if (modal === 'payment') {
      if (!this.cart().length || this.total() <= 0) {
        this.showError('Adicione itens com total maior que zero para finalizar a venda.');
        return;
      }
      this.payments.clear();
      this.payments.push(this.createPayment('CASH', this.total()));
      this.paymentForm.controls.issueNfce.setValue(false);
    }
    this.activeModal.set(modal);
  }

  closeModal(): void {
    if (this.isSubmitting()) return;
    this.activeModal.set(null);
    this.focusScanner();
  }

  submitOpenSession(): void {
    if (this.openForm.invalid) {
      this.openForm.markAllAsTouched();
      return;
    }
    const value = this.openForm.getRawValue();
    this.runSessionAction(
      this.posService.openSession({
        openingBalance: Number(value.openingBalance),
        ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
      }),
      'Caixa aberto com sucesso.',
    );
  }

  submitMovement(): void {
    const session = this.session();
    const modal = this.activeModal();
    if (!session || (modal !== 'supply' && modal !== 'withdrawal')) return;
    if (this.movementForm.invalid) {
      this.movementForm.markAllAsTouched();
      return;
    }
    const value = this.movementForm.getRawValue();
    const payload = { amount: Number(value.amount), description: value.description.trim() };
    const request =
      modal === 'supply'
        ? this.posService.supply(session.id, payload)
        : this.posService.withdrawal(session.id, payload);
    this.runSessionAction(
      request,
      modal === 'supply' ? 'Suprimento registrado.' : 'Sangria registrada.',
    );
  }

  submitCloseSession(): void {
    const session = this.session();
    if (!session || this.closeForm.invalid) {
      this.closeForm.markAllAsTouched();
      return;
    }
    const value = this.closeForm.getRawValue();
    this.isSubmitting.set(true);
    this.posService
      .closeSession(session.id, {
        countedBalance: Number(value.countedBalance),
        ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.activeModal.set(null);
          this.session.set(null);
          this.clearCart();
          this.showSuccess('Caixa fechado com sucesso.');
        },
        error: (error) => {
          this.isSubmitting.set(false);
          this.showError(this.errorMessage(error, 'Não foi possível fechar o caixa.'));
        },
      });
  }

  addPayment(): void {
    if (this.payments.length >= 10) return;
    this.payments.push(this.createPayment('PIX', Math.max(0, this.paymentRemaining())));
  }

  removePayment(index: number): void {
    if (this.payments.length <= 1) return;
    this.payments.removeAt(index);
  }

  paymentMethodChanged(index: number): void {
    const payment = this.payments.at(index);
    if (payment.controls.method.value !== 'CREDIT_CARD') {
      payment.controls.installments.setValue(1);
    }
    if (payment.controls.method.value === 'CASH') {
      payment.controls.amountTendered.setValue(payment.controls.amount.value);
    }
  }

  completeRemaining(index: number): void {
    const payment = this.payments.at(index);
    payment.controls.amount.setValue(
      Math.max(0, Number(payment.controls.amount.value) + this.paymentRemaining()),
    );
    if (payment.controls.method.value === 'CASH') {
      payment.controls.amountTendered.setValue(payment.controls.amount.value);
    }
  }

  submitSale(): void {
    if (!this.session()) {
      this.showError('O caixa não está aberto.');
      return;
    }
    if (!this.paymentIsValid()) {
      this.paymentForm.markAllAsTouched();
      this.showError('Revise os pagamentos. A soma deve ser exatamente igual ao total da venda.');
      return;
    }

    const payload = this.buildSalePayload();
    this.idempotencyKey ||= this.generateIdempotencyKey();
    this.isSubmitting.set(true);
    this.posService.createSale(payload, this.idempotencyKey).subscribe({
      next: (sale) => this.saleCompleted(sale),
      error: (error) => {
        this.isSubmitting.set(false);
        this.showError(
          this.errorMessage(error, 'Não foi possível concluir a venda. Tente novamente.'),
        );
      },
    });
  }

  buildSalePayload(): CreatePosSaleRequest {
    const customer = this.customerForm.getRawValue();
    const sale = this.saleForm.getRawValue();
    const hasCustomer = Object.values(customer).some((value) => value.trim());

    return {
      ...(hasCustomer
        ? {
            customer: {
              ...(customer.name.trim() ? { name: customer.name.trim() } : {}),
              ...(customer.cpf.trim() ? { cpf: customer.cpf.trim() } : {}),
              ...(customer.phone.trim() ? { phone: customer.phone.trim() } : {}),
            },
          }
        : {}),
      items: this.cart().map((item) => ({
        type: item.type,
        id: item.id,
        quantity: item.quantity,
      })),
      ...(this.discount() > 0 ? { discount: this.money(this.discount()) } : {}),
      ...(sale.notes.trim() ? { notes: sale.notes.trim() } : {}),
      payments: this.payments.controls.map((payment) => {
        const value = payment.getRawValue();
        return {
          method: value.method,
          amount: this.money(value.amount),
          ...(value.method === 'CASH' ? { amountTendered: this.money(value.amountTendered) } : {}),
          ...(value.method === 'CREDIT_CARD' ? { installments: value.installments } : {}),
          ...(value.authorizationCode.trim()
            ? { authorizationCode: value.authorizationCode.trim() }
            : {}),
        };
      }),
    };
  }

  paymentIsValid(): boolean {
    if (this.payments.length < 1 || this.payments.length > 10 || this.paymentForm.invalid) {
      return false;
    }
    if (this.toCents(this.paymentTotal()) !== this.toCents(this.total())) return false;
    if (
      this.payments.controls.filter((payment) => payment.controls.method.value === 'CASH').length >
      1
    ) {
      return false;
    }
    return this.payments.controls.every((payment) => {
      const value = payment.getRawValue();
      if (value.amount <= 0) return false;
      if (value.method === 'CASH' && value.amountTendered < value.amount) return false;
      return (
        value.method !== 'CREDIT_CARD' || (value.installments >= 1 && value.installments <= 24)
      );
    });
  }

  productStock(product: CatalogProduct): number | null {
    const stock = product.stock ?? product.stock_qty;
    return stock === null || stock === undefined ? null : Math.max(0, Number(stock));
  }

  formatCurrency(value: number | string | null | undefined): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(value) || 0,
    );
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  issueNfce(): void {
    const sale = this.lastSale();
    if (!sale || this.fiscalDocument() || this.isIssuingFiscal() || this.isRetryingFiscal()) return;
    this.isIssuingFiscal.set(true);
    this.fiscalDocument.set({
      id: '',
      status: 'PROCESSING',
      canRetry: false,
      pdfAvailable: false,
      xmlAvailable: false,
      cancellationStatus: null,
      cancellationPdfAvailable: false,
      cancellationXmlAvailable: false,
    });
    this.fiscalService.issueOrder(sale.id).subscribe({
      next: (document) => {
        this.fiscalDocument.set(document);
        this.isIssuingFiscal.set(false);
        if (this.isFiscalAuthorized(document)) {
          this.showSuccess('NFC-e autorizada pela SEFAZ.');
        } else if (this.isFiscalRejected(document)) {
          this.showError(document.sefazReason || 'NFC-e rejeitada pela SEFAZ.');
        }
      },
      error: (error) => {
        if (!this.isAmbiguousRequestError(error)) this.fiscalDocument.set(null);
        this.isIssuingFiscal.set(false);
        this.showError(this.errorMessage(error, 'Não foi possível emitir a NFC-e.'));
      },
    });
  }

  requestFiscalRetry(): void {
    const sale = this.lastSale();
    const document = this.fiscalDocument();
    if (
      !sale ||
      !document?.canRetry ||
      !this.isFiscalRejected(document) ||
      this.isIssuingFiscal() ||
      this.isRetryingFiscal()
    ) {
      return;
    }
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
        if (confirmed) this.retryNfce(sale.id);
      });
  }

  downloadFiscal(kind: 'pdf' | 'xml'): void {
    const document = this.fiscalDocument();
    const sale = this.lastSale();
    if (!document?.id || !sale || this.downloadingDocument()) return;
    this.downloadingDocument.set(kind);
    const request =
      kind === 'pdf'
        ? this.fiscalService.downloadPdf(sale.id)
        : this.fiscalService.downloadXml(sale.id);
    request.subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download =
          kind === 'pdf'
            ? `danfce-${this.lastSale()?.code}.pdf`
            : `nfce-${this.lastSale()?.code}.xml`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.downloadingDocument.set(null);
      },
      error: (error) => {
        this.downloadingDocument.set(null);
        this.showError(
          this.errorMessage(error, `Não foi possível baixar o arquivo ${kind.toUpperCase()}.`),
        );
      },
    });
  }

  reconcileFiscal(): void {
    const sale = this.lastSale();
    if (
      !sale ||
      !this.fiscalDocument() ||
      this.isReconcilingFiscal() ||
      this.isIssuingFiscal() ||
      this.isRetryingFiscal()
    ) {
      return;
    }
    this.isReconcilingFiscal.set(true);
    this.fiscalService.reconcileOrder(sale.id).subscribe({
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

  isFiscalAuthorized(document: FiscalDocument | null): boolean {
    const status = document?.status.toUpperCase() ?? '';
    return status === 'AUTHORIZED' || status === 'AUTORIZADO';
  }

  isFiscalRejected(document: FiscalDocument | null): boolean {
    const status = document?.status.toUpperCase() ?? '';
    return status === 'REJECTED' || status === 'REJEITADO' || status === 'DENIED';
  }

  isFiscalCancelled(document: FiscalDocument | null): boolean {
    return (
      document?.status.toUpperCase() === 'CANCELLED' || document?.cancellationStatus === 'CONFIRMED'
    );
  }

  canReconcileFiscal(document: FiscalDocument | null): boolean {
    if (!document) return false;
    const status = document.status.toUpperCase();
    return (
      status === 'AUTHORIZED' ||
      status === 'AUTORIZADO' ||
      status === 'PROCESSING' ||
      status === 'UNKNOWN' ||
      document.cancellationStatus === 'PROCESSING' ||
      document.cancellationStatus === 'UNKNOWN'
    );
  }

  private createPayment(method: PosPaymentMethod, amount: number): PaymentForm {
    return this.fb.group({
      method: [method, Validators.required],
      amount: [this.money(amount), [Validators.required, Validators.min(0.01)]],
      amountTendered: [this.money(amount), [Validators.min(0)]],
      installments: [1, [Validators.min(1), Validators.max(24)]],
      authorizationCode: [''],
    });
  }

  private runSessionAction(
    request: ReturnType<PosService['openSession']>,
    successMessage: string,
  ): void {
    this.isSubmitting.set(true);
    request.subscribe({
      next: (session) => {
        this.session.set(session);
        this.isSubmitting.set(false);
        this.activeModal.set(null);
        this.showSuccess(successMessage);
        this.focusScanner();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showError(this.errorMessage(error, 'Não foi possível concluir a operação de caixa.'));
      },
    });
  }

  private saleCompleted(sale: PosSaleResponse): void {
    const number = sale.order.code;
    const saleHasKit = this.hasKit();
    this.isSubmitting.set(false);
    this.activeModal.set(null);
    this.idempotencyKey = null;
    this.cart.set([]);
    this.saleForm.reset({ discount: 0, notes: '' });
    this.customerForm.reset({ name: '', cpf: '', phone: '' });
    this.lastSaleNumber.set(String(number));
    this.lastSale.set(sale.order);
    this.lastSaleHasKit.set(saleHasKit);
    this.fiscalDocument.set(null);
    this.showSuccess(`Venda ${number} concluída com sucesso.`);
    if (this.paymentForm.controls.issueNfce.value) this.issueNfce();
    this.loadCurrentSession();
    this.focusScanner();
  }

  private saleChanged(): void {
    this.idempotencyKey = null;
    this.lastSaleNumber.set(null);
    this.lastSale.set(null);
    this.lastSaleHasKit.set(false);
    this.fiscalDocument.set(null);
  }

  private focusScanner(): void {
    setTimeout(() => this.scannerInput?.nativeElement.focus());
  }

  private generateIdempotencyKey(): string {
    return createFiscalIdempotencyKey();
  }

  private retryNfce(orderId: string): void {
    if (this.isIssuingFiscal() || this.isRetryingFiscal()) return;
    this.isRetryingFiscal.set(true);
    this.fiscalService.retryOrder(orderId, this.generateIdempotencyKey()).subscribe({
      next: (document) => {
        this.fiscalDocument.set(document);
        this.isRetryingFiscal.set(false);
        if (this.isFiscalAuthorized(document)) {
          this.showSuccess('NFC-e autorizada pela SEFAZ.');
        } else {
          this.showSuccess('Reemissão da NFC-e solicitada com sucesso.');
        }
      },
      error: (error) => {
        this.isRetryingFiscal.set(false);
        this.showError(this.errorMessage(error, 'Não foi possível reemitir a NFC-e.'));
      },
    });
  }

  private money(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  private toCents(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100);
  }

  private isAmbiguousRequestError(error: unknown): boolean {
    const status = (error as { status?: number })?.status;
    return !status || status >= 500;
  }

  private errorMessage(error: unknown, fallback: string): string {
    const response = error as { error?: { message?: string | string[] } };
    const message = response?.error?.message;
    return Array.isArray(message) ? message.join(' ') : message || fallback;
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Fechar', {
      duration: 5000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['havoc-snackbar-error'],
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'OK', {
      duration: 3500,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['havoc-snackbar-success'],
    });
  }
}
