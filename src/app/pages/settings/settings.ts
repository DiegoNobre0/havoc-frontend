import { Component, computed, inject, signal, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar'; // 👈 IMPORTAÇÃO ADICIONADA
import { SettingsService } from '../../services/settings.service';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog';
import { AuthService } from '../../services/auth.service';
import {
  FiscalService,
  FiscalSettings,
  SaveFiscalSettingsRequest,
} from '../../services/fiscal.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule, MatSnackBarModule], // 👈 ADICIONADO AQUI
  templateUrl: './settings.html',
  styleUrls: ['./settings.scss'],
})
export class Settings {
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  private fiscalService = inject(FiscalService);

  @ViewChild('deleteConfirmDialog') deleteConfirmDialog!: TemplateRef<any>;

  // Controle das Abas
  activeTab = signal<'users' | 'shipping' | 'chatbot' | 'fiscal'>('users');
  isSaving = signal(false);
  isAdmin = computed(() => this.authService.currentUser()?.role === 'ADMIN');

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
  fiscalForm: FormGroup;
  fiscalSettings = signal<FiscalSettings | null>(null);
  isLoadingFiscal = signal(false);
  certificateFile = signal<File | null>(null);
  certificateError = signal('');

  constructor() {
    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: [''],
      role: ['OPERADOR', Validators.required],
      isActive: [true],
    });

    // No constructor, ajuste o shippingForm:
    this.shippingForm = this.fb.group({
      name: ['', Validators.required], // Ex: "Entrega Centro"
      type: ['BY_REGION', Validators.required], // Default para região/bairro
      region: ['', Validators.required], // Aqui vai o nome do Bairro ou Cidade
      price: [0, [Validators.required, Validators.min(0)]],

      isActive: [true],
    });

    this.chatbotForm = this.fb.group({
      systemPrompt: ['', Validators.required],
      temperature: [0.7, Validators.required],
      fallbackMessage: [''],
      isActive: [true],
    });

    this.fiscalForm = this.fb.group({
      razao_social: ['', Validators.required],
      nome_fantasia: [''],
      cnpj: ['', [Validators.required, Validators.pattern(/^(?:\D*\d){14}\D*$/)]],
      inscricao_estadual: [''],
      crt: [1, Validators.required],
      logradouro: ['', Validators.required],
      numero: ['', Validators.required],
      complemento: [''],
      bairro: ['', Validators.required],
      cep: ['', [Validators.required, Validators.pattern(/^(?:\D*\d){8}\D*$/)]],
      nome_municipio: ['', Validators.required],
      codigo_municipio: ['', [Validators.required, Validators.pattern(/^\d{7}$/)]],
      uf: ['BA', [Validators.required, Validators.pattern(/^[A-Z]{2}$/)]],
      telefone: [''],
      ambiente: [2, Validators.required],
      csc_id: [''],
      csc_token: [''],
      serie_nfce: [1, [Validators.required, Validators.min(1)]],
      numero_nfce: [1, [Validators.required, Validators.min(1)]],
      serie_nfce_homologacao: [1, [Validators.required, Validators.min(1)]],
      numero_nfce_homologacao: [1, [Validators.required, Validators.min(1)]],
      certificado_senha: [''],
    });

    this.loadData();
    if (this.isAdmin()) this.loadFiscalSettings();
  }

  loadFiscalSettings() {
    this.isLoadingFiscal.set(true);
    this.fiscalService.getSettings().subscribe({
      next: (settings) => {
        this.fiscalSettings.set(settings);
        if (settings) {
          const company = settings.empresa;
          this.fiscalForm.patchValue({
            ...company,
            ambiente: settings.ambiente,
            csc_token: '',
            certificado_senha: '',
            serie_nfce: company.serie_nfce ?? 1,
            numero_nfce: company.numero_nfce ?? 1,
            serie_nfce_homologacao: company.serie_nfce_homologacao ?? 1,
            numero_nfce_homologacao: company.numero_nfce_homologacao ?? 1,
          });
        }
        this.isLoadingFiscal.set(false);
      },
      error: (error) => {
        this.isLoadingFiscal.set(false);
        this.showToast(this.backendMessage(error, 'Erro ao carregar a configuração fiscal.'), true);
      },
    });
  }

  selectCertificate(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.certificateError.set('');
    this.certificateFile.set(null);
    if (!file) return;
    if (!/\.(pfx|p12)$/i.test(file.name)) {
      this.certificateError.set('Selecione um certificado A1 no formato .pfx ou .p12.');
    } else if (file.size > 5 * 1024 * 1024) {
      this.certificateError.set('O certificado deve ter no máximo 5MB.');
    } else {
      this.certificateFile.set(file);
    }
    if (this.certificateError()) input.value = '';
  }

  saveFiscalSettings() {
    const firstConfiguration = !this.fiscalSettings();
    const password = String(this.fiscalForm.controls['certificado_senha'].value ?? '').trim();
    if (firstConfiguration && (!this.certificateFile() || !password)) {
      this.certificateError.set('Na primeira configuração, informe o certificado e a senha.');
    }
    if (
      this.fiscalForm.invalid ||
      this.certificateError() ||
      (this.certificateFile() && !password)
    ) {
      if (this.certificateFile() && !password) {
        this.certificateError.set('Informe a senha do novo certificado.');
      }
      this.fiscalForm.markAllAsTouched();
      return;
    }

    const value = this.fiscalForm.getRawValue();
    const digits = (input: unknown) => String(input ?? '').replace(/\D/g, '');
    const payload: SaveFiscalSettingsRequest = {
      ...value,
      ambiente: Number(value.ambiente) as 1 | 2,
      crt: Number(value.crt),
      cnpj: digits(value.cnpj),
      cep: digits(value.cep),
      telefone: digits(value.telefone) || undefined,
      serie_nfce: Number(value.serie_nfce),
      numero_nfce: Number(value.numero_nfce),
      serie_nfce_homologacao: Number(value.serie_nfce_homologacao),
      numero_nfce_homologacao: Number(value.numero_nfce_homologacao),
      ...(this.certificateFile() ? { certificado: this.certificateFile()! } : {}),
      ...(password ? { certificado_senha: password } : {}),
      ...(String(value.csc_token ?? '').trim()
        ? { csc_token: String(value.csc_token).trim() }
        : {}),
    };
    this.isSaving.set(true);
    this.fiscalService.saveSettings(payload).subscribe({
      next: (settings) => {
        this.fiscalSettings.set(settings);
        this.certificateFile.set(null);
        this.certificateError.set('');
        this.fiscalForm.patchValue({ csc_token: '', certificado_senha: '' });
        this.isSaving.set(false);
        this.showToast('Configuração fiscal salva com sucesso!');
      },
      error: (error) => {
        this.isSaving.set(false);
        this.showToast(this.backendMessage(error, 'Erro ao salvar a configuração fiscal.'), true);
      },
    });
  }

  private backendMessage(error: unknown, fallback: string): string {
    const message = (error as { error?: { message?: string | string[] } })?.error?.message;
    return Array.isArray(message) ? message.join(' ') : message || fallback;
  }

  loadData() {
    this.settingsService.getUsers().subscribe((res) => this.users.set(res));
    this.settingsService.getShippingRules().subscribe((res) => this.shippingRules.set(res));
    this.settingsService.getChatbotConfig().subscribe((res) => {
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
      panelClass: isError ? ['havoc-snackbar-error'] : ['havoc-snackbar-success'],
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
      },
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
        isDanger: true, // Ativa as cores vermelhas de alerta!
      },
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
      },
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
      },
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
        isDanger: true, // Ativa as cores vermelhas de alerta!
      },
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
      },
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
      },
    });
  }
}
