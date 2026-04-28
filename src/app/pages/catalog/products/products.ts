import { Component, OnInit, OnDestroy, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { debounceTime, distinctUntilChanged, Subject, Subscription } from 'rxjs';
import { CatalogService } from '../../../services/catalog.service';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../components/confirm-dialog/confirm-dialog';
import { NgxCurrencyDirective } from 'ngx-currency';


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

  @ViewChild('deleteConfirmDialog') deleteConfirmDialog!: TemplateRef<any>;

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
  isDeleting = signal<boolean>(false);

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
    category_ids: [[] as string[]],
    description: [''],
    price: [0, [Validators.required, Validators.min(0.01)]],
    cost_price: [0],
    price_wholesale: [0],
    stock_qty: [0, Validators.min(0)],
    stock_min: [0, Validators.min(0)],
    ncm: [''],
    cfop: [''],
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
    this.catalogService.getCategories().subscribe((res: any) => {
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
    if (this.selectedStatus()) filters.isActive = this.selectedStatus() === 'true';

    this.catalogService.getProducts(filters).subscribe({
      next: (res: any) => {
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

  toggleProduct(product: any) {
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

  openModal(product?: any) {
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
        stock_qty: product.stock || 0,
      });

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

  // ─── DELETAR PRODUTO ─────────────
openDeleteConfirm(product: any) {
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

executeDelete(product: any) {
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
      error: (err) => {
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
  openStockModal(product: any) {
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

  // ─── ALERTAS (MatSnackBar) ──────────────────────────────────
  showToast(message: string, isError: boolean = false) {
    this.snackBar.open(message, 'X', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: isError ? ['havoc-snackbar-error'] : ['havoc-snackbar-success']
    });
  }
}