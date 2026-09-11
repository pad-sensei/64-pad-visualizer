import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { handleLogical } = require('../../push-web-control.js');

const touched = [
  'AppState', 'memoryViewMode', 'PerformState', 'PlainState',
  'performOctaveEdit', 'shiftOctave', 'updatePlainDisplay', 'render',
  'updateMemorySlotUI', 'updateBankUI', 'saveAppSettings', 'refreshLaunchpadLEDs',
];

afterEach(() => {
  for (const key of touched) delete globalThis[key];
});

describe('Push Web logical control behavior', () => {
  it('uses Perform slot octave edit for code 46 when a Perform pad/chord is active', () => {
    const calls = [];
    globalThis.AppState = { mode: 'input' };
    globalThis.memoryViewMode = 'perform';
    globalThis.PerformState = { activePad: 3 };
    globalThis.PlainState = { activeNotes: new Set([60, 64, 67]) };
    globalThis.performOctaveEdit = value => calls.push(['perform', value]);
    globalThis.shiftOctave = value => calls.push(['global', value]);

    expect(handleLogical(46, 1)).toBe(true);
    expect(calls).toEqual([['perform', 1]]);
  });

  it('falls back to global octave shift when Perform WYSIWYG preconditions are absent', () => {
    const calls = [];
    globalThis.AppState = { mode: 'input' };
    globalThis.memoryViewMode = 'perform';
    globalThis.PerformState = { activePad: null };
    globalThis.PlainState = { activeNotes: new Set() };
    globalThis.performOctaveEdit = value => calls.push(['perform', value]);
    globalThis.shiftOctave = value => calls.push(['global', value]);

    expect(handleLogical(46, -1)).toBe(true);
    expect(calls).toEqual([['global', -1]]);
  });
});
