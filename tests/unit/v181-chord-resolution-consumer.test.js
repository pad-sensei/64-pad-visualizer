import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ui = require('../../chord-resolution-ui.js');

describe('v1.8.1 chord-resolution consumer', () => {
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

  it('formats exact equal-score aliases as an explicit equivalence chain', () => {
    const candidates = [
      {
        name: 'Eb6', isTopRanked: true,
        resolutionCompleteness: 'exact', resolutionScore: 120,
        resolutionExplainedPCS: [0, 3, 7, 8],
      },
      {
        name: 'Cm7 / Eb', isTopRanked: true,
        resolutionCompleteness: 'exact', resolutionScore: 120,
        resolutionExplainedPCS: [8, 7, 3, 0],
      },
      { name: 'EbMaj', isTopRanked: false },
    ];
    expect(ui.padWebGetTopResolvedCandidates(candidates).map(candidate => candidate.name)).toEqual(['Eb6', 'Cm7 / Eb']);
    expect(ui.padWebTopResolvedGroupIsEquivalent(ui.padWebGetTopResolvedCandidates(candidates))).toBe(true);
    expect(ui.padWebGetTopResolvedSeparator(candidates)).toBe(' = ');
    expect(ui.padWebFormatTopResolvedChordText(candidates)).toBe('Eb6 = Cm7 / Eb');
  });

  it('formats three exact equal-score aliases as one equivalence chain', () => {
    const candidates = ['A', 'B', 'C'].map(name => ({
      name,
      isTopRanked: true,
      resolutionCompleteness: 'exact',
      resolutionScore: 88,
      resolutionExplainedPCS: [0, 4, 7, 9],
    }));
    expect(ui.padWebFormatTopResolvedChordText(candidates)).toBe('A = B = C');
  });

  it('proves the equivalence path with real detector output', () => {
    const results = detectChord([52, 54, 62, 70]);
    const top = ui.padWebGetTopResolvedCandidates(results);
    expect(top.length).toBeGreaterThanOrEqual(2);
    expect(top.every(candidate => candidate.resolutionCompleteness === 'exact')).toBe(true);
    expect(new Set(top.map(candidate => candidate.resolutionScore)).size).toBe(1);
    expect(ui.padWebTopResolvedGroupIsEquivalent(top)).toBe(true);
    expect(ui.padWebFormatTopResolvedChordText(results)).toContain(' = ');
  });

  it('records that the motivating Eb6/Cm7 inversion is not an equal-score top group', () => {
    const results = detectChord([63, 67, 70, 72]);
    const top = ui.padWebGetTopResolvedCandidates(results);
    expect(top).toHaveLength(1);
    expect(top[0].quality).toBe('6');
    const minor7 = results.find(candidate => candidate.quality === 'm7' && candidate.resolutionCompleteness === 'exact');
    expect(minor7).toBeDefined();
    expect(minor7.isTopRanked).toBe(false);
    expect(minor7.resolutionScore).toBeLessThan(top[0].resolutionScore);
  });

  it('keeps a neutral separator for same-score top candidates that are not exact aliases', () => {
    const candidates = [
      {
        name: 'C', isTopRanked: true,
        resolutionCompleteness: 'partial', resolutionScore: 90,
        resolutionExplainedPCS: [0, 4, 7],
      },
      {
        name: 'Am', isTopRanked: true,
        resolutionCompleteness: 'partial', resolutionScore: 90,
        resolutionExplainedPCS: [9, 0, 4],
      },
    ];
    expect(ui.padWebTopResolvedGroupIsEquivalent(candidates)).toBe(false);
    expect(ui.padWebGetTopResolvedSeparator(candidates)).toBe(' · ');
    expect(ui.padWebFormatTopResolvedChordText(candidates)).toBe('C · Am');
  });

  it('leaves a single top candidate unchanged', () => {
    const candidates = [{
      name: 'C7 / E', isTopRanked: true,
      resolutionCompleteness: 'exact', resolutionScore: 120,
      resolutionExplainedPCS: [0, 4, 7, 10],
    }];
    expect(ui.padWebTopResolvedGroupIsEquivalent(candidates)).toBe(false);
    expect(ui.padWebFormatTopResolvedChordText(candidates)).toBe('C7 / E');
  });

  it('wires the same top-group metadata into Web DOM and Push snapshot', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const plain = readFileSync(root + 'plain.js', 'utf8');
    const midi = readFileSync(root + 'midi.js', 'utf8');
    expect(plain).toContain('padWebGetTopResolvedCandidates(candidates)');
    expect(plain).toContain('candidates.slice(0, topCount)');
    expect(midi).toContain('padWebFormatTopResolvedChordText(lastDetectedCandidates)');
  });

  it('keeps page and service-worker asset identities aligned', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const index = readFileSync(root + 'index.html', 'utf8');
    const sw = readFileSync(root + 'sw.js', 'utf8');
    for (const asset of [
      'pad-core/chord-resolver.js?v=1.8.1-resolution2',
      'chord-resolution-ui.js?v=1.8.1-resolution2',
      'plain.js?v=1.8.1-resolution2',
      'midi.js?v=1.8.1-resolution2',
    ]) {
      expect(index).toContain(asset);
      expect(sw).toContain(asset);
    }
  });
});
