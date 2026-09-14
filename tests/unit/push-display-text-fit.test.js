import { describe, it, expect } from 'vitest';
import { fitPushPixelText, pushPixelTextUnits } from '../../push-display-text-fit.js';

describe('Push chord headline fit', () => {
  it('keeps a normal Eb6 = Cm7 / Eb equation at full scale', () => {
    const text = 'Eb6 = Cm7 / Eb';
    const layout = fitPushPixelText(text, 4, 688);
    expect(layout.text).toBe(text);
    expect(layout.scale).toBe(4);
    expect(layout.width).toBe(pushPixelTextUnits(text) * 4);
    expect(layout.width).toBeLessThanOrEqual(688);
  });

  it('keeps every character of a long equation while shrinking to fit', () => {
    const text = 'Eb7(b9) = Edim7(7) / G · Bb13sus4 / Ab = Gm7(b5) / Bb · F13sus4 / Eb';
    const layout = fitPushPixelText(text, 4, 688);
    expect(layout.text).toBe(text);
    expect(layout.scale).toBeLessThan(4);
    expect(layout.scale).toBeGreaterThan(0);
    expect(layout.width).toBeLessThanOrEqual(688);
  });

  it('never truncates even when text exceeds scale-1 capacity', () => {
    const text = Array(40).fill('C13sus4').join(' = ');
    const layout = fitPushPixelText(text, 4, 688);
    expect(layout.text).toBe(text);
    expect(layout.scale).toBeLessThan(1);
    expect(layout.width).toBeLessThanOrEqual(688);
  });
});
