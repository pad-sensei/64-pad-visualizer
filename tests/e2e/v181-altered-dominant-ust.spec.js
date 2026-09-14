import { test, expect } from '@playwright/test';

async function captureAltered(page, notes) {
  return page.evaluate(async (heldNotes) => {
    AppState.mode = 'input';
    AppState.key = 0;
    AppState.scaleIdx = 0;
    PlainState.activeNotes.clear();
    PlainState.subMode = 'idle';
    if (typeof clearInstrumentInput === 'function') clearInstrumentInput();
    if (typeof releaseAllMidiHeldSources === 'function') releaseAllMidiHeldSources(true);
    if (typeof window.applyVelocityCurve !== 'function') window.applyVelocityCurve = value => value;

    heldNotes.forEach(note => onMidiNoteOn(note, 100));
    await new Promise(resolve => setTimeout(resolve, 120));

    const candidates = detectChord(heldNotes);
    const payload = padWebGetLatestObservedShellUstPayload();
    const push = padWebGetPushDisplaySnapshot();
    return {
      candidates: candidates.slice(0, 8).map(candidate => ({
        name: candidate.name,
        rootPC: candidate.rootPC,
        quality: candidate.quality,
        score: candidate.resolutionScore,
        isTopRanked: candidate.isTopRanked,
        tensionLabels: candidate.tensionLabels,
      })),
      dom: document.getElementById('midi-detect').textContent.replace(/\s+/g, ' ').trim(),
      payload,
      push,
    };
  }, notes);
}

test.describe('v1.8.1 altered dominant + UST Human Gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./?silent=1&e2e=v181-altered-dominant-ust');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Bb7(b9,b13) stays above Bm6 slash alias and keeps bII minor UST on Web + Push', async ({ page }) => {
    const result = await captureAltered(page, [34, 44, 50, 54, 59]);

    expect(result.candidates[0]).toMatchObject({
      name: 'Bb7(b9,b13)', rootPC: 10, quality: '7', isTopRanked: true,
    });
    expect(result.candidates[0].tensionLabels).toEqual(expect.arrayContaining(['b9', 'b13']));
    const slash = result.candidates.find(candidate => candidate.name === 'Bm6 / A#' || candidate.name === 'Bm6 / Bb');
    expect(slash).toBeDefined();
    expect(slash.score).toBeLessThan(result.candidates[0].score);

    expect(result.dom).toContain('Bb7(b9,b13)');
    expect(result.dom).toContain('Bm (bII)');
    expect(result.dom).toContain('b9,3,b13');
    expect(result.payload?.chord?.name).toBe('Bb7(b9,b13)');
    expect(result.payload?.shell?.degrees).toEqual(expect.arrayContaining(['b7', '3']));
    expect(result.payload?.ust?.name).toContain('Bm (bII)');
    expect(result.payload?.ust?.base).toBe('Bb7');
    expect(result.push.chord).toBe('Bb7(b9,b13)');
    expect(result.push.ust).toContain('Bm (bII)');
    expect(result.push.ust).toContain('/ Bb7');
    expect(result.push.tensions.split(/\s+/)).toEqual(expect.arrayContaining(['b9', 'b13']));
  });

  test('Bb7(b13) stays above Bbaug and exposes IIIaug UST on Web + Push', async ({ page }) => {
    const result = await captureAltered(page, [34, 44, 50, 54]);

    expect(result.candidates[0]).toMatchObject({
      name: 'Bb7(b13)', rootPC: 10, quality: '7', isTopRanked: true,
    });
    expect(result.candidates[0].tensionLabels).toContain('b13');
    const aug = result.candidates.find(candidate => candidate.name === 'Bbaug');
    expect(aug).toBeDefined();
    expect(aug.score).toBeLessThan(result.candidates[0].score);

    expect(result.dom).toContain('Bb7(b13)');
    expect(result.dom).toContain('Daug (III)');
    expect(result.dom).toContain('3,b13,1');
    expect(result.payload?.chord?.name).toBe('Bb7(b13)');
    expect(result.payload?.shell?.degrees).toEqual(expect.arrayContaining(['b7', '3']));
    expect(result.payload?.ust?.name).toContain('Daug (III)');
    expect(result.payload?.ust?.base).toBe('Bb7');
    expect(result.push.chord).toBe('Bb7(b13)');
    expect(result.push.ust).toContain('Daug (III)');
    expect(result.push.ust).toContain('/ Bb7');
    expect(result.push.tensions.split(/\s+/)).toContain('b13');
  });
});
