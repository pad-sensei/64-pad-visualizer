import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const indexHtml = readFileSync(root + 'index.html', 'utf8');

describe('v1.8.1 dev service-worker escape contract', () => {
  it('runs the dev SW controller escape before external app assets', () => {
    const guard = indexHtml.indexOf('Dev Human Gate must never execute app assets under an already-controlling stale SW.');
    const firstExternal = indexHtml.indexOf('<script src="error-logger.js"></script>');
    expect(guard).toBeGreaterThan(0);
    expect(firstExternal).toBeGreaterThan(guard);
    expect(indexHtml).toContain('navigator.serviceWorker.controller && _devSwResetCount < 2');
    expect(indexHtml).toContain("_devSwReloadUrl.searchParams.set('_swreset'");
    expect(indexHtml).toContain('location.replace(_devSwReloadUrl.href)');
  });

  it('does not suppress a required controller escape with stale sessionStorage state', () => {
    expect(indexHtml).not.toContain('64pad-dev-sw-cleared');
    expect(indexHtml).toContain('window.__padIsDevServiceWorkerRegistration');
    expect(indexHtml).toContain("scopePath.indexOf('/apps/64-pad-dev/')");
  });
});
