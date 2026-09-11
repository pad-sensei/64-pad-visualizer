import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createState, relativeDelta, mapPushCc } = require('../../push-midi-cc-map.js');

function codes(cc, value = 127, context = {}, state = createState()) {
  return mapPushCc(cc, value, context, state).events.map(e => [e.code, e.value]);
}

describe('Push MIDI CC Desktop parity', () => {
  it('uses the native relative encoder convention', () => {
    expect(relativeDelta(0)).toBe(0);
    expect(relativeDelta(1)).toBe(1);
    expect(relativeDelta(63)).toBe(63);
    expect(relativeDelta(65)).toBe(-63);
    expect(relativeDelta(127)).toBe(-1);
  });

  it('maps native push buttons exactly', () => {
    expect(codes(55)).toEqual([[46, 1]]);
    expect(codes(54)).toEqual([[46, -1]]);
    expect(codes(58)).toEqual([[1, 0]]);
    expect(codes(31)).toEqual([[47, 0]]);
    expect(codes(32)).toEqual([[75, 0]]);
    expect(codes(85)).toEqual([[42, 0]]);
    expect(codes(86)).toEqual([[3, 0]]);
    expect(codes(82)).toEqual([[48, 0]]);
    expect(codes(65)).toEqual([[44, 0]]);
    expect(codes(81)).toEqual([[45, 0]]);
    expect(codes(80)).toEqual([[71, 0]]);
    expect(codes(83)).toEqual([[72, 0]]);
    expect(codes(110)).toEqual([[73, 0]]);
    expect(codes(46)).toEqual([[43, 1]]);
    expect(codes(47)).toEqual([[43, -1]]);
    expect(codes(44)).toEqual([[35, -1]]);
    expect(codes(45)).toEqual([[35, 1]]);
    expect(codes(62)).toEqual([[36, -1]]);
    expect(codes(63)).toEqual([[36, 1]]);
    expect(codes(93)).toEqual([[33, 1]]);
    expect(codes(95)).toEqual([[33, -1]]);
    expect(codes(102)).toEqual([[21, 0]]);
    expect(codes(109)).toEqual([[21, 7]]);
    expect(codes(20)).toEqual([[20, 0]]);
    expect(codes(27)).toEqual([[20, 7]]);
  });

  it('preserves press/release state controls', () => {
    expect(codes(118, 127)).toEqual([[40, 1]]);
    expect(codes(118, 0)).toEqual([[40, 0]]);
    expect(codes(88, 127)).toEqual([[49, 1]]);
    expect(codes(88, 0)).toEqual([[49, 0]]);
  });

  it('tracks Shift for Undo/Redo exactly like native', () => {
    const state = createState();
    expect(mapPushCc(49, 127, {}, state).events).toEqual([]);
    expect(codes(119, 127, {}, state)).toEqual([[41, 1]]);
    mapPushCc(49, 0, {}, state);
    expect(codes(119, 127, {}, state)).toEqual([[41, 0]]);
  });

  it('fires Setup once per held press and Swap on release', () => {
    const state = createState();
    expect(codes(30, 127, {}, state)).toEqual([[70, 0]]);
    expect(codes(30, 127, {}, state)).toEqual([]);
    expect(codes(30, 0, {}, state)).toEqual([]);
    expect(codes(30, 127, {}, state)).toEqual([[70, 0]]);
    expect(codes(33, 127)).toEqual([]);
    expect(codes(33, 0)).toEqual([[74, 0]]);
  });

  it('maps jog and encoders, except MPE Slide collision', () => {
    expect(codes(70, 1)).toEqual([[30, 1]]);
    expect(codes(70, 127)).toEqual([[30, -1]]);
    expect(codes(71, 1)).toEqual([[50, 1]]);
    expect(codes(78, 127)).toEqual([[57, -1]]);
    expect(codes(74, 1, { mpeMode: true })).toEqual([]);
    expect(mapPushCc(74, 1, { mpeMode: true }, createState()).performancePass).toBe(true);
  });

  it('keeps CC64, CC1 and expression CC74 out of UI control ownership', () => {
    expect(mapPushCc(64, 127, {}, createState()).handled).toBe(false);
    expect(mapPushCc(1, 64, {}, createState()).performancePass).toBe(true);
    expect(mapPushCc(74, 64, { mpeMode: true }, createState()).performancePass).toBe(true);
  });

  it('uses Live Port as control authority while preserving octave on User Port', () => {
    expect(codes(58, 127, { inputName: 'Ableton Push 3 User Port' })).toEqual([]);
    expect(codes(55, 127, { inputName: 'User Port', nowMs: 1000 })).toEqual([[46, 1]]);
    expect(codes(58, 127, { inputName: 'Ableton Push 3 Live Port' })).toEqual([[1, 0]]);
    expect(codes(58, 127, { inputName: 'Ableton Push 2 Live Port' })).toEqual([[1, 0]]);
  });

  it('suppresses encoder-range expression while a pad is held', () => {
    expect(codes(71, 1, { padIsHeld: true })).toEqual([]);
    expect(codes(78, 1, { padIsHeld: true })).toEqual([]);
  });

  it('debounces mirrored octave presses with the native 180ms window', () => {
    const state = createState();
    expect(codes(55, 127, { nowMs: 1000 }, state)).toEqual([[46, 1]]);
    expect(codes(55, 127, { nowMs: 1100 }, state)).toEqual([]);
    expect(codes(55, 127, { nowMs: 1181 }, state)).toEqual([[46, 1]]);
  });
});
