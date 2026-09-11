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
  globalThis.padWebPushControlState.inputPadLayout = false;
});

describe('Push Web logical control behavior', () => {
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
    globalThis.padWebPushControlState.inputPadLayout = true;
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

});
