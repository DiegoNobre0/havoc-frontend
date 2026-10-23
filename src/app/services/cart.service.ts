import { Injectable, computed, effect, signal } from '@angular/core';
import { StorefrontItem } from '../models/storefront.models';

export interface CartItem {
  type: 'product' | 'kit';
  id: string;
  slug: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  unit?: string;
}

const STORAGE_KEY = 'havoc-storefront-cart';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly itemsState = signal<CartItem[]>(this.restore());

  readonly items = this.itemsState.asReadonly();
  readonly count = computed(() => this.itemsState().reduce((total, item) => total + item.quantity, 0));
  readonly subtotal = computed(() =>
    this.itemsState().reduce((total, item) => total + item.price * item.quantity, 0),
  );

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.itemsState()));
      } catch {
        // Storage may be unavailable in private browsing or when the quota is exhausted.
      }
    });
  }

  add(item: StorefrontItem, quantity = 1): void {
    if (!item.available || !Number.isInteger(quantity) || quantity < 1) return;

    this.itemsState.update((items) => {
      const index = items.findIndex((cartItem) => cartItem.type === item.type && cartItem.id === item.id);
      if (index === -1) {
        const cartItem: CartItem = {
          type: item.type,
          id: item.id,
          slug: item.slug,
          name: item.name,
          price: item.price,
          quantity,
          imageUrl: item.imageUrl,
          unit: item.type === 'product' ? item.unit : undefined,
        };
        return [...items, cartItem];
      }

      return items.map((cartItem, itemIndex) =>
        itemIndex === index ? { ...cartItem, quantity: cartItem.quantity + quantity } : cartItem,
      );
    });
  }

  remove(type: CartItem['type'], id: string): void {
    this.itemsState.update((items) => items.filter((item) => item.type !== type || item.id !== id));
  }

  update(type: CartItem['type'], id: string, quantity: number): void {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) {
      this.remove(type, id);
      return;
    }
    this.itemsState.update((items) =>
      items.map((item) => (item.type === type && item.id === id ? { ...item, quantity } : item)),
    );
  }

  clear(): void {
    this.itemsState.set([]);
  }

  private restore(): CartItem[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];

      return parsed.filter((item): item is CartItem => {
        if (!item || typeof item !== 'object') return false;
        const value = item as Partial<CartItem>;
        return (
          (value.type === 'product' || value.type === 'kit') &&
          typeof value.id === 'string' &&
          typeof value.slug === 'string' &&
          typeof value.name === 'string' &&
          typeof value.price === 'number' &&
          Number.isFinite(value.price) &&
          typeof value.quantity === 'number' &&
          Number.isInteger(value.quantity) &&
          value.quantity > 0 &&
          (typeof value.imageUrl === 'string' || value.imageUrl === null)
        );
      });
    } catch {
      return [];
    }
  }
}
