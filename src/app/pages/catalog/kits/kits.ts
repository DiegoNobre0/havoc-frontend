import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { CatalogService } from '../../../services/catalog.service';

@Component({
  selector: 'app-kits',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    ReactiveFormsModule, 
    LucideAngularModule
  ],
  templateUrl: './kits.html',
  styleUrl: './kits.scss'
})
export class Kits implements OnInit {
  private catalogService = inject(CatalogService);
  private fb = inject(FormBuilder);

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
    discountValue: [0, [Validators.required, Validators.min(0)]], // Backend espera "FIXED" desconto
  });

  // ─── CÁLCULOS ─────────────────────────────────
  rawSubtotal = computed(() => {
    return this.selectedItems().reduce((sum, item) => sum + (Number(item.product.price) * item.qty), 0);
  });

  finalPrice = computed(() => {
    const subtotal = this.rawSubtotal();
    const discount = Number(this.kitForm.value.discountValue) || 0;
    const final = subtotal - discount;
    return final > 0 ? final : 0; // Evita preço negativo!
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
      }
    });
  }

  loadProducts() {
    this.catalogService.getProducts({ limit: 100 }).subscribe((res: any) => {
      this.availableProducts.set(res.data || res);
    });
  }

  openModal() {
    this.isModalOpen.set(true);
    this.isEditing.set(false);
    this.currentKitId.set(null);
    this.resetFormState();
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

  deleteKit(id: string) {
    if (!confirm('Tem certeza que deseja excluir este kit? O histórico de pedidos antigos não será afetado.')) return;
    
    this.catalogService.deleteKit(id).subscribe({
      next: () => {
        this.kits.update(kits => kits.filter(k => k.id !== id));
      },
      error: () => alert('Não foi possível excluir o Kit.')
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
      alert('Preencha os dados e adicione ao menos um produto no combo.');
      return;
    }

    this.isSaving.set(true);
    const formValues = this.kitForm.getRawValue();
    const generatedSlug = formValues.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    // Montando o payload JSON idêntico ao Zod Schema do Fastify
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
        // Se escolheu imagem nova, envia pro R2 depois de criar o Kit
        if (this.selectedFile()) {
          const kitId = this.isEditing() ? this.currentKitId()! : savedKit.id;
          
          this.catalogService.uploadKitImage(kitId, this.selectedFile()!).subscribe({
            next: () => this.finalizeSave(),
            error: () => {
              alert('Kit criado, mas houve erro no upload da foto.');
              this.finalizeSave();
            }
          });
        } else {
          this.finalizeSave();
        }
      },
      error: (err) => {
        console.error(err);
        alert('Erro ao processar. Verifique se os produtos estão ativos.');
        this.isSaving.set(false);
      }
    });
  }

  private finalizeSave() {
    this.loadKits();
    this.closeModal();
    this.isSaving.set(false);
  }
}