import { test, expect } from '@playwright/test';

test.describe('v1.7 browser MIDI runtime', () => {
  test('source ownership helper is available before MIDI runtime is used', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');

    const runtime = await page.evaluate(() => ({
      heldFactory: typeof createMidiHeldState,
      bindingFactory: typeof createMidiPortBindingRegistry,
      heldSourcesReader: typeof getMidiHeldSources,
      heldSources: typeof getMidiHeldSources === 'function' ? getMidiHeldSources() : null,
    }));

    expect(runtime.heldFactory).toBe('function');
    expect(runtime.bindingFactory).toBe('function');
    expect(runtime.heldSourcesReader).toBe('function');
    expect(runtime.heldSources).toEqual([]);
    expect(pageErrors.filter(message => /createMidiHeldState|createMidiPortBindingRegistry/.test(message))).toEqual([]);
  });
});
