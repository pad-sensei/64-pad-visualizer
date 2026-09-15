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

  it('fails closed and visibly blocks the Human Gate if a controller survives both reset attempts', () => {
    expect(indexHtml).toContain('navigator.serviceWorker.controller && _devSwResetCount >= 2');
    expect(indexHtml).toContain('window.__DEV_SW_ESCAPE_FAILED = true');
    expect(indexHtml).toContain("panel.id = 'dev-sw-escape-failed'");
    expect(indexHtml).toContain('Human Gate blocked after two reset attempts.');
    expect(indexHtml).toContain('Do not continue this Human Gate until the controlling service worker is cleared.');
  });

  it('has a bounded fallback reload if service-worker cleanup promises stall', () => {
    expect(indexHtml).toContain('var _devSwEscapeFallback = setTimeout(function()');
    expect(indexHtml).toContain('clearTimeout(_devSwEscapeFallback)');
  });
});
