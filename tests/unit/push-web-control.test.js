import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { handleLogical, syncButtonLeds, resetButtonLedState } = require('../../push-web-control.js');

const touched = [
  'AppState', 'memoryViewMode', 'PerformState', 'PlainState',
  'performOctaveEdit', 'shiftOctave', 'updatePlainDisplay', 'render',
  'updateMemorySlotUI', 'updateBankUI', 'saveAppSettings', 'refreshLaunchpadLEDs',
  'padWebSendPushButtonLed', 'TastyState', 'StockState', 'SCALES', 'BankState',
  'memoryViewMode', 'localStorage', 'BuilderState', '__pushLedColorPickRole',
  'VoicingState', 'togglePerformMode', 'setInversion', 'builderBack',
  'undoMemory', 'redoMemory', 'chordBasicFormActive', 'isGuitarEngineActive',
  'getBuilderPCS', 'cycleTasty', 'cycleStock',
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

  it('mirrors active/inactive Push button state with Desktop LED semantics', () => {
    const calls = [];
    globalThis.AppState = { mode: 'scale', scaleIdx: 0, padCFixed: false };
    globalThis.SCALES = [{ name: 'Major' }];
    globalThis.TastyState = { enabled: true };
    globalThis.StockState = { enabled: false };
    globalThis.localStorage = { getItem: () => '{}' };
    globalThis.padWebSendPushButtonLed = (cc, state, palette) => calls.push([cc, state, palette]);

    resetButtonLedState();
    syncButtonLeds();

    expect(calls).toContainEqual([103, 'weak', true]);       // active upper TASTY
    expect(calls).toContainEqual([104, 'white-weak', true]); // assigned STOCK, inactive
    expect(calls).toContainEqual([58, 'strong', false]);     // Scale mode button active
    expect(calls).toContainEqual([86, 'weak', true]);        // Record assigned, not Input
  });

  it('uses both display rows for root-entry LED choices', () => {
    const calls = [];
    globalThis.AppState = { mode: 'chord', scaleIdx: 0, padCFixed: false };
    globalThis.SCALES = [{ name: 'Major' }];
    globalThis.localStorage = { getItem: () => '{}' };
    globalThis.BUILDER_QUALITIES = [];
    globalThis.padWebSendPushButtonLed = (cc, state, palette) => calls.push([cc, state, palette]);

    globalThis.padWebPushControlState.entryStep = 'root';
    globalThis.padWebPushControlState.entryRoot = 10;
    resetButtonLedState();
    syncButtonLeds();

    expect(calls).toContainEqual([20, 'white-weak', true]); // root index 8 assigned on lower row
    expect(calls).toContainEqual([21, 'white-weak', true]); // root index 9 assigned on lower row
    expect(calls).toContainEqual([22, 'weak', true]);       // selected root index 10
    expect(calls).toContainEqual([23, 'white-weak', true]); // root index 11 assigned
    expect(calls).toContainEqual([24, 'off', true]);        // no root index 12

    globalThis.padWebPushControlState.entryStep = null;
    globalThis.padWebPushControlState.entryRoot = null;
  });

  it('lights Input/Perform navigation and C-fixed state from screen truth', () => {
    const calls = [];
    globalThis.AppState = { mode: 'input', scaleIdx: 0, padCFixed: true };
    globalThis.SCALES = [{ name: 'Major' }];
    globalThis.memoryViewMode = 'perform';
    globalThis.BankState = { banks: [{}, {}] };
    globalThis.localStorage = { getItem: () => '{}' };
    globalThis.padWebSendPushButtonLed = (cc, state, palette) => calls.push([cc, state, palette]);

    resetButtonLedState();
    syncButtonLeds();

    expect(calls).toContainEqual([31, 'strong', false]); // Layout/Input
    expect(calls).toContainEqual([62, 'weak', true]);    // Page left available
    expect(calls).toContainEqual([63, 'weak', true]);    // Page right available
    expect(calls).toContainEqual([83, 'red-soft', false]);
    expect(calls).toContainEqual([86, 'strong', true]);  // Record/Input
  });

  it('keeps Layout on the Desktop Input Memory/Perform vocabulary', () => {
    const calls = [];
    globalThis.AppState = { mode: 'input' };
    globalThis.memoryViewMode = 'memory';
    globalThis.togglePerformMode = () => calls.push('toggle-perform');

    expect(handleLogical(47, 0)).toBe(true);
    expect(calls).toEqual(['toggle-perform']);
  });

  it('routes the explicit inversion control to the existing chord inversion state', () => {
    const calls = [];
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { quality: { pcs: [0, 4, 7] } };
    globalThis.VoicingState = { shell: false, inversion: 0, lastBoxes: [] };
    globalThis.setInversion = value => calls.push(value);

    expect(handleLogical(43, 1)).toBe(true);
    expect(calls).toEqual([1]);
  });

  it('lets Jog fall through to inversion when no higher-priority voicing mode is active', () => {
    const calls = [];
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { quality: { pcs: [0, 4, 7] } };
    globalThis.VoicingState = { shell: false, inversion: 0, lastBoxes: [] };
    globalThis.TastyState = { enabled: false };
    globalThis.StockState = { enabled: false };
    globalThis.setInversion = value => calls.push(value);

    expect(handleLogical(30, 1)).toBe(true);
    expect(calls).toEqual([1]);
  });

  it('keeps Undo as Back in Chord and Undo/Redo in Input', () => {
    const calls = [];
    globalThis.AppState = { mode: 'chord' };
    globalThis.builderBack = () => calls.push('builder-back');

    expect(handleLogical(41, 0)).toBe(true);
    expect(calls).toEqual(['builder-back']);

    globalThis.AppState = { mode: 'input' };
    globalThis.undoMemory = () => calls.push('undo-memory');
    globalThis.redoMemory = () => calls.push('redo-memory');

    expect(handleLogical(41, 0)).toBe(true);
    expect(handleLogical(41, 1)).toBe(true);
    expect(calls).toEqual(['builder-back', 'undo-memory', 'redo-memory']);
  });
});
