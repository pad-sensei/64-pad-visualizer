import { describe, it, expect, vi } from 'vitest';
import { isolateColourPage } from '../e2e/helpers/isolated-colour-page.js';

function fakePage() {
  let handler;
  const page = { on: vi.fn(), route: vi.fn(async (_pattern, callback) => { handler = callback; }), addInitScript: vi.fn() };
  return { page, route: () => handler };
}

describe('colour browser CI boundary before any navigation', () => {
  it.each([
    'https://murinaikurashi.com/apps/64-pad/',
    'https://localhost:8080/', 'http://localhost:18769/',
    'http://127.0.0.1:8081/', 'http://127.0.0.1.evil.test:8080/',
    'http://user:pass@localhost:8080/', 'not a URL',
  ])('rejects %s before installing page hooks', async url => {
    const { page } = fakePage();
    await expect(isolateColourPage(page, url)).rejects.toThrow('HTTP loopback on port 8080');
    expect(page.on).not.toHaveBeenCalled(); expect(page.route).not.toHaveBeenCalled(); expect(page.addInitScript).not.toHaveBeenCalled();
  });
  it.each(['http://localhost:8080/', 'http://127.0.0.1:8080/', 'http://[::1]:8080/'])('limits %s to its exact origin and blocks third-party requests', async url => {
    const fixture = fakePage();
    const errors = await isolateColourPage(fixture.page, url);
    const route = target => ({ request: () => ({ url: () => target }), continue: vi.fn(), abort: vi.fn() });
    const local = route(new URL('render.js', url).href);
    await fixture.route()(local); expect(local.continue).toHaveBeenCalledOnce(); expect(local.abort).not.toHaveBeenCalled();
    const foreign = route('https://analytics.example.test/event');
    await fixture.route()(foreign); expect(foreign.abort).toHaveBeenCalledWith('blockedbyclient'); expect(foreign.continue).not.toHaveBeenCalled();
    expect(errors.blockedExternal).toEqual(['https://analytics.example.test/event']);
    expect(fixture.page.addInitScript).toHaveBeenCalledOnce();
  });
});
