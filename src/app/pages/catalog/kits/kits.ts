import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { CatalogService } from '../../../services/catalog.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../components/confirm-dialog/confirm-dialog';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { NgxCurrencyDirective } from 'ngx-currency';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-kits',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    ReactiveFormsModule, 
    LucideAngularModule,
    MatOptionModule,
    MatSelectModule,
    NgxCurrencyDirective
  ],
  templateUrl: './kits.html',
  styleUrl: './kits.scss'
})
export class Kits implements OnInit {
  private catalogService = inject(CatalogService);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  // ─── ESTADOS GERAIS ─────────────────────────────
  kits = signal<any[]>([]); 
  isLoading = signal(true);
  availableProducts = signal<any[]>([]);

  // ─── CONTROLES DO MODAL ─────────────────────────
  isModalOpen = signal(false); 
  isEditing = signal(false);
  currentKitId = signal<string | null>(null);
  isSaving = signal(false);

  // ─── ESTADOS DO FORMULÁRIO ──────────────────────
  selectedItems = signal<{ product: any; qty: number }[]>([]);
  selectedFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);

  kitForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    discountValue: [0, [Validators.required, Validators.min(0)]], 
  });

  // ─── CÁLCULOS ─────────────────────────────────
 rawSubtotal = computed(() => {
    return this.selectedItems().reduce((sum, item) => sum + (Number(item.product.price) * item.qty), 0);
  });

  // 👇 Transforma as digitações do input em um Signal reativo em tempo real
  discountSignal = toSignal(this.kitForm.controls.discountValue.valueChanges, { initialValue: 0 });

  finalPrice = computed(() => {
    const subtotal = this.rawSubtotal();
    
    // 👇 Agora o computed escuta o Signal! Ao digitar, a tela atualiza na hora.
    // Usamos Number() só por segurança extra, mas o ngx-currency já entrega como number.
    const discount = Number(this.discountSignal()) || 0; 
    
    const final = subtotal - discount;
    return final > 0 ? final : 0;
  });

  ngOnInit() {
    this.loadKits();
    this.loadProducts();
  }

  loadKits() {
    this.isLoading.set(true);
    this.catalogService.getKits().subscribe({
      next: (res: any) => {
        this.kits.set(res.data || res); 
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erro ao carregar kits:', err);
        this.isLoading.set(false);
        this.showToast('Erro ao carregar a lista de kits.', true);
      }
    });
  }

  loadProducts() {
    this.catalogService.getProducts({ limit: 100 }).subscribe((res: any) => {
      this.availableProducts.set(res.data || res);
    });
  }

  getKitCategories(kit: any): any[] {
    if (!kit.items) return [];
    
    const categoriesMap = new Map();
    
    kit.items.forEach((item: any) => {
      if (item.product?.categories) {
        item.product.categories.forEach((cat: any) => {
          categoriesMap.set(cat.id, cat); // O Map não deixa duplicar IDs iguais
        });
      }
    });
    
    return Array.from(categoriesMap.values());
  }

  toggleKit(kit: any) {
    const newStatus = !kit.isActive;

    // 1. Atualiza a tela NA HORA (Optimistic Update)
    this.kits.update(kits => kits.map(k => k.id === kit.id ? { ...k, isActive: newStatus } : k));

    // 2. Avisa o Backend silenciosamente
    this.catalogService.pauseKit(kit.id, newStatus).subscribe({
      error: () => {
        // Se der erro na rede ou no banco, desfazemos a animação na tela e avisamos o usuário
        this.showToast('Erro ao atualizar status. Revertendo...', true);
        this.kits.update(kits => kits.map(k => k.id === kit.id ? { ...k, isActive: !newStatus } : k));
      }
    });
  }

