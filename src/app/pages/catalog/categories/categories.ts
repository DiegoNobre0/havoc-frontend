import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { CatalogService } from '../../../services/catalog.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../components/confirm-dialog/confirm-dialog';


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
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

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
        this.categories.set(res.data || res || []); 
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erro ao buscar categorias:', err);
        this.isLoading.set(false);
        this.showToast('Erro ao carregar as categorias.', true);
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
        this.showToast(this.isEditing() ? 'Categoria atualizada!' : 'Categoria criada!');
      },
      error: (err) => {
        console.error('Erro ao salvar categoria:', err);
        const backendMessage = err.error?.message || 'Erro ao salvar os dados da categoria.';
        this.showToast(backendMessage, true);
        this.isSaving.set(false);
      }
    });
  }

  // ─── LÓGICA DE EXCLUSÃO (Com Dialog Customizado) ────────────
  confirmDelete(category: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      panelClass: 'havoc-dialog-container',
      disableClose: true,
      data: {
        title: 'Excluir Categoria',
        message: `Deseja realmente excluir a categoria <strong>${category.name}</strong>?<br>Esta ação não pode ser desfeita.`,
        confirmText: 'Sim, Excluir',
        isDanger: true
      }
    });

    dialogRef.afterClosed().subscribe((confirmado: boolean) => {
      if (confirmado) {
        this.executeDelete(category);
      }
    });
  }

  private executeDelete(category: any) {
    this.catalogService.deleteCategory(category.id).subscribe({
      next: () => {
        this.categories.update(cats => cats.filter(c => c.id !== category.id));
        this.showToast('Categoria excluída com sucesso!');
      },
      error: (err) => {
        console.error('Erro ao deletar:', err);
        this.showToast(`Não é possível deletar "${category.name}" pois existem produtos vinculados.`, true);
      }
    });
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