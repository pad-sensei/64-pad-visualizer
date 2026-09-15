import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ui = require('../../chord-resolution-ui.js');

describe('v1.8.1 chord-resolution consumer', () => {
  it('normalizes stacked chord modifiers for readability without changing raw theory names', () => {
    expect(ui.padWebFormatChordDisplayName('Em7(b5)(11)')).toBe('Em7(b5,11)');
    expect(ui.padWebFormatChordDisplayName('BbMaj7(#11)(13)')).toBe('BbMaj7(#11,13)');
    expect(ui.padWebFormatChordDisplayName('Em7(b5)(11)(omit3)')).toBe('Em7(b5,11)omit3');
    expect(ui.padWebFormatChordDisplayName('Em7(b5)(11)(omit3) / E')).toBe('Em7(b5,11)omit3 / E');
    expect(ui.padWebFormatChordDisplayName('Em7(b5)')).toBe('Em7(b5)');
    expect(ui.padWebFormatChordDisplayName('Dm6(omit5)')).toBe('Dm6(omit5)');
    expect(ui.padWebFormatChordDisplayName('Ab7sus4(omit5)')).toBe('Ab7sus4(omit5)');
    expect(ui.padWebFormatChordDisplayName('C7(omit3)')).toBe('C7(omit3)');
    expect(ui.padWebFormatChordDisplayName('Em7(b5,11)omit3 / E')).toBe('Em7(b5,11)omit3 / E');

    const raw = { name: 'Em7(b5)(11)', isTopRanked: true, resolutionCompleteness: 'exact', resolutionScore: 100 };
    expect(ui.padWebFormatTopResolvedChordText([raw])).toBe('Em7(b5,11)');
    expect(raw.name).toBe('Em7(b5)(11)');
  });

  it('shows C7/E instead of the partial Edim reading', () => {
    const results = detectChord([64, 67, 70, 72]);
    expect(results[0].name).toBe('C7 / E');
    expect(results.some(candidate => candidate.name === 'Edim')).toBe(false);
    expect(results[0].resolutionCompleteness).toBe('exact');
  });

  it('shows CMaj7/E first and keeps Em(b6) only as a lower color reading', () => {
    const results = detectChord([64, 67, 71, 72]);
    expect(results[0].name).toBe('CMaj7 / E');
    const lower = results.find(candidate => candidate.name === 'Em(b6)');
    expect(lower).toBeDefined();
    expect(lower.isTopRanked).toBe(false);
    expect(lower.resolutionScore).toBeLessThan(results[0].resolutionScore);
  });

  it('keeps complete m7/6 and half-diminished/m6 aliases available', () => {
    const am7c6 = detectChord([57, 60, 64, 67]);
    expect(am7c6.some(candidate => candidate.rootPC === 9 && candidate.quality === 'm7' && candidate.resolutionCompleteness === 'exact')).toBe(true);
    expect(am7c6.some(candidate => candidate.rootPC === 0 && candidate.quality === '6' && candidate.resolutionCompleteness === 'exact')).toBe(true);

    const halfDim = detectChord([59, 62, 65, 69]);
    expect(halfDim.some(candidate => candidate.rootPC === 11 && candidate.quality === 'm7(b5)' && candidate.resolutionCompleteness === 'exact')).toBe(true);
    expect(halfDim.some(candidate => candidate.rootPC === 2 && candidate.quality === 'm6' && candidate.resolutionCompleteness === 'exact')).toBe(true);
  });

  it('presents the motivating Eb6 / Cm7 inversion as exact aliases without changing rank', () => {
    const results = detectChord([63, 67, 70, 72]); // Eb G Bb C
    expect(results[0].name).toBe('Eb6');
    expect(results[0].resolutionCompleteness).toBe('exact');

    const minor7Index = results.findIndex(candidate => candidate.name === 'Cm7 / Eb');
    expect(minor7Index).toBeGreaterThan(0);
    const minor7 = results[minor7Index];
    expect(minor7.resolutionCompleteness).toBe('exact');
    expect(minor7.isTopRanked).toBe(false);
    expect(minor7.resolutionScore).toBeLessThan(results[0].resolutionScore);

    const presentation = ui.padWebGetResolvedPresentation(results);
    expect(presentation.equivalent).toBe(true);
    expect(presentation.entries.map(entry => entry.candidate.name)).toEqual(['Eb6', 'Cm7 / Eb']);
    expect(presentation.entries.map(entry => entry.index)).toEqual([0, minor7Index]);
    expect(ui.padWebFormatTopResolvedChordText(results)).toBe('Eb6 = Cm7 / Eb');

    const omitIndex = results.findIndex(candidate => /omit/i.test(candidate.name));
    if (omitIndex >= 0) {
      expect(presentation.entries.some(entry => entry.index === omitIndex)).toBe(false);
    }
  });

  it('preserves non-alias rank-1 ties in the Push headline when an alias equation exists', () => {
    const results = detectChord([54, 67, 70, 72, 75]);
    const presentation = ui.padWebGetResolvedPresentation(results);
    expect(presentation.equivalent).toBe(true);

    const neutralTop = ui.padWebGetNeutralTopEntries(results, presentation);
    expect(neutralTop.length).toBeGreaterThan(0);

    const text = ui.padWebFormatTopResolvedChordText(results);
    expect(text).toContain(' = ');
    expect(text).toContain(' · ');
    neutralTop.forEach(entry => {
      expect(text).toContain(entry.candidate.name);
    });
  });

  it('formats full exact aliases across different score/rank groups as an equation', () => {
    const candidates = [
      {
        name: 'Eb6', isTopRanked: true,
        resolutionCompleteness: 'exact', resolutionScore: 160,
        resolutionExplainedPCS: [3, 7, 10, 0], resolutionChordCardinality: 4,
      },
      {
        name: 'Cm7 / Eb', isTopRanked: false,
        resolutionCompleteness: 'exact', resolutionScore: 120,
        resolutionExplainedPCS: [0, 10, 7, 3], resolutionChordCardinality: 4,
      },
      { name: 'EbMaj', isTopRanked: false, resolutionCompleteness: 'partial' },
    ];
    expect(ui.padWebTopResolvedGroupIsEquivalent(candidates)).toBe(true);
    expect(ui.padWebGetTopResolvedSeparator(candidates)).toBe(' = ');
    expect(ui.padWebFormatTopResolvedChordText(candidates)).toBe('Eb6 = Cm7 / Eb');
    expect(candidates[0].resolutionScore).toBe(160);
    expect(candidates[1].resolutionScore).toBe(120);
    expect(candidates[1].isTopRanked).toBe(false);
  });

  it('formats three full exact aliases as one equivalence chain even when scores differ', () => {
    const candidates = [
      { name: 'A', isTopRanked: true, resolutionCompleteness: 'exact', resolutionScore: 150, resolutionExplainedPCS: [0, 4, 7, 9], resolutionChordCardinality: 4 },
      { name: 'B', isTopRanked: false, resolutionCompleteness: 'exact', resolutionScore: 120, resolutionExplainedPCS: [9, 7, 4, 0], resolutionChordCardinality: 4 },
      { name: 'C', isTopRanked: false, resolutionCompleteness: 'exact', resolutionScore: 80, resolutionExplainedPCS: [4, 0, 9, 7], resolutionChordCardinality: 4 },
    ];
    expect(ui.padWebFormatTopResolvedChordText(candidates)).toBe('A = B = C');
  });

  it('does not call a different-cardinality exact reading an equivalent full alias', () => {
    const candidates = [
      { name: 'Eb6', isTopRanked: true, resolutionCompleteness: 'exact', resolutionScore: 160, resolutionExplainedPCS: [0, 3, 7, 10], resolutionChordCardinality: 4 },
      { name: 'Eb6(omit5)', isTopRanked: false, resolutionCompleteness: 'exact', resolutionScore: 19, resolutionExplainedPCS: [0, 3, 7, 10], resolutionChordCardinality: 3 },
    ];
    expect(ui.padWebGetPrimaryExactAliasEntries(candidates).map(entry => entry.candidate.name)).toEqual(['Eb6']);
    expect(ui.padWebFormatTopResolvedChordText(candidates)).toBe('Eb6');
  });

  it('keeps a neutral separator for same-score top candidates that are not exact aliases', () => {
    const candidates = [
      { name: 'C', isTopRanked: true, resolutionCompleteness: 'partial', resolutionScore: 90, resolutionExplainedPCS: [0, 4, 7], resolutionChordCardinality: 3 },
      { name: 'Am', isTopRanked: true, resolutionCompleteness: 'partial', resolutionScore: 90, resolutionExplainedPCS: [9, 0, 4], resolutionChordCardinality: 3 },
    ];
    expect(ui.padWebTopResolvedGroupIsEquivalent(candidates)).toBe(false);
    expect(ui.padWebGetTopResolvedSeparator(candidates)).toBe(' · ');
    expect(ui.padWebFormatTopResolvedChordText(candidates)).toBe('C · Am');
  });

  it('leaves a single top candidate unchanged', () => {
    const candidates = [{
      name: 'C7 / E', isTopRanked: true,
      resolutionCompleteness: 'exact', resolutionScore: 120,
      resolutionExplainedPCS: [0, 4, 7, 10], resolutionChordCardinality: 4,
    }];
    expect(ui.padWebTopResolvedGroupIsEquivalent(candidates)).toBe(false);
    expect(ui.padWebFormatTopResolvedChordText(candidates)).toBe('C7 / E');
  });

  it('keeps original candidate indexes available and routes Input/Chord Push headlines through the shared formatter', () => {
    const candidates = [
      { name: 'A', isTopRanked: true, resolutionCompleteness: 'exact', resolutionScore: 150, resolutionExplainedPCS: [0, 4, 7, 9], resolutionChordCardinality: 4 },
      { name: 'partial', isTopRanked: false, resolutionCompleteness: 'partial', resolutionScore: 130, resolutionExplainedPCS: [0, 4, 7], resolutionChordCardinality: 3 },
      { name: 'B', isTopRanked: false, resolutionCompleteness: 'exact', resolutionScore: 120, resolutionExplainedPCS: [9, 7, 4, 0], resolutionChordCardinality: 4 },
    ];
    expect(ui.padWebGetResolvedPresentation(candidates).entries.map(entry => entry.index)).toEqual([0, 2]);

    const root = fileURLToPath(new URL('../../', import.meta.url));
    const helper = readFileSync(root + 'chord-resolution-ui.js', 'utf8');
    const midi = readFileSync(root + 'midi.js', 'utf8');
    expect(helper).toContain('data-candidate-idx');
    expect(helper).toContain('padWebDecorateAliasEquation');
    expect(midi).toContain("AppState.mode === 'input' || AppState.mode === 'chord'");
    expect(midi).toContain('resolvedCandidates = lastDetectedCandidates');
    expect(midi).toContain('resolvedCandidates = detectChord(notes)');
    expect(midi).toContain('padWebFormatTopResolvedChordText(resolvedCandidates)');
  });

  it('keeps page and service-worker asset identities aligned', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const index = readFileSync(root + 'index.html', 'utf8');
    const sw = readFileSync(root + 'sw.js', 'utf8');
    for (const asset of [
      'pad-core/chord-resolver.js?v=1.8.1-resolution2',
      'chord-resolution-ui.js?v=1.8.1-alias-equation8',
      'plain.js?v=1.8.1-resolution2',
      'midi.js?v=1.8.1-altered-ust1',
    ]) {
      expect(index).toContain(asset);
      expect(sw).toContain(asset);
    }
  });
});
