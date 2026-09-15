import { test, expect } from '@playwright/test';

test.describe('v1.8.1 live alias equation', () => {
  test('renders Eb6 = Cm7 / Eb through the live MIDI input path', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('./?silent=1&e2e=v181-alias');
    await page.waitForLoadState('domcontentloaded');

    const result = await page.evaluate(() => {
      AppState.mode = 'input';
      PlainState.activeNotes.clear();
      PlainState.subMode = 'idle';
      if (typeof clearInstrumentInput === 'function') clearInstrumentInput();
      if (typeof releaseAllMidiHeldSources === 'function') releaseAllMidiHeldSources(true);
      if (typeof window.applyVelocityCurve !== 'function') {
        window.applyVelocityCurve = value => value;
      }

      [63, 67, 70, 72].forEach(note => onMidiNoteOn(note, 100));

      const candidates = detectChord([63, 67, 70, 72]);
      const root = document.getElementById('midi-detect');
      const top = root && root.querySelector('.detect-top-group');
      const pushSnapshot = padWebGetPushDisplaySnapshot();
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
        pushChord: pushSnapshot && pushSnapshot.chord,
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
    expect(result.pushChord).toContain('Eb6 = Cm7 / Eb');
    expect(pageErrors).toEqual([]);
  });

  test('normalizes a stacked modifier label in the live Web presentation', async ({ page }) => {
    await page.goto('./?silent=1&e2e=v181-readable-label');
    await page.waitForLoadState('domcontentloaded');

    const result = await page.evaluate(() => {
      const root = document.getElementById('midi-detect');
      root.innerHTML = '<div class="detect-top-group"><span class="detect-candidate-best" data-candidate-idx="0">Em7(b5)(11)</span></div>';
      const candidates = [{ name: 'Em7(b5)(11)', isTopRanked: true, resolutionCompleteness: 'exact', resolutionScore: 100 }];
      padWebDecorateAliasEquation(root, candidates);
      return {
        text: root.querySelector('[data-candidate-idx="0"]').textContent,
        raw: candidates[0].name,
        pushText: padWebFormatTopResolvedChordText(candidates),
      };
    });

    expect(result.text).toBe('Em7(b5,11)');
    expect(result.pushText).toBe('Em7(b5,11)');
    expect(result.raw).toBe('Em7(b5)(11)');
  });

  test('keeps omit-only labels parenthesized in Web and Push', async ({ page }) => {
    await page.goto('./?silent=1&e2e=v181-readable-omit');
    await page.waitForLoadState('domcontentloaded');

    const result = await page.evaluate(() => {
      const root = document.getElementById('midi-detect');
      root.innerHTML = '<div class="detect-top-group"><span class="detect-candidate-best" data-candidate-idx="0">C7(omit3)</span></div>';
      const candidates = [{ name: 'C7(omit3)', isTopRanked: true, resolutionCompleteness: 'exact', resolutionScore: 100 }];
      padWebDecorateAliasEquation(root, candidates);
      return {
        text: root.querySelector('[data-candidate-idx="0"]').textContent,
        raw: candidates[0].name,
        pushText: padWebFormatTopResolvedChordText(candidates),
      };
    });

    expect(result.text).toBe('C7(omit3)');
    expect(result.pushText).toBe('C7(omit3)');
    expect(result.raw).toBe('C7(omit3)');
  });

  test('draws a shrinking scale-2 equation with integer pixel cells in Chromium', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('./?silent=1&e2e=v181-push-fit');
    await page.waitForLoadState('domcontentloaded');

    const result = await page.evaluate(async () => {
      const text = 'Eb7(b9) = Edim7(7) / D# = Dbdim7(9) / D# = Bbdim7(11) / D#';
      const { fitPushPixelText } = await import('./push-display-text-fit.js?v=20260914-readable-wrap');
      const layout = fitPushPixelText(text, 4, 688);
      const cells = [];
      const originalFillRect = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function(x, y, width, height) {
        if (x >= 32 && x < 720 && y >= 42 && y < 70 && width <= 4 && height <= 4) {
          cells.push({ x, y, width, height });
        }
        return originalFillRect.call(this, x, y, width, height);
      };

      const originalSnapshot = window.padWebGetPushDisplaySnapshot;
      window.padWebGetPushDisplaySnapshot = () => ({
        chord: text,
        notes: [], shell: '', ust: '', tensions: '', key: '', scale: '', mode: 'input',
      });

      const button = document.getElementById('push-webusb-display-btn');
      if (button) button.dataset.state = 'running';
      const target = document.getElementById('midi-detect');
      if (target) target.appendChild(document.createTextNode(' '));
      await new Promise(resolve => setTimeout(resolve, 50));

      window.padWebGetPushDisplaySnapshot = originalSnapshot;
      CanvasRenderingContext2D.prototype.fillRect = originalFillRect;
      return { layout, cells };
    });

    expect(result.layout.text).toBe('Eb7(b9) = Edim7(7) / D# = Dbdim7(9) / D# = Bbdim7(11) / D#');
    expect(result.layout.lines).toHaveLength(1);
    expect(result.layout.scale).toBe(2);
    expect(result.layout.width).toBeLessThanOrEqual(688);
    expect(result.cells.length).toBeGreaterThan(0);
    expect(result.cells.some(cell => cell.width === 2 && cell.height === 2)).toBe(true);
    expect(result.cells.every(cell => Number.isInteger(cell.x) && Number.isInteger(cell.y) && Number.isInteger(cell.width) && Number.isInteger(cell.height))).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
