import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LucideAngularModule, Pencil, Plus, RefreshCw, Tag, Trash2, X } from 'lucide-angular';
import { of } from 'rxjs';

import { CatalogService } from '../../../services/catalog.service';
import { Categories } from './categories';

describe('Categories', () => {
  let component: Categories;
  let fixture: ComponentFixture<Categories>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Categories, LucideAngularModule.pick({ Pencil, Plus, RefreshCw, Tag, Trash2, X })],
      providers: [
        { provide: CatalogService, useValue: { getCategories: () => of([]) } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Categories);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
