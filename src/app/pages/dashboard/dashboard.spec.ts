import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  Calendar,
  ChevronDown,
  Clock,
  DollarSign,
  Download,
  LucideAngularModule,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-angular';
import { of } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Dashboard,
        LucideAngularModule.pick({
          Calendar,
          ChevronDown,
          Clock,
          DollarSign,
          Download,
          Package,
          RefreshCw,
          ShoppingBag,
          TrendingUp,
          Users,
        }),
      ],
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ name: 'Administrador' }) } },
        {
          provide: DashboardService,
          useValue: {
            getSummary: () =>
              of({ revenueToday: 0, ordersToday: 0, pendingOrders: 0, newCustomers: 0 }),
            getRecentOrders: () =>
              of({
                data: [],
                meta: { total: 0, page: 1, limit: 5, totalPages: 1 },
              }),
            getSalesReport: () => of([]),
            getTopProducts: () => of([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
