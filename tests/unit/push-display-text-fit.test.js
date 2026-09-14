import { describe, it, expect } from 'vitest';
import { fitPushPixelText, pushPixelTextUnits } from '../../push-display-text-fit.js';

describe('Push chord headline fit', () => {
  it('keeps a normal Eb6 = Cm7 / Eb equation at full scale', () => {
    const text = 'Eb6 = Cm7 / Eb';
    const layout = fitPushPixelText(text, 4, 688);
    expect(layout.text).toBe(text);
    expect(layout.lines).toEqual([text]);
    expect(layout.scale).toBe(4);
    expect(layout.width).toBe(pushPixelTextUnits(text) * 4);
    expect(layout.width).toBeLessThanOrEqual(688);
  });

  it('keeps every character of a long real equation while shrinking to an integer scale', () => {
    const text = 'Eb7(b9) = Edim7(7) / D# = Dbdim7(9) / D# = Bbdim7(11) / D#';
    const layout = fitPushPixelText(text, 4, 688);
    expect(layout.text).toBe(text);
    expect(layout.lines).toEqual([text]);
    expect(layout.scale).toBe(2);
    expect(Number.isInteger(layout.scale)).toBe(true);
    expect(layout.width).toBeLessThanOrEqual(688);
  });

  it('wraps at readable scale 1 instead of producing sub-pixel glyphs', () => {
    const text = Array(40).fill('C13sus4').join(' = ');
    const layout = fitPushPixelText(text, 4, 688);
    expect(layout.text).toBe(text);
    expect(layout.scale).toBe(1);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.join('')).toBe(text);
    for (const line of layout.lines) {
      expect(pushPixelTextUnits(line)).toBeLessThanOrEqual(688);
    }
    expect(layout.width).toBeLessThanOrEqual(688);
  });
});
