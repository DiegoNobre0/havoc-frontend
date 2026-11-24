import { Injectable, effect, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'havoc-admin-theme';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  readonly theme = signal<AppTheme>(this.readStoredTheme());

  constructor() {
    this.applyTheme(this.theme());
    effect(() => {
      const current = this.theme();
      this.applyTheme(current);
      this.persistTheme(current);
    });
  }

  toggleTheme(): void {
    this.theme.update((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
  }

  private readStoredTheme(): AppTheme {
    if (typeof window === 'undefined') return 'dark';
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'dark';
    } catch {
      return 'dark';
    }
  }

  private persistTheme(theme: AppTheme): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage failures
    }
  }

  private applyTheme(theme: AppTheme): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
  }
}
