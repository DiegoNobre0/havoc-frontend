import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';

import { FiscalIssuanceAttempt, FiscalService } from '../../services/fiscal.service';

export interface FiscalAttemptsDialogData {
  orderId: string;
  orderCode?: string;
}

@Component({
  selector: 'app-fiscal-attempts-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, LucideAngularModule],
  templateUrl: './fiscal-attempts-dialog.html',
  styleUrl: './fiscal-attempts-dialog.scss',
})
export class FiscalAttemptsDialogComponent implements OnInit {
  private readonly fiscalService = inject(FiscalService);
  private readonly dialogRef = inject(MatDialogRef<FiscalAttemptsDialogComponent>);
  readonly data = inject<FiscalAttemptsDialogData>(MAT_DIALOG_DATA);

  readonly attempts = signal<FiscalIssuanceAttempt[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.fiscalService.getIssuanceAttempts(this.data.orderId).subscribe({
      next: (response) => {
        this.attempts.set(response.data);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.errorMessage.set(
          error?.error?.message || 'Não foi possível carregar o histórico de emissão.',
        );
        this.isLoading.set(false);
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      AUTHORIZED: 'Autorizada',
      PROCESSING: 'Processando',
      PENDING: 'Pendente',
      REJECTED: 'Rejeitada',
      UNKNOWN: 'Situação desconhecida',
      CANCELLED: 'Cancelada',
      ERROR: 'Erro',
    };
    return labels[status.toUpperCase()] ?? status;
  }

  statusTone(status: string): string {
    const value = status.toUpperCase();
    if (value === 'AUTHORIZED') return 'success';
    if (value === 'REJECTED' || value === 'ERROR') return 'danger';
    if (value === 'CANCELLED') return 'muted';
    return 'warning';
  }

  environmentLabel(environment: FiscalIssuanceAttempt['environment']): string {
    return environment === 'PRODUCAO' ? 'Produção' : 'Homologação';
  }

  formatDate(value?: string | null): string {
    if (!value) return 'Não concluída';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(value),
    );
  }
}
