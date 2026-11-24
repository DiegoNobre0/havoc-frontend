import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Eye,
  EyeOff,
  Gift,
  Image,
  ImagePlus,
  LucideAngularModule,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  X,
} from 'lucide-angular';
import { of } from 'rxjs';

import { CatalogService } from '../../../services/catalog.service';
import { Kits } from './kits';

describe('Kits', () => {
  let component: Kits;
  let fixture: ComponentFixture<Kits>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Kits,
        LucideAngularModule.pick({
          Eye,
          EyeOff,
          Gift,
          Image,
          ImagePlus,
          Pencil,
          Plus,
          RefreshCw,
          Save,
          Tag,
          Trash2,
          X,
        }),
      ],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            getKits: () => of([]),
            getProducts: () =>
              of({
                data: [],
                meta: { total: 0, page: 1, limit: 2000, totalPages: 1 },
              }),
          },
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Kits);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
