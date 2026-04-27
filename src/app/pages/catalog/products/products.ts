import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormArray } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { debounceTime, distinctUntilChanged, Subject, Subscription } from 'rxjs';
import { CatalogService } from '../../../services/catalog.service';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule,
    MatOptionModule,
    MatSelectModule
  ],
  templateUrl: './products.html',
  styleUrl: './products.scss'
})
export class Products implements OnInit, OnDestroy {
  private catalogService = inject(CatalogService);
  private fb = inject(FormBuilder);
  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;

  // ─── ESTADOS DA LISTAGEM ────────────────────────────────────
  products = signal<any[]>([]);
  categories = signal<any[]>([]);
  isLoading = signal<boolean>(true);

  // ─── PAGINAÇÃO E FILTROS ────────────────────────────────────
  searchTerm = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus = signal<string>('');
  currentPage = signal<number>(1);
  totalPages = signal<number>(1);
  totalItems = signal<number>(0);
  lowStockCount = signal<number>(0);

  // ─── ESTADOS GERAIS DE MODAIS ───────────────────────────────
  isSaving = signal<boolean>(false);

  // ─── MODAIS UNIVERSAIS (Confirmação e Erro) ─────────────────
  isConfirmModalOpen = signal(false);
  itemToDelete = signal<any | null>(null);
  isDeleting = signal(false);

  showErrorModal = signal(false);
  errorMessage = signal('');

  // ─── MODAL: MOVIMENTAR ESTOQUE ──────────────────────────────
  isStockModalOpen = signal<boolean>(false);
  selectedProduct = signal<any | null>(null);

  stockOperations = [
    { label: 'Entrada', value: 'IN' },
    { label: 'Saída', value: 'OUT' },
    { label: 'Balanço', value: 'ADJUST' }
  ];

  stockForm = this.fb.nonNullable.group({
    operation: ['IN', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    reason: ['']
  });

  // ─── SINAIS DE CONTROLE DE IMAGEM ───────────────────────────
  selectedFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);

  // ─── MODAL: CRIAR / EDITAR PRODUTO ──────────────────────────
  isModalOpen = signal<boolean>(false);
  isEditing = signal<boolean>(false);
  currentId = signal<string | null>(null);
  showFiscal = signal<boolean>(false);

  productForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    unit: ['UN'],
    category_ids: [[] as string[]], // Mudamos para select único como no backend Zod
    description: [''],
    price: [0, [Validators.required, Validators.min(0.01)]],
    cost_price: [0],
    price_wholesale: [0],
    stock_qty: [0, Validators.min(0)],
    stock_min: [0, Validators.min(0)],
    ncm: [''],
    cfop: [''],
    isActive: [true],
    barcodes: this.fb.array([])
  });

  calculatedMargin = computed(() => {
    const price = this.productForm.value.price || 0;
    const cost = this.productForm.value.cost_price || 0;
    if (price <= 0 || cost <= 0) return null;
    return ((price - cost) / price) * 100;
  });

  // ─── GETTERS E CONTROLES DO FORMARRAY (BARCODES) ─────────────
  get barcodes(): FormArray {
    return this.productForm.get('barcodes') as FormArray;
  }

  addBarcode(code = '', unit = 'UN') {
    this.barcodes.push(this.fb.group({
      code: [code, Validators.required],
      unit: [unit]
    }));
  }

  removeBarcode(index: number) {
    this.barcodes.removeAt(index);
  }

  ngOnInit() {
    this.loadCategories();
    this.loadProducts();

    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe((searchTerm) => {
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
  }

  loadCategories() {
    this.catalogService.getCategories().subscribe((res: any) => {
      // Ajusta para ler a resposta padrão do Fastify
      this.categories.set(res.data || res);
    });
  }

  loadProducts() {
    this.isLoading.set(true);
    const filters: any = {
      page: this.currentPage(),
      limit: 10,
      search: this.searchTerm()
    };

    if (this.selectedCategory()) filters.categoryId = this.selectedCategory();

    // NOTA: isActive precisa ser implementado no WHERE do Backend posteriormente
    if (this.selectedStatus()) filters.isActive = this.selectedStatus() === 'true';

    this.catalogService.getProducts(filters).subscribe({
      next: (res: any) => {
        this.products.set(res.data);
        console.log('Produtos carregados:', this.products());
        this.totalPages.set(res.meta.totalPages);
        this.totalItems.set(res.meta.total);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
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
    this.currentPage.set(1);
    // this.loadProducts(true); Implementar filtro de baixo estoque no backend no futuro
  }

  toggleProduct(product: any) {
    debugger
    const newStatus = !product.isActive;
    this.products.update(prods => prods.map(p => p.id === product.id ? { ...p, isActive: newStatus } : p));

    this.catalogService.pauseProduct(product.id, newStatus).subscribe({
      error: () => {
        this.showError('Erro ao atualizar status. Revertendo...');
        this.products.update(prods => prods.map(p => p.id === product.id ? { ...p, isActive: !newStatus } : p));
      }
    });
  }

  toggleFiscal() {
    this.showFiscal.update(v => !v);
  }

  openModal(product?: any) {
    this.barcodes.clear();
    this.imagePreview.set(null);
    this.selectedFile.set(null);

    if (product) {
      this.isEditing.set(true);
      this.currentId.set(product.id);
      if (product.ncm || product.cfop) this.showFiscal.set(true);

      this.imagePreview.set(product.imageUrl || null);

      this.productForm.patchValue({
        name: product.name,
        unit: product.unit || 'UN',
        category_ids: product.categories ? product.categories.map((c: any) => c.id) : [],
        description: product.description || '',
        price: Number(product.price),
        stock_qty: product.stock || 0, // Mapeado pro Zod do Backend
      });
      // Demais campos omitidos no patchValue para brevidade, mas podem ser adicionados

    } else {
      this.isEditing.set(false);
      this.currentId.set(null);
      this.showFiscal.set(false);
      this.productForm.reset({
        isActive: true, unit: 'UN', price: 0, cost_price: 0, stock_qty: 0, stock_min: 0, category_ids: []
      });
    }
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  // ─── DELETAR PRODUTO ────────────────────────────────────────
  openDeleteConfirm(product: any) {
    this.itemToDelete.set(product);
    this.isConfirmModalOpen.set(true);
  }

  closeDeleteConfirm() {
    this.isConfirmModalOpen.set(false);
    this.itemToDelete.set(null);
  }

  confirmDelete() {
    const product = this.itemToDelete();
    if (!product) return;

    this.isDeleting.set(true);

    this.catalogService.deleteProduct(product.id).subscribe({
      next: () => {
        this.products.update(prods => prods.filter(p => p.id !== product.id));
        this.closeDeleteConfirm();
        this.isDeleting.set(false);
        this.loadProducts(); // Recarrega para atualizar a paginação
      },
      error: (err: any) => {
        this.isDeleting.set(false);
        this.closeDeleteConfirm();
        this.showError('Erro ao excluir o produto. Ele pode estar vinculado a outras áreas.');
      }
    });
  }

  // ─── SALVAR PRODUTO (Fluxo Sênior) ──────────────────────────
  onSubmit() {    
    if (this.productForm.invalid || this.isSaving()) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const formValues = this.productForm.getRawValue();

    // 1. Gera o Slug dinamicamente baseado no nome do produto
    const generatedSlug = formValues.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    // 2. Mapeia exatamente para o Zod Schema do Fastify
    const payload = {
      name: formValues.name,
      slug: generatedSlug,
      description: formValues.description,
      price: Number(formValues.price),
      stock: Number(formValues.stock_qty),
      categoryIds: formValues.category_ids && formValues.category_ids.length > 0 ? formValues.category_ids : undefined
    };

    const request$ = this.isEditing()
      ? this.catalogService.updateProduct(this.currentId()!, payload)
      : this.catalogService.createProduct(payload);

    request$.subscribe({
      next: (savedProduct) => {
        // 3. Sucesso! Vamos ver se tem foto para enviar pro Cloudflare R2
        if (this.selectedFile()) {
          const productId = this.isEditing() ? this.currentId()! : savedProduct.id;

          this.catalogService.uploadProductImage(productId, this.selectedFile()!).subscribe({
            next: () => this.finalizeSave(),
            error: () => {
              this.showError('Produto salvo com sucesso, mas houve uma falha ao enviar a foto para a nuvem.');
              this.finalizeSave();
            }
          });
        } else {
          this.finalizeSave();
        }
      },
      error: (err) => {
        console.error(err);
        this.showError('Erro ao salvar os dados do produto.');
        this.isSaving.set(false);
      }
    });
  }

  private finalizeSave() {
    this.loadProducts();
    this.closeModal();
    this.isSaving.set(false);
  }

  // ─── ESTOQUE E IMAGENS ──────────────────────────────────────
  openStockModal(product: any) {
    this.selectedProduct.set(product);
    this.stockForm.reset({ operation: 'IN', quantity: 1, reason: '' });
    this.isStockModalOpen.set(true);
  }

  closeStockModal() {
    this.isStockModalOpen.set(false);
  }

  onStockSubmit() { /* Integrar com endpoint futuro de movimentação */ }

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

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile.set(file);
      const reader = new FileReader();
      reader.onload = (e: any) => this.imagePreview.set(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  removeImage() {
    this.selectedFile.set(null);
    this.imagePreview.set(null);
  }

  // ─── ALERTAS ────────────────────────────────────────────────
  showError(msg: string) {
    this.errorMessage.set(msg);
    this.showErrorModal.set(true);
  }

  closeErrorModal() {
    this.showErrorModal.set(false);
    this.errorMessage.set('');
  }
}