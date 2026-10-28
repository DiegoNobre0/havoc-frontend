import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
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
import { CatalogCategory, CatalogProduct, ProductFilters, SaveProductRequest } from '../../../models/product.models';
import { SupplementFacts } from '../../../models/supplement-facts.models';


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
    NgxCurrencyDirective
  ],
  templateUrl: './products.html',
  styleUrl: './products.scss'
})
export class Products implements OnInit, OnDestroy {
  private catalogService = inject(CatalogService);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;

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

// ─── ESTADOS GERAIS DE MODAIS ───────────────────────────────
  isSaving = signal<boolean>(false);
  isDeleting = signal<boolean>(false);
  isImportingPdf = signal<boolean>(false); // NOVO SINAL

  // ─── MODAL: MOVIMENTAR ESTOQUE ──────────────────────────────
  isStockModalOpen = signal<boolean>(false);
  selectedProduct = signal<CatalogProduct | null>(null);

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
  currentFacts = signal<SupplementFacts | null>(null);
  syncState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  syncMessage = signal<string>('');

  productForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    unit: ['UN'],
    category_ids: [[] as string[]],
    description: [''],
    price: [0, [Validators.required, Validators.min(0.01)]],
    cost_price: [0],
    price_wholesale: [0],
    stock_qty: [0, Validators.min(0)],
    stock_min: [0, Validators.min(0)],
    ncm: [''],
    cfop: [''],
    manufacturer: [''],
    manufacturerDomain: [''],
    isActive: [true]
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

    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(() => {
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
    this.catalogService.getCategories().subscribe((res: unknown) => {
      const value = typeof res === 'object' && res !== null && 'data' in res
        ? (res as { data: unknown }).data
        : res;
      this.categories.set(Array.isArray(value) ? value.filter(this.isCatalogCategory) : []);
    });
  }

  loadProducts() {
    this.isLoading.set(true);
    const filters: ProductFilters = {
      page: this.currentPage(),
      limit: 10,
      search: this.searchTerm()
    };
   
    if (this.selectedCategory()) filters.categoryId = this.selectedCategory();
    if (this.selectedStatus()) filters.isActive = this.selectedStatus() === 'true';

    this.catalogService.getProducts(filters).subscribe({
      next: (res) => {
        this.products.set(res.data);
        
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
    // TODO: Implementar filtro de estoque no backend
  }

  toggleProduct(product: CatalogProduct) {
    const newStatus = !product.isActive;
    this.products.update(prods => prods.map(p => p.id === product.id ? { ...p, isActive: newStatus } : p));

    this.catalogService.pauseProduct(product.id, newStatus).subscribe({
      error: () => {
        this.showToast('Erro ao atualizar status. Revertendo...', true);
        this.products.update(prods => prods.map(p => p.id === product.id ? { ...p, isActive: !newStatus } : p));
      }
    });
  }

  toggleFiscal() {
    this.showFiscal.update(v => !v);
  }

  openModal(product?: CatalogProduct) {
    this.imagePreview.set(null);
    this.selectedFile.set(null);
    this.currentFacts.set(null);
    this.syncState.set('idle');
    this.syncMessage.set('');
    this.showFiscal.set(false);

    if (product) {
      this.isEditing.set(true);
      this.currentId.set(product.id);
      if (product.ncm || product.cfop) this.showFiscal.set(true);

      this.imagePreview.set(product.imageUrl || null);
      this.currentFacts.set(product.supplementFacts ?? null);

      this.productForm.reset({
        name: product.name,
        unit: product.unit || 'UN',
        category_ids: product.categories?.map((category) => category.id) ?? [],
        description: product.description || '',
        price: Number(product.price),
        cost_price: Number(product.cost_price ?? product.costPrice ?? 0),
        price_wholesale: Number(product.price_wholesale ?? product.priceWholesale ?? 0),
        stock_qty: Number(product.stock_qty ?? product.stock ?? 0),
        stock_min: Number(product.stock_min ?? product.stockMin ?? 0),
        ncm: product.ncm ?? '',
        cfop: product.cfop ?? '',
        manufacturer: product.manufacturer ?? product.supplementFacts?.manufacturer ?? '',
        manufacturerDomain: product.manufacturerDomain ?? product.supplementFacts?.manufacturerDomain ?? '',
        isActive: product.isActive,
      });

    } else {
      this.isEditing.set(false);
      this.currentId.set(null);
      this.productForm.reset({
        name: '', description: '', isActive: true, unit: 'UN', price: 0, cost_price: 0,
        price_wholesale: 0, stock_qty: 0, stock_min: 0, category_ids: [], ncm: '', cfop: '',
        manufacturer: '', manufacturerDomain: '',
      });
    }
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
        isDanger: true // Ativa as cores vermelhas de alerta!
      }
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
        this.products.update(prods => prods.filter(p => p.id !== product.id));
        this.isDeleting.set(false);
        this.loadProducts(); 
        this.showToast('Produto excluído com sucesso!');
      },
      error: () => {
        this.isDeleting.set(false);
        this.showToast('Erro ao excluir o produto. Ele pode estar vinculado.', true);
      }
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

    const generatedSlug = formValues.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const payload: SaveProductRequest = {
      name: formValues.name,
      slug: generatedSlug,
      description: formValues.description,
      price: Number(formValues.price),
      cost_price: Number(formValues.cost_price || 0),
      price_wholesale: Number(formValues.price_wholesale || 0),
      stock_qty: Number(formValues.stock_qty || 0),
      stock_min: Number(formValues.stock_min || 0),
      unit: formValues.unit,
      ncm: formValues.ncm,
      cfop: formValues.cfop,
      ...(formValues.manufacturer.trim() && { manufacturer: formValues.manufacturer.trim() }),
      ...(formValues.manufacturerDomain.trim() && { manufacturerDomain: formValues.manufacturerDomain.trim() }),
      isActive: formValues.isActive,
      category_ids: formValues.category_ids && formValues.category_ids.length > 0 ? formValues.category_ids : undefined
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
              this.showToast('Produto salvo, mas houve uma falha ao enviar a foto para a nuvem.', true);
              this.finalizeSave();
            }
          });
        } else {
          this.finalizeSave();
        }
      },
      error: (err: unknown) => {
        console.error(err);
        this.showToast('Erro ao salvar os dados do produto.', true);
        this.isSaving.set(false);
      }
    });
  }

  private finalizeSave() {
    this.loadProducts();
    this.closeModal();
    this.isSaving.set(false);
    this.showToast(this.isEditing() ? 'Produto atualizado com sucesso!' : 'Produto criado com sucesso!');
  }

  // ─── ESTOQUE E IMAGENS ──────────────────────────────────────
  openStockModal(product: CatalogProduct) {
    this.selectedProduct.set(product);
    this.stockForm.reset({ operation: 'IN', quantity: 1, reason: '' });
    this.isStockModalOpen.set(true);
  }

  closeStockModal() {
    this.isStockModalOpen.set(false);
  }

  onStockSubmit() { /* TODO: Integrar com endpoint de movimentação */ }

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
        alert('Formato inválido! O WhatsApp exige imagens JPG ou PNG. Por favor, escolha outra foto.');
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
      reader.onload = () => this.imagePreview.set(typeof reader.result === 'string' ? reader.result : null);
      reader.readAsDataURL(file);
    }
  }

  removeImage() {
    this.selectedFile.set(null);
    this.imagePreview.set(null);
  }

  // ─── ALERTAS (MatSnackBar) ──────────────────────────────────
  showToast(message: string, isError = false) {
    this.snackBar.open(message, 'X', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: isError ? ['havoc-snackbar-error'] : ['havoc-snackbar-success']
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
        const { criados, atualizados, semClassificacao, erros } = res.resumo;
        
        this.showToast(
          `Importação concluída: ${criados} criados, ${atualizados} atualizados, ${semClassificacao} sem classificação e ${erros} erros.`,
          erros > 0 || semClassificacao > 0,
        );
        
        // Limpa a busca e recarrega a tabela para mostrar os produtos novos
        this.searchTerm.set('');
        this.currentPage.set(1);
        this.loadProducts();
      },
      error: (err: HttpErrorResponse) => {
        console.error(err);
        this.isImportingPdf.set(false);
        const message = typeof err.error?.message === 'string' ? err.error.message : 'Erro ao processar o PDF. Tente novamente.';
        this.showToast(message, true);
      }
    });

    input.value = ''; // Limpa o input para permitir subir o mesmo arquivo de novo se precisar
  }

  syncOfficialFacts(): void {
    const productId = this.currentId();
    if (!productId || this.syncState() === 'loading') return;

    this.syncState.set('loading');
    this.syncMessage.set('Buscando a fonte oficial do fabricante...');
    this.catalogService.syncProductLabel(productId).subscribe({
      next: (facts) => {
        this.currentFacts.set(facts);
        this.syncState.set('success');
        this.syncMessage.set(facts
          ? 'Busca concluída. Confira abaixo o status e a fonte encontrada.'
          : 'Busca concluída, mas nenhuma informação oficial foi retornada.');
        this.loadProducts();
      },
      error: () => {
        this.syncState.set('error');
        this.syncMessage.set('Não foi possível buscar os dados oficiais. Verifique fabricante e domínio e tente novamente.');
      },
    });
  }

  factsStatusLabel(status: string | null | undefined): string {
    const labels: Record<string, string> = {
      SOURCE_MATCHED: 'Fonte oficial confirmada',
      NOT_FOUND: 'Fonte oficial não encontrada',
      FAILED: 'Falha na busca',
      SOURCE_NOT_FOUND: 'Fonte oficial não encontrada',
      SOURCE_MISMATCH: 'Produto da fonte não corresponde',
      PENDING: 'Aguardando busca',
      ERROR: 'Falha na busca',
    };
    return status ? labels[status] ?? status : 'Ainda não sincronizado';
  }

  isLowStock(product: CatalogProduct): boolean {
    return Number(product.stock_qty ?? product.stock ?? 0) <= Number(product.stock_min ?? product.stockMin ?? 0);
  }

  private isCatalogCategory(value: unknown): value is CatalogCategory {
    return typeof value === 'object' && value !== null
      && 'id' in value && typeof value.id === 'string'
      && 'name' in value && typeof value.name === 'string';
  }
}
