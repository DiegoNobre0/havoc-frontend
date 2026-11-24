import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { FiscalCancelDialogComponent } from './fiscal-cancel-dialog';

describe('FiscalCancelDialogComponent', () => {
  let component: FiscalCancelDialogComponent;
  let fixture: ComponentFixture<FiscalCancelDialogComponent>;
  const dialogRef = { close: vi.fn() };

  beforeEach(async () => {
    dialogRef.close.mockClear();
    await TestBed.configureTestingModule({
      imports: [FiscalCancelDialogComponent],
      providers: [{ provide: MatDialogRef, useValue: dialogRef }],
    }).compileComponents();
    fixture = TestBed.createComponent(FiscalCancelDialogComponent);
    component = fixture.componentInstance;
  });

  it('requires 15 trimmed characters and limits the justification to 255', () => {
    component.justification.setValue('              motivo curto              ');
    component.submit();
    expect(component.form.invalid).toBe(true);
    expect(dialogRef.close).not.toHaveBeenCalled();

    component.justification.setValue('a'.repeat(256));
    expect(component.justification.hasError('maxlength')).toBe(true);
  });

  it('returns the trimmed valid justification', () => {
    component.justification.setValue('  Cancelamento solicitado pelo cliente.  ');
    component.submit();
    expect(dialogRef.close).toHaveBeenCalledWith('Cancelamento solicitado pelo cliente.');
  });
});
