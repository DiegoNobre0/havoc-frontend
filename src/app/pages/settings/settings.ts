import { Component, inject, signal, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar'; // 👈 IMPORTAÇÃO ADICIONADA
import { SettingsService } from '../../services/settings.service';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule, MatSnackBarModule], // 👈 ADICIONADO AQUI
  templateUrl: './settings.html',
  styleUrls: ['./settings.scss']
})
export class Settings {
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  @ViewChild('deleteConfirmDialog') deleteConfirmDialog!: TemplateRef<any>;

  // Controle das Abas
  activeTab = signal<'users' | 'shipping' | 'chatbot'>('users');
  isSaving = signal(false);

  // ==========================================
  // ESTADOS: USUÁRIOS
  // ==========================================
  users = signal<any[]>([]);
  isUserModalOpen = signal(false);
  selectedUser = signal<any | null>(null);
  userForm: FormGroup;

  // ==========================================
  // ESTADOS: FRETE
  // ==========================================
  shippingRules = signal<any[]>([]);
  isShippingModalOpen = signal(false);
  selectedShipping = signal<any | null>(null);
  shippingForm: FormGroup;

  // ==========================================
  // ESTADOS: CHATBOT
  // ==========================================
  chatbotForm: FormGroup;

  constructor() {
    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: [''],
      role: ['OPERADOR', Validators.required],
      isActive: [true]
    });

    // No constructor, ajuste o shippingForm:
    this.shippingForm = this.fb.group({
      name: ['', Validators.required], // Ex: "Entrega Centro"
      type: ['BY_REGION', Validators.required], // Default para região/bairro
      region: ['', Validators.required], // Aqui vai o nome do Bairro ou Cidade
      price: [0, [Validators.required, Validators.min(0)]],

      isActive: [true]
    });

    this.chatbotForm = this.fb.group({
      systemPrompt: ['', Validators.required],
      temperature: [0.7, Validators.required],
      fallbackMessage: [''],
      isActive: [true]
    });

    this.loadData();
  }

  loadData() {
    this.settingsService.getUsers().subscribe(res => this.users.set(res));
    this.settingsService.getShippingRules().subscribe(res => this.shippingRules.set(res));
    this.settingsService.getChatbotConfig().subscribe(res => {
      if (res) {
        this.chatbotForm.patchValue(res);
      }
    });
  }

  // ─── TOAST NOTIFICATION ───
  showToast(message: string, isError: boolean = false) {
    this.snackBar.open(message, 'X', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: isError ? ['havoc-snackbar-error'] : ['havoc-snackbar-success']
    });
  }

  // ==========================================
  // ─── LÓGICA DE USUÁRIOS ───
  // ==========================================
  openUserModal(user?: any) {
    this.selectedUser.set(user || null);
    if (user) {
      this.userForm.patchValue(user);
      this.userForm.get('password')?.clearValidators();
    } else {
      this.userForm.reset({ role: 'OPERADOR', isActive: true });
      this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    }
    this.userForm.get('password')?.updateValueAndValidity();
    this.isUserModalOpen.set(true);
  }

  closeUserModal() {
    this.isUserModalOpen.set(false);
    this.selectedUser.set(null);
  }

  saveUser() {
    if (this.userForm.invalid) return;
    this.isSaving.set(true);

    const userData = this.userForm.value;
    const userId = this.selectedUser()?.id;

    const request = userId
      ? this.settingsService.updateUser(userId, userData)
      : this.settingsService.createUser(userData);

    request.subscribe({
      next: () => {
        this.loadData();
        this.closeUserModal();
        this.isSaving.set(false);
        this.showToast(`Usuário ${userId ? 'atualizado' : 'criado'} com sucesso!`);
      },
      error: (err) => {
        console.error(err);
        this.isSaving.set(false);
        this.showToast(err.error?.message || 'Erro ao salvar usuário.', true);
      }
    });
  }

  openDeleteConfirm(user: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      panelClass: 'havoc-dialog-container',
      disableClose: true,
      data: {
        title: 'Excluir Usuário',
        message: `Deseja realmente excluir o usuário <strong>${user.name}</strong>?<br>Esta ação não pode ser desfeita.`,
        confirmText: 'Sim, Excluir',
        isDanger: true // Ativa as cores vermelhas de alerta!
      }
    });

    dialogRef.afterClosed().subscribe((confirmado: boolean) => {
      if (confirmado) {
        this.deleteUser(user.id);
      }
    });
  }

  deleteUser(id: string) {

    this.settingsService.deleteUser(id).subscribe({
      next: () => {
        this.loadData();
        this.showToast('Usuário excluido com sucesso!');
      },
      error: (err) => {
        console.error(err);
        this.showToast('Erro ao excluir usuário.', true);
      }
    });

  }

  // ==========================================
  // ─── LÓGICA DE FRETE ───
  // ==========================================
  openShippingModal(rule?: any) {
    this.selectedShipping.set(rule || null);
    if (rule) {
      this.shippingForm.patchValue(rule);
    } else {
      this.shippingForm.reset({ type: 'FIXED', price: 0, isActive: true });
    }
    this.isShippingModalOpen.set(true);
  }

  closeShippingModal() {
    this.isShippingModalOpen.set(false);
    this.selectedShipping.set(null);
  }

  saveShipping() {
    if (this.shippingForm.invalid) return;
    this.isSaving.set(true);

    const shippingData = this.shippingForm.value;
    const ruleId = this.selectedShipping()?.id;

    const request = ruleId
      ? this.settingsService.updateShippingRule(ruleId, shippingData)
      : this.settingsService.createShippingRule(shippingData);

    request.subscribe({
      next: () => {
        this.loadData();
        this.closeShippingModal();
        this.isSaving.set(false);
        this.showToast(`Regra de frete ${ruleId ? 'atualizada' : 'criada'} com sucesso!`);
      },
      error: (err) => {
        console.error(err);
        this.isSaving.set(false);
        this.showToast(err.error?.message || 'Erro ao salvar regra de frete.', true);
      }
    });
  }


  openDeleteConfirmShipping(shipping: any) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      panelClass: 'havoc-dialog-container',
      disableClose: true,
      data: {
        title: 'Excluir Regra de Frete',
        message: `Deseja realmente excluir a regra de frete <strong>${shipping.name}</strong>?<br>Esta ação não pode ser desfeita.`,
        confirmText: 'Sim, Excluir',
        isDanger: true // Ativa as cores vermelhas de alerta!
      }
    });

    dialogRef.afterClosed().subscribe((confirmado: boolean) => {
      if (confirmado) {
        this.deleteShipping(shipping.id);
      }
    });
  }

  deleteShipping(id: string) {

    this.settingsService.deleteShippingRule(id).subscribe({
      next: () => {
        this.loadData();
        this.showToast('Regra de frete excluída com sucesso!');
      },
      error: (err) => {
        console.error(err);
        this.showToast('Erro ao excluir regra.', true);
      }
    });

  }

  // ==========================================
  // ─── LÓGICA DO CHATBOT ───
  // ==========================================
  saveChatbotConfig() {
    if (this.chatbotForm.invalid) return;
    this.isSaving.set(true);

    this.settingsService.updateChatbotConfig(this.chatbotForm.value).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.showToast('Configurações da IA atualizadas!');
      },
      error: (err) => {
        console.error(err);
        this.isSaving.set(false);
        this.showToast('Erro ao atualizar IA.', true);
      }
    });
  }
}