// ─── ABRIR MODAL (Novo ou Edição) ──────────────────────────
  openModal(kit?: any) {
    // 1. Sempre limpamos o formulário e os itens antigos primeiro
    this.resetFormState();

    if (kit) {
      // 2. MODO EDIÇÃO: Preenchemos os dados com o Kit recebido
      this.isEditing.set(true);
      this.currentKitId.set(kit.id);
      
      // Carrega a imagem se existir
      this.imagePreview.set(kit.imageUrl || null);

      // Preenche os textos e o desconto
      this.kitForm.patchValue({
        name: kit.name,
        description: kit.description || '',
        discountValue: kit.discountValue || 0
      });

      // Mapeia os itens do Kit para o formato que a nossa UI entende (Signal selectedItems)
      if (kit.items && kit.items.length > 0) {
        const mappedItems = kit.items.map((item: any) => ({
          product: item.product,
          qty: item.quantity
        }));
        this.selectedItems.set(mappedItems);
      }
      
    } else {
      // 3. MODO CRIAÇÃO: Apenas garantimos que os estados de edição estão falsos
      this.isEditing.set(false);
      this.currentKitId.set(null);
    }
    
    // 4. Por fim, exibimos o modal na tela
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.resetFormState();
  }

  private resetFormState() {
    this.kitForm.reset({ discountValue: 0 });
    this.selectedItems.set([]);
    this.selectedFile.set(null);
    this.imagePreview.set(null);
  }

  // ─── DELETAR KIT (Com Dialog Customizado) ────────────
  confirmDelete(kit: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      panelClass: 'havoc-dialog-container',
      disableClose: true,
      data: {
        title: 'Excluir Kit',
        message: `Deseja realmente excluir o kit <strong>${kit.name}</strong>?<br>O histórico de pedidos não será afetado.`,
        confirmText: 'Sim, Excluir',
        isDanger: true
      }
    });

    dialogRef.afterClosed().subscribe((confirmado: boolean) => {
      if (confirmado) {
        this.executeDelete(kit);
      }
    });
  }

  private executeDelete(kit: any) {
    this.catalogService.deleteKit(kit.id).subscribe({
      next: () => {
        this.kits.update(kits => kits.filter(k => k.id !== kit.id));
        this.showToast('Kit excluído com sucesso!');
      },
      error: () => this.showToast('Não foi possível excluir o Kit.', true)
    });
  }

  // ─── IMAGEM PRINCIPAL ────────────────────────────────────
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

  // ─── COMPOSIÇÃO DO COMBO ─────────────────────────────────
  addProduct(productId: string) {    
    if (!productId) return;

    const product = this.availableProducts().find(p => p.id === productId);
    if (!product) return;

    const existingItem = this.selectedItems().find(item => item.product.id === productId);
    if (existingItem) {
      this.updateQty(productId, 1);
    } else {
      this.selectedItems.update(items => [...items, { product, qty: 1 }]);
    }
  }

  updateQty(productId: string, delta: number) {
    this.selectedItems.update(items => items.map(item => {
      if (item.product.id === productId) {
        const newQty = item.qty + delta;
        return { ...item, qty: newQty > 0 ? newQty : 1 };
      }
      return item;
    }));
  }

  removeProduct(productId: string) {
    this.selectedItems.update(items => items.filter(i => i.product.id !== productId));
  }

  // ─── SALVAR (Integração Total Zod/Fastify) ───────────────
  onSubmit() {
    if (this.kitForm.invalid || this.selectedItems().length === 0) {
      this.showToast('Preencha os dados e adicione ao menos um produto no combo.', true);
      return;
    }

    this.isSaving.set(true);
    const formValues = this.kitForm.getRawValue();
    const generatedSlug = formValues.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const payload = {
      name: formValues.name,
      slug: generatedSlug,
      description: formValues.description || undefined,
      discountType: 'FIXED', 
      discountValue: Number(formValues.discountValue),
      productItems: this.selectedItems().map(item => ({
        productId: item.product.id,
        quantity: item.qty
      }))
    };

    const request$ = this.isEditing() && this.currentKitId()
      ? this.catalogService.updateKit(this.currentKitId()!, payload)
      : this.catalogService.createKit(payload);

    request$.subscribe({
      next: (savedKit) => {
        if (this.selectedFile()) {
          const kitId = this.isEditing() ? this.currentKitId()! : savedKit.id;
          
          this.catalogService.uploadKitImage(kitId, this.selectedFile()!).subscribe({
            next: () => this.finalizeSave(),
            error: () => {
              this.showToast('Kit criado, mas houve erro no upload da foto.', true);
              this.finalizeSave();
            }
          });
        } else {
          this.finalizeSave();
        }
      },
      error: (err) => {
        console.error(err);
        this.showToast('Erro ao processar. Verifique se os produtos estão ativos.', true);
        this.isSaving.set(false);
      }
    });
  }

  private finalizeSave() {
    this.loadKits();
    this.closeModal();
    this.isSaving.set(false);
    this.showToast(this.isEditing() ? 'Kit atualizado com sucesso!' : 'Kit criado com sucesso!');
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