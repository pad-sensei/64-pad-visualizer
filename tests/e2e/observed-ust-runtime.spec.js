import { test, expect } from '@playwright/test';

function pushSource(mappedMidi, row, col, physicalPadId) {
  return {
    deviceId: 'push-3',
    sourceId: `push-3:${physicalPadId}`,
    rawNote: 36 + row * 8 + col,
    mappedMidi,
    row,
    col,
    physicalPadId,
    positionConfidence: 'exact',
  };
}

test.describe('v1.7 observed Shell/UST browser runtime', () => {
  test('physical upper F-Bb-Eb over Cm7 renders Q4 and not a shell-borrowed Q1', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');

    const sources = [
      pushSource(60, 0, 0, 'shell-c'),
      pushSource(63, 0, 3, 'shell-eb'),
      pushSource(70, 2, 0, 'shell-bb'),
      pushSource(77, 3, 2, 'upper-f'),
      pushSource(82, 4, 2, 'upper-bb'),
      pushSource(87, 5, 2, 'upper-eb'),
    ];

    const result = await page.evaluate((heldSources) => ({
      observedApi: typeof padAnalyzeObservedShellUst,
      consumerApi: typeof padWebFormatObservedUstInlineHtml,
      installed: window.__padObservedUstFormatterInstalled === true,
      html: formatDetectedUstInlineHtml(
        heldSources.map(source => source.mappedMidi),
        0,
        'Cm7(11)',
        heldSources
      ),
    }), sources);

    expect(result.observedApi).toBe('function');
    expect(result.consumerApi).toBe('function');
    expect(result.installed).toBe(true);
    expect(result.html).toContain('Q4');
    expect(result.html).toContain('11,b7,m3');
    expect(result.html).toContain('Cm7');
    expect(result.html).not.toContain('Q1');
    expect(pageErrors.filter(message => /padAnalyzeObservedShellUst|padWebFormatObservedUstInlineHtml/.test(message))).toEqual([]);
  });
});
