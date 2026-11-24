import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import { debounceTime, distinctUntilChanged, Subject, Subscription } from 'rxjs';
import { CatalogService } from '../../../services/catalog.service';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../components/confirm-dialog/confirm-dialog';
import { NgxCurrencyDirective } from 'ngx-currency';
import {
  BarcodeLookupLabelFacts,
  CatalogCategory,
  CatalogProduct,
  ProductFilters,
  SaveProductRequest,
  StockOperation,
  StockSummary,
} from '../../../models/product.models';
import { SupplementFacts } from '../../../models/supplement-facts.models';

export function isValidGtin(value: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;

  const digits = value.split('').map(Number);
  const checkDigit = digits.pop()!;
  const sum = digits.reduce((total, digit, index) => {
    const positionFromRight = digits.length - index;
    return total + digit * (positionFromRight % 2 === 1 ? 3 : 1);
  }, 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}

export const barcodeValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  return !value || isValidGtin(value) ? null : { invalidBarcode: true };
};

export function fiscalDigitsValidator(length: number, optional = true): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const digits = String(control.value ?? '').replace(/\D/g, '');
    if (!digits && optional) return null;
    return digits.length === length ? null : { fiscalDigits: { requiredLength: length } };
  };
}

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule,
    MatOptionModule,
    MatSelectModule,
    MatDialogModule,
    NgxCurrencyDirective,
  ],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class Products implements OnInit, OnDestroy {
  private catalogService = inject(CatalogService);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;
  private formSubscriptions = new Subscription();
  private factsRefreshTimer?: ReturnType<typeof setTimeout>;

  // ─── ESTADOS DA LISTAGEM ────────────────────────────────────
  products = signal<CatalogProduct[]>([]);
  categories = signal<CatalogCategory[]>([]);
  isLoading = signal<boolean>(true);

  // ─── PAGINAÇÃO E FILTROS ────────────────────────────────────
  searchTerm = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus = signal<string>('');
  currentPage = signal<number>(1);
  totalPages = signal<number>(1);
  totalItems = signal<number>(0);
  lowStockCount = signal<number>(0);
  expiredBatchCount = signal<number>(0);
  expiringBatchCount = signal<number>(0);
  lowStockOnly = signal<boolean>(false);

  // ─── ESTADOS GERAIS DE MODAIS ───────────────────────────────
  isSaving = signal<boolean>(false);
  isDeleting = signal<boolean>(false);
  isImportingPdf = signal<boolean>(false); // NOVO SINAL

  // ─── MODAL: MOVIMENTAR ESTOQUE ──────────────────────────────
  isStockModalOpen = signal<boolean>(false);
  selectedProduct = signal<CatalogProduct | null>(null);

  stockOperations: Array<{ label: string; value: StockOperation }> = [
    { label: 'Entrada', value: 'IN' },
    { label: 'Saída', value: 'OUT' },
    { label: 'Balanço', value: 'ADJUST' },
  ];

  stockForm = this.fb.nonNullable.group({
    operation: ['IN', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    reason: [''],
    batchCode: [''],
    expirationDate: [''],
    unitCost: [0, Validators.min(0)],
  });

  // ─── SINAIS DE CONTROLE DE IMAGEM ───────────────────────────
  selectedFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);
  suggestedImageUrl = signal<string | null>(null);

  // ─── MODAL: CRIAR / EDITAR PRODUTO ──────────────────────────
  isModalOpen = signal<boolean>(false);
  isEditing = signal<boolean>(false);
  currentId = signal<string | null>(null);
  showFiscal = signal<boolean>(false);
  currentFacts = signal<SupplementFacts | null>(null);
  syncState = signal<'idle' | 'loading' | 'pending' | 'success' | 'error'>('idle');
  syncMessage = signal<string>('');
  isLookingUpBarcode = signal<boolean>(false);
  barcodeLookupMessage = signal<string | null>(null);
  barcodeLookupError = signal<boolean>(false);
  barcodeLookupSourceLabel = signal<string | null>(null);
  pendingLabelFacts = signal<BarcodeLookupLabelFacts | null>(null);
  pendingLabelSource = signal<{
    sourceUrl?: string | null;
    sourceTitle?: string | null;
    manufacturerDomain?: string | null;
  } | null>(null);

  productForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    brand: [''],
    sizeLabel: [''],
    flavor: [''],
    sku: [''],
    barcode: ['', barcodeValidator],
    controlsBatch: [false],
    unit: ['UN'],
    category_ids: [[] as string[]],
    description: [''],
    price: [0, [Validators.required, Validators.min(0.01)]],
    compareAtPrice: [0],
    cost_price: [0],
    price_wholesale: [0],
    stock_qty: [0, Validators.min(0)],
    stock_min: [0, Validators.min(0)],
    initialBatchCode: [''],
    initialBatchExpirationDate: [''],
    ncm: ['', fiscalDigitsValidator(8)],
    cfop: ['', fiscalDigitsValidator(4)],
    cest: ['', fiscalDigitsValidator(7)],
    origin: ['0'],
    csosn: ['102'],
    pisCst: ['99'],
    cofinsCst: ['99'],
    taxableUnit: ['UN'],
    manufacturer: [''],
    isActive: [true],
  });

  calculatedMargin = computed(() => {
    const price = this.productForm.value.price || 0;
    const cost = this.productForm.value.cost_price || 0;
    if (price <= 0 || cost <= 0) return null;
    return ((price - cost) / price) * 100;
  });

  ngOnInit() {
    this.loadCategories();
    this.loadProducts();
    this.loadStockSummary();

    this.formSubscriptions.add(
      this.productForm.controls.controlsBatch.valueChanges.subscribe(() =>
        this.updateInitialBatchValidators(),
      ),
    );
    this.formSubscriptions.add(
      this.productForm.controls.stock_qty.valueChanges.subscribe(() =>
        this.updateInitialBatchValidators(),
      ),
    );
    this.formSubscriptions.add(
      this.stockForm.controls.operation.valueChanges.subscribe(() => this.updateStockValidators()),
    );

    this.searchSubscription = this.searchSubject
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage.set(1);
        this.loadProducts();
      });
  }

  onSearchChange(value: string) {
    this.searchTerm.set(value);
    this.searchSubject.next(value);
  }

  ngOnDestroy() {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
    this.formSubscriptions.unsubscribe();
    if (this.factsRefreshTimer) clearTimeout(this.factsRefreshTimer);
  }

  loadCategories() {
    this.catalogService.getCategories().subscribe((res: unknown) => {
      const value =
        typeof res === 'object' && res !== null && 'data' in res
          ? (res as { data: unknown }).data
          : res;
      this.categories.set(Array.isArray(value) ? value.filter(this.isCatalogCategory) : []);
    });
  }

  loadProducts(silent = false) {
    if (!silent) this.isLoading.set(true);
    if (this.factsRefreshTimer) clearTimeout(this.factsRefreshTimer);
    const filters: ProductFilters = {
      page: this.currentPage(),
      limit: 10,
      search: this.searchTerm(),
    };

    if (this.selectedCategory()) filters.categoryId = this.selectedCategory();
    if (this.selectedStatus()) filters.isActive = this.selectedStatus() === 'true';
    if (this.lowStockOnly()) filters.lowStock = true;

    this.catalogService.getProducts(filters).subscribe({
      next: (res) => {
        this.products.set(res.data);
        const currentProduct = res.data.find((product) => product.id === this.currentId());
        if (currentProduct && this.isModalOpen()) {
          this.currentFacts.set(currentProduct.supplementFacts ?? null);
          const status = currentProduct.supplementFacts?.status;
          if (this.syncState() === 'pending' && status !== 'PENDING' && status !== 'PROCESSING') {
            const matched = status === 'SOURCE_MATCHED';
            this.syncState.set(matched ? 'success' : 'error');
            this.syncMessage.set(
              matched
                ? 'Busca concluída. A fonte oficial foi confirmada.'
                : 'A busca terminou sem uma fonte oficial exata confirmada.',
            );
          }
        }

        this.totalPages.set(res.meta.totalPages);
        this.totalItems.set(res.meta.total);
        this.isLoading.set(false);
        if (
          res.data.some((product) =>
            ['PENDING', 'PROCESSING'].includes(product.supplementFacts?.status ?? ''),
          )
        ) {
          this.factsRefreshTimer = setTimeout(() => this.loadProducts(true), 5_000);
        }
      },
      error: () => {
        this.isLoading.set(false);
        if (
          this.products().some((product) =>
            ['PENDING', 'PROCESSING'].includes(product.supplementFacts?.status ?? ''),
          )
        ) {
          this.factsRefreshTimer = setTimeout(() => this.loadProducts(true), 5_000);
        }
      },
    });
  }

  onSearch() {
    this.currentPage.set(1);
    this.loadProducts();
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadProducts();
    }
  }

  filterByLowStock() {
    this.lowStockOnly.update((active) => !active);
    this.currentPage.set(1);
    this.loadProducts();
  }

  loadStockSummary() {
    this.catalogService.getStockSummary().subscribe({
      next: (summary: StockSummary) => {
        this.lowStockCount.set(summary.lowStockCount);
        this.expiredBatchCount.set(summary.expiredBatchCount);
        this.expiringBatchCount.set(summary.expiringBatchCount);
      },
      error: () => this.showToast('Não foi possível atualizar o resumo do estoque.', true),
    });
  }

  toggleProduct(product: CatalogProduct) {
    const newStatus = !product.isActive;
    this.products.update((prods) =>
      prods.map((p) => (p.id === product.id ? { ...p, isActive: newStatus } : p)),
    );

    this.catalogService.pauseProduct(product.id, newStatus).subscribe({
      error: () => {
        this.showToast('Erro ao atualizar status. Revertendo...', true);
        this.products.update((prods) =>
          prods.map((p) => (p.id === product.id ? { ...p, isActive: !newStatus } : p)),
        );
      },
    });
  }

  toggleFiscal() {
    this.showFiscal.update((v) => !v);
  }

  openModal(product?: CatalogProduct) {
    this.imagePreview.set(null);
    this.selectedFile.set(null);
    this.suggestedImageUrl.set(null);
    this.currentFacts.set(null);
    this.syncState.set('idle');
    this.syncMessage.set('');
    this.isLookingUpBarcode.set(false);
    this.barcodeLookupMessage.set(null);
    this.barcodeLookupError.set(false);
    this.barcodeLookupSourceLabel.set(null);
    this.pendingLabelFacts.set(null);
    this.pendingLabelSource.set(null);
    this.showFiscal.set(false);

    if (product) {
      this.isEditing.set(true);
      this.currentId.set(product.id);
      if (product.ncm || product.cfop || product.cest) this.showFiscal.set(true);

      this.imagePreview.set(product.imageUrl || null);
      this.currentFacts.set(product.supplementFacts ?? null);

      this.productForm.reset({
        name: product.name,
        brand: product.brand ?? '',
        sizeLabel: product.sizeLabel ?? '',
        flavor: product.flavor ?? '',
        sku: product.sku ?? '',
        barcode:
          product.barcodes?.find((barcode) => barcode.isPrimary)?.code ??
          product.barcodes?.[0]?.code ??
          '',
        controlsBatch: product.controlsBatch ?? false,
        unit: product.unit || 'UN',
        category_ids: product.categories?.map((category) => category.id) ?? [],
        description: product.description || '',
        price: Number(product.price),
        compareAtPrice: Number(product.compareAtPrice ?? 0),
        cost_price: Number(product.cost_price ?? product.costPrice ?? 0),
        price_wholesale: Number(product.price_wholesale ?? product.priceWholesale ?? 0),
        stock_qty: Number(product.stock_qty ?? product.stock ?? 0),
        stock_min: Number(product.stock_min ?? product.stockMin ?? 0),
        initialBatchCode: '',
        initialBatchExpirationDate: '',
        ncm: product.ncm ?? '',
        cfop: product.cfop ?? '',
        cest: product.cest ?? '',
        origin: String(product.origin ?? 0),
        csosn: product.csosn ?? '102',
        pisCst: product.pisCst ?? '99',
        cofinsCst: product.cofinsCst ?? '99',
        taxableUnit: product.taxableUnit ?? 'UN',
        manufacturer: product.manufacturer ?? product.supplementFacts?.manufacturer ?? '',
        isActive: product.isActive,
      });
    } else {
      this.isEditing.set(false);
      this.currentId.set(null);
      this.productForm.reset({
        name: '',
        brand: '',
        sizeLabel: '',
        flavor: '',
        description: '',
        isActive: true,
        unit: 'UN',
        price: 0,
        compareAtPrice: 0,
        cost_price: 0,
        price_wholesale: 0,
        stock_qty: 0,
        stock_min: 0,
        category_ids: [],
        ncm: '',
        cfop: '',
        cest: '',
        origin: '0',
        csosn: '102',
        pisCst: '99',
        cofinsCst: '99',
        taxableUnit: 'UN',
        manufacturer: '',
        sku: '',
        barcode: '',
        controlsBatch: false,
        initialBatchCode: '',
        initialBatchExpirationDate: '',
      });
    }
    this.updateInitialBatchValidators();
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  // ─── DELETAR PRODUTO ─────────────
  openDeleteConfirm(product: CatalogProduct) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      panelClass: 'havoc-dialog-container',
      disableClose: true,
      data: {
        title: 'Excluir Produto',
        message: `Deseja realmente excluir o produto <strong>${product.name}</strong>?<br>Esta ação não pode ser desfeita.`,
        confirmText: 'Sim, Excluir',
        isDanger: true, // Ativa as cores vermelhas de alerta!
      },
    });

    dialogRef.afterClosed().subscribe((confirmado: boolean) => {
      if (confirmado) {
        this.executeDelete(product);
      }
    });
  }

  executeDelete(product: CatalogProduct) {
    this.isDeleting.set(true);

    this.catalogService.deleteProduct(product.id).subscribe({
      next: () => {
        this.products.update((prods) => prods.filter((p) => p.id !== product.id));
        this.isDeleting.set(false);
        this.loadProducts();
        this.loadStockSummary();
        this.showToast('Produto excluído com sucesso!');
      },
      error: () => {
        this.isDeleting.set(false);
        this.showToast('Erro ao excluir o produto. Ele pode estar vinculado.', true);
      },
    });
  }
  // ─── SALVAR PRODUTO ─────────────────────────────────────────
  onSubmit() {
    if (this.productForm.invalid || this.isSaving()) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const formValues = this.productForm.getRawValue();

    const generatedSlug = formValues.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const compareAtValue = Number(formValues.compareAtPrice || 0);
    const pendingFacts = this.pendingLabelFacts();
    const pendingSource = this.pendingLabelSource();
    const cleanedFacts = pendingFacts
      ? {
          ...(pendingFacts.servingSize ? { servingSize: pendingFacts.servingSize } : {}),
          ...(pendingFacts.servingsPerContainer
            ? { servingsPerContainer: pendingFacts.servingsPerContainer }
            : {}),
          ...(pendingFacts.usageInstructions
            ? { usageInstructions: pendingFacts.usageInstructions }
            : {}),
          ...(pendingFacts.ingredients ? { ingredients: pendingFacts.ingredients } : {}),
          ...(pendingFacts.allergenStatement
            ? { allergenStatement: pendingFacts.allergenStatement }
            : {}),
          ...(pendingFacts.warnings && pendingFacts.warnings.length > 0
            ? { warnings: pendingFacts.warnings }
            : {}),
          ...(pendingFacts.nutritionFacts && pendingFacts.nutritionFacts.length > 0
            ? { nutritionFacts: pendingFacts.nutritionFacts }
            : {}),
        }
      : null;
    const hasCleanedFacts = Boolean(cleanedFacts && Object.keys(cleanedFacts).length > 0);

    const payload: SaveProductRequest = {
      name: formValues.name,
      slug: generatedSlug,
      description: formValues.description,
      ...(formValues.brand.trim()
        ? { brand: formValues.brand.trim() }
        : this.isEditing()
          ? { brand: null }
          : {}),
      ...(formValues.sizeLabel.trim()
        ? { sizeLabel: formValues.sizeLabel.trim() }
        : this.isEditing()
          ? { sizeLabel: null }
          : {}),
      ...(formValues.flavor.trim()
        ? { flavor: formValues.flavor.trim() }
        : this.isEditing()
          ? { flavor: null }
          : {}),
      price: Number(formValues.price),
      ...(compareAtValue > 0
        ? { compareAtPrice: compareAtValue }
        : this.isEditing()
          ? { compareAtPrice: null }
          : {}),
      cost_price: Number(formValues.cost_price || 0),
      price_wholesale: Number(formValues.price_wholesale || 0),
      stock_min: Number(formValues.stock_min || 0),
      unit: formValues.unit,
      ncm: formValues.ncm.replace(/\D/g, ''),
      cfop: formValues.cfop.replace(/\D/g, ''),
      cest: formValues.cest.replace(/\D/g, ''),
      origin: Number(formValues.origin),
      csosn: formValues.csosn,
      pisCst: formValues.pisCst,
      cofinsCst: formValues.cofinsCst,
      taxableUnit: formValues.taxableUnit,
      ...(formValues.manufacturer.trim() && { manufacturer: formValues.manufacturer.trim() }),
      ...(hasCleanedFacts && cleanedFacts ? { labelFacts: cleanedFacts } : {}),
      ...(hasCleanedFacts && pendingSource?.manufacturerDomain
        ? { manufacturerDomain: pendingSource.manufacturerDomain }
        : {}),
      ...(hasCleanedFacts && pendingSource?.sourceUrl
        ? { labelSourceUrl: pendingSource.sourceUrl }
        : {}),
      ...(hasCleanedFacts && pendingSource?.sourceTitle
        ? { labelSourceTitle: pendingSource.sourceTitle }
        : {}),
      ...(!this.isEditing() && !this.selectedFile() && this.suggestedImageUrl()
        ? { imageUrl: this.suggestedImageUrl()! }
        : {}),
      isActive: formValues.isActive,
      ...(formValues.sku.trim() && { sku: formValues.sku.trim() }),
      barcodes: formValues.barcode.trim() ? [formValues.barcode.trim()] : [],
      controlsBatch: formValues.controlsBatch,
      ...(!this.isEditing() && { stock_qty: Number(formValues.stock_qty || 0) }),
      ...(!this.isEditing() &&
        formValues.controlsBatch &&
        Number(formValues.stock_qty) > 0 && {
          initialBatchCode: formValues.initialBatchCode.trim(),
          initialBatchExpirationDate: formValues.initialBatchExpirationDate,
        }),
      category_ids:
        formValues.category_ids && formValues.category_ids.length > 0
          ? formValues.category_ids
          : undefined,
    };

    const request$ = this.isEditing()
      ? this.catalogService.updateProduct(this.currentId()!, payload)
      : this.catalogService.createProduct(payload);

    request$.subscribe({
      next: (savedProduct) => {
        if (this.selectedFile()) {
          const productId = this.isEditing() ? this.currentId()! : savedProduct.id;

          this.catalogService.uploadProductImage(productId, this.selectedFile()!).subscribe({
            next: () => this.finalizeSave(),
            error: () => {
              this.showToast(
                'Produto salvo, mas houve uma falha ao enviar a foto para a nuvem.',
                true,
              );
              this.finalizeSave();
            },
          });
        } else {
          this.finalizeSave();
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.showToast('Erro ao salvar os dados do produto.', true);
        this.isSaving.set(false);
      },
    });
  }

  private finalizeSave() {
    this.loadProducts();
    this.loadStockSummary();
    this.closeModal();
    this.isSaving.set(false);
    this.showToast(
      this.isEditing() ? 'Produto atualizado com sucesso!' : 'Produto criado com sucesso!',
    );
  }

  // ─── ESTOQUE E IMAGENS ──────────────────────────────────────
  openStockModal(product: CatalogProduct) {
    this.selectedProduct.set(product);
    this.stockForm.reset({
      operation: 'IN',
      quantity: 1,
      reason: '',
      batchCode: '',
      expirationDate: '',
      unitCost: 0,
    });
    this.updateStockValidators();
    this.isStockModalOpen.set(true);
  }

  closeStockModal() {
    this.isStockModalOpen.set(false);
  }

  availableStockOperations() {
    return this.selectedProduct()?.controlsBatch
      ? this.stockOperations.filter((operation) => operation.value !== 'ADJUST')
      : this.stockOperations;
  }

  selectStockOperation(operation: StockOperation) {
    this.stockForm.controls.operation.setValue(operation);
  }

  onStockSubmit() {
    const product = this.selectedProduct();
    if (!product || this.stockForm.invalid || this.isSaving()) {
      this.stockForm.markAllAsTouched();
      return;
    }

    const values = this.stockForm.getRawValue();
    const operation = values.operation as StockOperation;
    if (product.controlsBatch && operation === 'ADJUST') return;

    this.isSaving.set(true);
    this.catalogService
      .createStockMovement(product.id, {
        operation,
        quantity: Number(values.quantity),
        ...(values.reason.trim() && { reason: values.reason.trim() }),
        ...(product.controlsBatch &&
          operation === 'IN' && {
            batchCode: values.batchCode.trim(),
            expirationDate: values.expirationDate,
            ...(Number(values.unitCost) > 0 && { unitCost: Number(values.unitCost) }),
          }),
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeStockModal();
          this.loadProducts();
          this.loadStockSummary();
          this.showToast('Movimentação de estoque registrada com sucesso!');
        },
        error: (error: HttpErrorResponse) => {
          this.isSaving.set(false);
          const message =
            typeof error.error?.message === 'string'
              ? error.error.message
              : 'Erro ao registrar a movimentação de estoque.';
          this.showToast(message, true);
        },
      });
  }

  private updateInitialBatchValidators() {
    const required =
      !this.isEditing() &&
      this.productForm.controls.controlsBatch.value &&
      Number(this.productForm.controls.stock_qty.value) > 0;
    for (const control of [
      this.productForm.controls.initialBatchCode,
      this.productForm.controls.initialBatchExpirationDate,
    ]) {
      control.setValidators(required ? Validators.required : null);
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  private updateStockValidators() {
    const operation = this.stockForm.controls.operation.value as StockOperation;
    const requiresBatch = Boolean(this.selectedProduct()?.controlsBatch) && operation === 'IN';
    for (const control of [
      this.stockForm.controls.batchCode,
      this.stockForm.controls.expirationDate,
    ]) {
      control.setValidators(requiresBatch ? Validators.required : null);
      control.updateValueAndValidity({ emitEvent: false });
    }
    this.stockForm.controls.quantity.setValidators([
      Validators.required,
      Validators.min(operation === 'ADJUST' ? 0 : 1),
      Validators.pattern(/^\d+$/),
    ]);
    this.stockForm.controls.quantity.updateValueAndValidity({ emitEvent: false });
  }

  incrementStock(controlName: string) {
    const currentVal = this.productForm.get(controlName)?.value || 0;
    this.productForm.patchValue({ [controlName]: currentVal + 1 });
  }

  decrementStock(controlName: string) {
    const currentVal = this.productForm.get(controlName)?.value || 0;
    if (currentVal > 0) {
      this.productForm.patchValue({ [controlName]: currentVal - 1 });
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      // 1. Trava de Formato (Bloqueia WEBP, GIF, SVG, etc)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        alert(
          'Formato inválido! O WhatsApp exige imagens JPG ou PNG. Por favor, escolha outra foto.',
        );
        input.value = ''; // Limpa o campo para o usuário tentar de novo
        return;
      }

      // 2. Trava de Tamanho (5MB = 5 * 1024 * 1024 bytes)
      const maxSizeInBytes = 5 * 1024 * 1024;
      if (file.size > maxSizeInBytes) {
        alert('A imagem é muito pesada! O tamanho máximo permitido é de 5MB.');
        input.value = ''; // Limpa o campo
        return;
      }

      // Se passou por todas as travas, salva a imagem e gera o preview
      this.selectedFile.set(file);
      const reader = new FileReader();
      reader.onload = () =>
        this.imagePreview.set(typeof reader.result === 'string' ? reader.result : null);
      reader.readAsDataURL(file);
    }
  }

  removeImage() {
    this.selectedFile.set(null);
    this.imagePreview.set(null);
    this.suggestedImageUrl.set(null);
  }

  // ─── ALERTAS (MatSnackBar) ──────────────────────────────────
  showToast(message: string, isError = false) {
    this.snackBar.open(message, 'X', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: isError ? ['havoc-snackbar-error'] : ['havoc-snackbar-success'],
    });
  }

  // ─── UPLOAD DE PDF (CLIPP) ──────────────────────────────────
  onPdfSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validação de segurança no Front
    if (file.type !== 'application/pdf') {
      this.showToast('Formato inválido! Por favor, selecione um arquivo PDF.', true);
      input.value = ''; // Limpa o input
      return;
    }

    this.isImportingPdf.set(true);

    this.catalogService.importPdf(file).subscribe({
      next: (res) => {
        this.isImportingPdf.set(false);
        const { criados, atualizados, semClassificacao, erros, enriquecimentosEnfileirados } =
          res.resumo;
        const enrichmentSummary =
          enriquecimentosEnfileirados === undefined
            ? ''
            : `, ${enriquecimentosEnfileirados} enviados para busca automática`;

        this.showToast(
          `Importação concluída: ${criados} criados, ${atualizados} atualizados${enrichmentSummary}, ${semClassificacao} sem classificação e ${erros} erros.`,
          erros > 0 || semClassificacao > 0,
        );

        // Limpa a busca e recarrega a tabela para mostrar os produtos novos
        this.searchTerm.set('');
        this.currentPage.set(1);
        this.loadProducts();
        this.loadStockSummary();
      },
      error: (err: HttpErrorResponse) => {
        console.error(err);
        this.isImportingPdf.set(false);
        const message =
          typeof err.error?.message === 'string'
            ? err.error.message
            : 'Erro ao processar o PDF. Tente novamente.';
        this.showToast(message, true);
      },
    });

    input.value = ''; // Limpa o input para permitir subir o mesmo arquivo de novo se precisar
  }

  lookupByBarcode(event?: Event): void {
    event?.preventDefault();
    const control = this.productForm.controls.barcode;
    const code = control.value.trim().replace(/\s+/g, '');
    control.setValue(code);
    control.markAsTouched();

    if (!code || control.invalid) {
      this.barcodeLookupError.set(true);
      this.barcodeLookupMessage.set(
        'Informe um código de barras GTIN/EAN/UPC válido antes de buscar.',
      );
      return;
    }

    if (this.isLookingUpBarcode()) return;

    this.isLookingUpBarcode.set(true);
    this.barcodeLookupError.set(false);
    this.barcodeLookupSourceLabel.set(null);
    this.barcodeLookupMessage.set('Consultando base gratuita e IA pelo código de barras...');

    this.catalogService.lookupBarcode(code).subscribe({
      next: (res) => {
        this.isLookingUpBarcode.set(false);
        if (!res.found) {
          this.barcodeLookupError.set(true);
          this.barcodeLookupMessage.set(
            res.message || 'Produto não encontrado para este código de barras.',
          );
          return;
        }

        const current = this.productForm.getRawValue();
        const patch: Record<string, unknown> = {};

        if (res.product.name && !current.name.trim()) patch['name'] = res.product.name;
        if (res.product.brand && !current.brand.trim()) patch['brand'] = res.product.brand;
        if (res.product.sizeLabel && !current.sizeLabel.trim()) {
          patch['sizeLabel'] = res.product.sizeLabel;
        }
        if (res.product.flavor && !current.flavor.trim()) patch['flavor'] = res.product.flavor;
        if (res.product.description && !current.description.trim()) {
          patch['description'] = res.product.description;
        }
        if ((res.labelFacts.manufacturer || res.product.brand) && !current.manufacturer.trim()) {
          patch['manufacturer'] = res.labelFacts.manufacturer || res.product.brand;
        }

        if (res.product.suggestedCategoryName && current.category_ids.length === 0) {
          const normalizedTarget = res.product.suggestedCategoryName.trim().toLowerCase();
          const matchedCategory = this.categories().find(
            (cat) => cat.name.trim().toLowerCase() === normalizedTarget,
          );
          if (matchedCategory) patch['category_ids'] = [matchedCategory.id];
        }

        if (Object.keys(patch).length > 0) {
          this.productForm.patchValue(patch);
        }

        if (res.product.imageUrl && !this.imagePreview()) {
          this.imagePreview.set(res.product.imageUrl);
          this.suggestedImageUrl.set(res.product.imageUrl);
        }

        const hasFacts = Boolean(
          res.labelFacts.nutritionFacts?.length ||
            res.labelFacts.ingredients ||
            res.labelFacts.servingSize ||
            res.labelFacts.usageInstructions,
        );
        if (hasFacts) {
          this.pendingLabelFacts.set(res.labelFacts);
          this.pendingLabelSource.set({
            sourceUrl: res.sourceUrl ?? null,
            sourceTitle: res.sourceTitle ?? null,
            manufacturerDomain: res.manufacturerDomain ?? null,
          });
        }

        const sourceNames: Record<string, string> = {
          OPEN_FOOD_FACTS: 'Open Food Facts',
          WEB_SEARCH_AI: 'Busca Web + IA',
          AI_ESTIMATE: 'IA',
        };
        this.barcodeLookupSourceLabel.set(sourceNames[res.source] ?? res.source);
        this.barcodeLookupError.set(false);
        this.barcodeLookupMessage.set(
          res.message || 'Dados preenchidos! Confira as informações, preço e estoque antes de salvar.',
        );
      },
      error: () => {
        this.isLookingUpBarcode.set(false);
        this.barcodeLookupError.set(true);
        this.barcodeLookupMessage.set(
          'Falha ao consultar código de barras. Tente novamente em instantes.',
        );
      },
    });
  }

  syncOfficialFacts(): void {
    const productId = this.currentId();
    if (!productId || this.syncState() === 'loading') return;

    this.syncState.set('loading');
    this.syncMessage.set('Iniciando uma nova busca automática...');
    this.catalogService.syncProductLabel(productId).subscribe({
      next: (facts) => {
        this.currentFacts.set(facts);
        const isPending = facts?.status === 'PENDING' || facts?.status === 'PROCESSING';
        this.syncState.set(isPending ? 'pending' : 'success');
        this.syncMessage.set(
          isPending
            ? 'A busca automática continua em segundo plano.'
            : facts
              ? 'Busca concluída. Confira abaixo o status e a fonte encontrada.'
              : 'Busca concluída, mas nenhuma informação oficial foi retornada.',
        );
        this.loadProducts(true);
      },
      error: () => {
        this.syncState.set('error');
        this.syncMessage.set(
          'Não foi possível buscar os dados oficiais agora. Tente novamente mais tarde.',
        );
      },
    });
  }

  factsStatusLabel(status: string | null | undefined): string {
    const labels: Record<string, string> = {
      SOURCE_MATCHED: 'Fonte oficial confirmada',
      PROCESSING: 'Buscando fonte oficial',
      NOT_FOUND: 'Fonte oficial não encontrada',
      FAILED: 'Falha na busca',
      SOURCE_NOT_FOUND: 'Fonte oficial não encontrada',
      SOURCE_MISMATCH: 'Produto da fonte não corresponde',
      PENDING: 'Aguardando busca',
      ERROR: 'Falha na busca',
    };
    return status ? (labels[status] ?? status) : 'Ainda não sincronizado';
  }

  canRetryFacts(): boolean {
    const status = this.currentFacts()?.status;
    return (
      status === 'NOT_FOUND' ||
      status === 'FAILED' ||
      status === 'SOURCE_NOT_FOUND' ||
      status === 'SOURCE_MISMATCH' ||
      status === 'ERROR'
    );
  }

  factsStatusClass(status: string | null | undefined): string {
    if (status === 'SOURCE_MATCHED') return 'badge--active';
    if (!status || status === 'PENDING' || status === 'PROCESSING') return 'badge--inactive';
    return 'badge--warning';
  }

  isLowStock(product: CatalogProduct): boolean {
    return (
      Number(product.stock_qty ?? product.stock ?? 0) <=
      Number(product.stock_min ?? product.stockMin ?? 0)
    );
  }

  private isCatalogCategory(value: unknown): value is CatalogCategory {
    return (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string' &&
      'name' in value &&
      typeof value.name === 'string'
    );
  }
}
