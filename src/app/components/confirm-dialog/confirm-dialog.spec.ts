import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AlertTriangle, Check, HelpCircle, LucideAngularModule, Trash2 } from 'lucide-angular';

import { ConfirmDialogComponent } from './confirm-dialog';

describe('ConfirmDialog', () => {
  let component: ConfirmDialogComponent;
  let fixture: ComponentFixture<ConfirmDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ConfirmDialogComponent,
        LucideAngularModule.pick({ AlertTriangle, Check, HelpCircle, Trash2 }),
      ],
      providers: [
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: { title: 'Confirmar', message: 'Continuar?' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
