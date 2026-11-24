import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';

function trimmedLength(control: AbstractControl<string>): ValidationErrors | null {
  const length = control.value.trim().length;
  return length >= 15 ? null : { trimmedMinlength: true };
}

@Component({
  selector: 'app-fiscal-cancel-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, LucideAngularModule],
  templateUrl: './fiscal-cancel-dialog.html',
  styleUrl: './fiscal-cancel-dialog.scss',
})
export class FiscalCancelDialogComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly dialogRef = inject(
    MatDialogRef<FiscalCancelDialogComponent, string | undefined>,
  );

  readonly form = this.fb.group({
    justification: ['', [Validators.required, Validators.maxLength(255), trimmedLength]],
  });

  get justification() {
    return this.form.controls.justification;
  }

  get characterCount(): number {
    return this.justification.value.length;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  submit(): void {
    const justification = this.justification.value.trim();
    this.justification.setValue(justification);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(justification);
  }
}
