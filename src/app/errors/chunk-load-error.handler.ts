import { ErrorHandler, Injectable } from '@angular/core';

const RELOAD_STORAGE_KEY = 'havoc:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 60_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'reason' in error) {
    return errorMessage((error as { reason: unknown }).reason);
  }
  return String(error ?? '');
}

export function isChunkLoadError(error: unknown): boolean {
  return /(?:failed to fetch dynamically imported module|failed to load module script|importing a module script failed|chunkloaderror|loading chunk \d+ failed)/i.test(
    errorMessage(error),
  );
}

export function reloadAfterChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error) || typeof window === 'undefined') return false;

  const lastReload = Number(window.sessionStorage.getItem(RELOAD_STORAGE_KEY) ?? 0);
  if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return false;

  window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(Date.now()));
  const url = new URL(window.location.href);
  url.searchParams.set('_app_reload', String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

@Injectable()
export class ChunkLoadErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    if (!reloadAfterChunkError(error)) console.error(error);
  }
}
