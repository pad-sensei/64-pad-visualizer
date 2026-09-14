import { test, expect } from '@playwright/test';

test.describe('v1.8.1 live alias equation', () => {
  test('renders Eb6 = Cm7 / Eb in the actual INPUT display path', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('./?silent=1&e2e=v181-alias');
    await page.waitForLoadState('domcontentloaded');

    const result = await page.evaluate(() => {
      AppState.mode = 'input';
      PlainState.activeNotes = new Set([63, 67, 70, 72]); // Eb G Bb C
      if (typeof clearInstrumentInput === 'function') clearInstrumentInput();
      updatePlainDisplay();

      const candidates = detectChord([63, 67, 70, 72]);
      const root = document.getElementById('midi-detect');
      const top = root && root.querySelector('.detect-top-group');
      return {
        wrapped: updatePlainDisplay.__padAliasEquationWrapped === true,
        topText: top ? top.textContent.replace(/\s+/g, ' ').trim() : '',
        topIndexes: top ? Array.from(top.querySelectorAll('[data-candidate-idx]')).map(el => Number(el.dataset.candidateIdx)) : [],
        aliasSeparators: top ? Array.from(top.querySelectorAll('.detect-alias-separator')).map(el => el.textContent) : [],
        primaryName: candidates[0] && candidates[0].name,
        primaryScore: candidates[0] && candidates[0].resolutionScore,
        aliasIndex: candidates.findIndex(candidate => candidate.name === 'Cm7 / Eb'),
        aliasScore: (candidates.find(candidate => candidate.name === 'Cm7 / Eb') || {}).resolutionScore,
        aliasTop: (candidates.find(candidate => candidate.name === 'Cm7 / Eb') || {}).isTopRanked,
        lowerText: root ? root.textContent : '',
      };
    });

    expect(result.wrapped).toBe(true);
    expect(result.primaryName).toBe('Eb6');
    expect(result.primaryScore).toBeGreaterThan(result.aliasScore);
    expect(result.aliasTop).toBe(false);
    expect(result.aliasIndex).toBeGreaterThan(0);
    expect(result.topText).toContain('Eb6');
    expect(result.topText).toContain('Cm7 / Eb');
    expect(result.aliasSeparators).toContain('=');
    expect(result.topIndexes).toEqual([0, result.aliasIndex]);
    expect(result.topText).not.toMatch(/omit/i);
    expect(pageErrors).toEqual([]);
  });
});
