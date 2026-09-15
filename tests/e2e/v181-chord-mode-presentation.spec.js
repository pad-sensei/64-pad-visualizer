import { test, expect } from '@playwright/test';

async function prepareChordMode(page, notes) {
  await page.goto('./?silent=1&e2e=v181-chord-mode-presentation');
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(inputNotes => {
    AppState.mode = 'chord';
    PlainState.activeNotes.clear();
    PlainState.subMode = 'idle';
    if (typeof clearInstrumentInput === 'function') clearInstrumentInput();
    if (typeof releaseAllMidiHeldSources === 'function') releaseAllMidiHeldSources(true);
    if (typeof window.applyVelocityCurve !== 'function') {
      window.applyVelocityCurve = value => value;
    }
    inputNotes.forEach(note => onMidiNoteOn(note, 100));
  }, notes);

  await page.waitForTimeout(150);
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

test.describe('v1.8.1 chord-mode presentation parity', () => {
  test('renders Eb6 = Cm7 / Eb on Web and Push without changing resolver ranking', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await prepareChordMode(page, [63, 67, 70, 72]);

    const result = await page.evaluate(() => {
      const notes = [63, 67, 70, 72];
      const candidates = detectChord(notes);
      const root = document.getElementById('midi-detect');
      const heading = root && (root.querySelector('.detect-top-group') || root.firstElementChild);
      const alias = candidates.find(candidate => candidate.name === 'Cm7 / Eb');
      const pushSnapshot = padWebGetPushDisplaySnapshot();
      return {
        mode: AppState.mode,
        headingText: heading ? heading.textContent : '',
        primaryName: candidates[0] && candidates[0].name,
        primaryScore: candidates[0] && candidates[0].resolutionScore,
        aliasScore: alias && alias.resolutionScore,
        aliasTop: alias && alias.isTopRanked,
        pushChord: pushSnapshot && pushSnapshot.chord,
      };
    });

    expect(result.mode).toBe('chord');
    expect(result.primaryName).toBe('Eb6');
    expect(result.primaryScore).toBeGreaterThan(result.aliasScore);
    expect(result.aliasTop).toBe(false);
    expect(normalizedText(result.headingText)).toContain('Eb6');
    expect(normalizedText(result.headingText)).toContain('Cm7 / Eb');
    expect(normalizedText(result.headingText)).toContain('=');
    expect(normalizedText(result.pushChord)).toContain('Eb6 = Cm7 / Eb');
    expect(pageErrors).toEqual([]);
  });

  test('normalizes stacked modifiers and omission labels in the live chord-mode writer', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await prepareChordMode(page, [52, 55, 58, 62, 69]);

    const result = await page.evaluate(() => {
      const notes = [52, 55, 58, 62, 69];
      const candidates = detectChord(notes);
      const root = document.getElementById('midi-detect');
      const heading = root && (root.querySelector('.detect-top-group') || root.firstElementChild);
      return {
        mode: AppState.mode,
        rawPrimaryName: candidates[0] && candidates[0].name,
        headingText: heading ? heading.textContent : '',
        allText: root ? root.textContent : '',
      };
    });

    expect(result.mode).toBe('chord');
    expect(result.rawPrimaryName).toBe('Em7(b5)(11)');
    expect(normalizedText(result.headingText)).toBe('Em7(b5,11)');
    expect(normalizedText(result.allText)).toContain('Em7(b5,11)omit3');
    expect(pageErrors).toEqual([]);
  });
});
