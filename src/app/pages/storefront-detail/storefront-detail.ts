import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Subject, catchError, combineLatest, map, of, startWith, switchMap, tap } from 'rxjs';
import { StorefrontItemDetail, StorefrontItemType } from '../../models/storefront.models';
import { SupplementFacts, isPublicSupplementFacts } from '../../models/supplement-facts.models';
import { SupplementConsultantComponent } from '../../components/supplement-consultant/supplement-consultant';
import { CartService } from '../../services/cart.service';
import { StorefrontService } from '../../services/storefront.service';

@Component({
  selector: 'app-storefront-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule, SupplementConsultantComponent],
  templateUrl: './storefront-detail.html',
  styleUrl: './storefront-detail.scss',
})
export class StorefrontDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storefrontService = inject(StorefrontService);
  private readonly destroyRef = inject(DestroyRef);
  readonly cart = inject(CartService);

  readonly item = signal<StorefrontItemDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly quantity = signal(1);
  readonly added = signal(false);
  readonly type = signal<StorefrontItemType>('product');
  readonly publicFacts = computed<SupplementFacts | null>(() => {
    const item = this.item();
    if (item?.type !== 'product') return null;
    const facts = item.supplementFacts;
    return isPublicSupplementFacts(facts) ? facts : null;
  });
  readonly consultantContext = computed(() => {
    const item = this.item();
    return item ? {
      surface: item.type === 'kit' ? 'kit-detail' as const : 'product-detail' as const,
      item: { type: item.type, id: item.id, slug: item.slug },
    } : null;
  });
  private readonly reload = new Subject<void>();

  ngOnInit(): void {
    combineLatest([
      this.route.paramMap,
      this.route.data,
      this.reload.pipe(startWith(undefined)),
    ]).pipe(
      tap(() => {
        this.loading.set(true);
        this.error.set(false);
        this.added.set(false);
        this.quantity.set(1);
      }),
      switchMap(([params, data]) => {
        const type = data['type'] as StorefrontItemType;
        this.type.set(type);
        return this.storefrontService.getItem(type, params.get('slug') ?? '').pipe(
          map((item) => ({ item, failed: false })),
          catchError(() => of({ item: null, failed: true })),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ item, failed }) => {
      this.item.set(item);
      this.error.set(failed);
      this.loading.set(false);
    });
  }

  load(): void {
    this.reload.next();
  }

  changeQuantity(delta: number): void {
    this.quantity.update((quantity) => Math.max(1, Math.min(99, quantity + delta)));
  }

  addToCart(goToCheckout = false): void {
    const item = this.item();
    if (!item?.available) return;
    this.cart.add(item, this.quantity());
    this.added.set(true);
    if (goToCheckout) {
      void this.router.navigate(['/checkout'], { queryParams: { step: 2 } });
    }
  }
}
