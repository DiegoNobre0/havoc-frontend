import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import {
  LucideAngularModule,
  Pencil,
  ReceiptText,
  Trash2,
  Truck,
  UserPlus,
  Users,
} from 'lucide-angular';

import { Settings } from './settings';
import { AuthService } from '../../services/auth.service';
import { FiscalService } from '../../services/fiscal.service';
import { SettingsService } from '../../services/settings.service';

describe('Settings', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Settings,
        LucideAngularModule.pick({ Pencil, ReceiptText, Trash2, Truck, UserPlus, Users }),
      ],
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ role: 'ADMIN' }) } },
        {
          provide: SettingsService,
          useValue: {
            getUsers: () => of([]),
            getShippingRules: () => of([]),
            getChatbotConfig: () => of(null),
          },
        },
        {
          provide: FiscalService,
          useValue: { getSettings: () => of(null), saveSettings: vi.fn() },
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requires company data and an A1 certificate on first configuration', () => {
    expect(component.isAdmin()).toBe(true);
    component.saveFiscalSettings();

    expect(component.fiscalForm.invalid).toBe(true);
    expect(component.certificateError()).toContain('primeira configuração');
  });

  it('rejects certificates with an invalid extension or over 5MB', () => {
    const input = document.createElement('input');
    const invalidFile = new File(['x'], 'certificado.txt');
    Object.defineProperty(input, 'files', { configurable: true, value: [invalidFile] });
    component.selectCertificate({ target: input } as unknown as Event);
    expect(component.certificateError()).toContain('.pfx ou .p12');

    const largeFile = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'certificado.pfx');
    Object.defineProperty(input, 'files', { value: [largeFile] });
    component.selectCertificate({ target: input } as unknown as Event);
    expect(component.certificateError()).toContain('5MB');
  });
});
