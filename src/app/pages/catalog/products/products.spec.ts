import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  ImagePlus,
  LucideAngularModule,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-angular';
import { of } from 'rxjs';

import { CatalogProduct } from '../../../models/product.models';
import { CatalogService } from '../../../services/catalog.service';
import { Products } from './products';

describe('Products', () => {
  let component: Products;
  let fixture: ComponentFixture<Products>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Products,
        LucideAngularModule.pick({
          AlertTriangle,
          CheckCircle,
          ChevronDown,
          ChevronUp,
          ExternalLink,
          Eye,
          EyeOff,
          FileText,
          FileUp,
          ImagePlus,
          Package,
          PackagePlus,
          Pencil,
          Plus,
          RefreshCw,
          Save,
          Search,
          Trash2,
          TrendingUp,
          X,
        }),
      ],
      providers: [{
        provide: CatalogService,
        useValue: {
          getCategories: () => of([]),
          getProducts: () => of({
            data: [],
            meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
          }),
        },
      }],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Products);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('fills every persisted field when editing a product', () => {
    const product: CatalogProduct = {
      id: 'product-1',
      name: 'Whey Protein',
      description: 'Chocolate',
      unit: 'UN',
      price: 149.9,
      cost_price: 70,
      price_wholesale: 119.9,
      stock_qty: 8,
      stock_min: 3,
      ncm: '2106.90.30',
      cfop: '5102',
      isActive: false,
      categories: [{ id: 'category-1', name: 'Proteínas' }],
      manufacturer: 'Havoc Labs',
      manufacturerDomain: 'havoclabs.example',
    };

    component.openModal(product);

    expect(component.productForm.getRawValue()).toEqual({
      name: 'Whey Protein',
      unit: 'UN',
      category_ids: ['category-1'],
      description: 'Chocolate',
      price: 149.9,
      cost_price: 70,
      price_wholesale: 119.9,
      stock_qty: 8,
      stock_min: 3,
      ncm: '2106.90.30',
      cfop: '5102',
      manufacturer: 'Havoc Labs',
      manufacturerDomain: 'havoclabs.example',
      isActive: false,
    });
    expect(component.showFiscal()).toBe(true);
  });

  it('fills manufacturer settings from nested label facts', () => {
    const product: CatalogProduct = {
      id: 'product-1',
      name: 'Creatina',
      price: 99.9,
      isActive: true,
      supplementFacts: {
        manufacturer: 'Havoc Labs',
        manufacturerDomain: 'havoclabs.example',
        source: { url: null, title: null, retrievedAt: null },
        servingSize: null,
        servingsPerContainer: null,
        usageInstructions: null,
        ingredients: null,
        allergenStatement: null,
        warnings: [],
        nutritionFacts: [],
        status: 'SOURCE_NOT_FOUND',
        exactProductMatch: false,
      },
    };

    component.openModal(product);

    expect(component.productForm.controls.manufacturer.value).toBe('Havoc Labs');
    expect(component.productForm.controls.manufacturerDomain.value).toBe('havoclabs.example');
  });
});
