import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { reloadAfterChunkError } from './app/errors/chunk-load-error.handler';

window.addEventListener('error', (event) => reloadAfterChunkError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reloadAfterChunkError(event.reason));

const currentUrl = new URL(window.location.href);
if (currentUrl.searchParams.has('_app_reload')) {
  currentUrl.searchParams.delete('_app_reload');
  window.history.replaceState(window.history.state, '', currentUrl);
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
