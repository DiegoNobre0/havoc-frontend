import { isChunkLoadError } from './chunk-load-error.handler';

describe('chunk load recovery', () => {
  it('recognizes stale lazy-module failures', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /chunk-old.js'))).toBe(true);
    expect(isChunkLoadError('Failed to load module script: MIME type text/html')).toBe(true);
    expect(isChunkLoadError(new Error('API returned 500'))).toBe(false);
  });
});
