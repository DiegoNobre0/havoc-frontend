import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { CatalogService } from '../../../services/catalog.service';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './categories.html',
  styleUrl: './categories.scss'
})
export class Categories implements OnInit {
  private catalogService = inject(CatalogService);
  private fb = inject(FormBuilder);

  // ─── ESTADOS GERAIS ─────────────────────────────────────────
  categories = signal<any[]>([]);
  isLoading = signal(true);

  // ─── MODAL DE FORMULÁRIO (CRIAR/EDITAR) ─────────────────────
  isModalOpen = signal(false);
  isEditing = signal(false);
  currentId = signal<string | null>(null);
  isSaving = signal(false);

  // Formulário Reativo
  categoryForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.isLoading.set(true);
    
    this.catalogService.getCategories().subscribe({
      next: (res: any) => {        
        // Fastify sempre devolve o array limpo na rota de categorias se não houver paginação
        this.categories.set(res.data || res || []); 
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erro ao buscar categorias:', err);
        this.isLoading.set(false);
      }
    });
  }

  openModal(category?: any) {
    if (category) {
      this.isEditing.set(true);
      this.currentId.set(category.id);
      this.categoryForm.patchValue({
        name: category.name,
      });
    } else {
      this.isEditing.set(false);
      this.currentId.set(null);
      this.categoryForm.reset();
    }
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.categoryForm.reset();
  }

  onSubmit() {
    if (this.categoryForm.invalid || this.isSaving()) return;

    this.isSaving.set(true);
    const rawData = this.categoryForm.getRawValue();

    // 🚨 Geração do Slug dinâmico exigido pelo backend
    const generatedSlug = rawData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const payload = {
      name: rawData.name,
      slug: generatedSlug
    };

    const request$ = this.isEditing()
      ? this.catalogService.updateCategory(this.currentId()!, payload)
      : this.catalogService.createCategory(payload);

    request$.subscribe({
      next: () => {
        this.loadCategories();
        this.closeModal();
        this.isSaving.set(false);
      },
      error: (err) => {
        console.error('Erro ao salvar categoria:', err);
        alert('Erro ao salvar os dados.');
        this.isSaving.set(false);
      }
    });
  }

  // ─── LÓGICA DE EXCLUSÃO (DIRETA) ───────────────────────
  confirmDelete(category: any) {
    if (!confirm(`Deseja realmente excluir a categoria "${category.name}"?`)) return;

    this.catalogService.deleteCategory(category.id).subscribe({
      next: () => {
        // Atualiza a interface otimista removendo o item
        this.categories.update(cats => cats.filter(c => c.id !== category.id));
      },
      error: (err) => {
        console.error('Erro ao deletar:', err);
        alert(`Não é possível deletar a categoria "${category.name}" pois existem produtos vinculados a ela.`);
      }
    });
  }
}