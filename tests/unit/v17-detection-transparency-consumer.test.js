import { describe, it, expect } from 'vitest';

describe('v1.7 transparent chord detection consumer contract', () => {
  function observedPCS(notes) {
    return Array.from(new Set(notes.map(note => ((note % 12) + 12) % 12))).sort((a, b) => a - b);
  }

  it('preserves exact observations while retaining unusual competing readings', () => {
    const notes = [59, 67, 69, 74]; // B G A D
    const results = padDetectChord(notes);
    expect(results[0].name).toBe('Gadd9 / B');
    expect(results.some(candidate => candidate.name.startsWith('Bm7(b13)'))).toBe(true);

    const exact = observedPCS(notes);
    for (const candidate of results) {
      expect(candidate.observedPCS).toEqual(exact);
      expect(candidate.observedPitchClasses).toEqual(exact);
    }
  });

  it('keeps split-third #9 and non-functional pedal candidates visible', () => {
    const split = padDetectChord([60, 63, 64, 69, 71]); // C Eb E A B
    expect(split.some(candidate => candidate.rootPC === 0 && candidate.name.includes('#9'))).toBe(true);

    const pedal = padDetectChord([60, 62, 66, 69]); // C D F# A
    expect(pedal.some(candidate => candidate.name === 'D / C')).toBe(true);
  });

  it('retains dominant-over-shell readings through the eight-candidate cap', () => {
    const results = padDetectChord([48, 52, 55, 58, 59, 62, 65]); // C E G Bb B D F
    expect(results.length).toBeLessThanOrEqual(8);
    expect(results.some(candidate =>
      candidate.rootPC === 7 && candidate.quality === '7' &&
      candidate.name.startsWith('G7') && candidate.name.includes(' / C')
    )).toBe(true);
  });
});
