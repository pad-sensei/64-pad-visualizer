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
  'getBuilderPCS', 'cycleTasty', 'cycleStock', 'selectRoot',
  'disableTasty', 'disableStock', 'toggleTasty', 'toggleStock', 'resetVoicingSelection',
  'updateKeyButtons', 'updateRootButtons', 'renderParentScales',
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

  it('routes A05 upper buttons through explicit mutually-exclusive Tasty/Stock toggles', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { root: 0, quality: { name: '7', pcs: [0, 4, 7, 10] } };
    globalThis.TastyState = { enabled: false, hpsUnlocked: true };
    globalThis.StockState = { enabled: false, hpsUnlocked: true };
    const calls = [];
    globalThis.toggleTasty = () => {
      calls.push('tasty');
      if (globalThis.TastyState.enabled) globalThis.TastyState.enabled = false;
      else {
        globalThis.StockState.enabled = false;
        globalThis.TastyState.enabled = true;
      }
    };
    globalThis.toggleStock = () => {
      calls.push('stock');
      if (globalThis.StockState.enabled) globalThis.StockState.enabled = false;
      else {
        globalThis.TastyState.enabled = false;
        globalThis.StockState.enabled = true;
      }
    };

    expect(handleLogical(21, 1)).toBe(true); // upper Tasty
    expect(calls).toEqual(['tasty']);
    expect(globalThis.TastyState.enabled).toBe(true);
    expect(globalThis.StockState.enabled).toBe(false);

    expect(handleLogical(21, 2)).toBe(true); // upper Stock
    expect(calls).toEqual(['tasty', 'stock']);
    expect(globalThis.TastyState.enabled).toBe(false);
    expect(globalThis.StockState.enabled).toBe(true);

    expect(handleLogical(21, 2)).toBe(true); // explicit Stock off
    expect(globalThis.StockState.enabled).toBe(false);
  });

  it('keeps A05 candidate cycling inert while Tasty/Stock are disabled', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { root: 0, quality: { name: '7', pcs: [0, 4, 7, 10] } };
    globalThis.TastyState = { enabled: false, hpsUnlocked: true };
    globalThis.StockState = { enabled: false, hpsUnlocked: true };
    const tasty = [];
    const stock = [];
    globalThis.cycleTasty = reverse => tasty.push(reverse);
    globalThis.cycleStock = reverse => stock.push(reverse);

    expect(handleLogical(51, 3)).toBe(true);  // dedicated Tasty encoder
    expect(handleLogical(52, -2)).toBe(true); // dedicated Stock encoder
    expect(handleLogical(30, 1)).toBe(true);  // Jog: no active voicing engine => inversion path
    expect(tasty).toEqual([]);
    expect(stock).toEqual([]);
    expect(globalThis.TastyState.enabled).toBe(false);
    expect(globalThis.StockState.enabled).toBe(false);
  });

  it('cycles only the active A05 engine with correct forward/reverse direction', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { root: 0, quality: { name: '7', pcs: [0, 4, 7, 10] } };
    globalThis.TastyState = { enabled: true, hpsUnlocked: true };
    globalThis.StockState = { enabled: false, hpsUnlocked: true };
    const tasty = [];
    const stock = [];
    globalThis.cycleTasty = reverse => tasty.push(reverse);
    globalThis.cycleStock = reverse => stock.push(reverse);

    expect(handleLogical(51, 2)).toBe(true);
    expect(handleLogical(51, -3)).toBe(true);
    expect(handleLogical(30, 1)).toBe(true); // Jog follows active Tasty
    expect(tasty).toEqual([false, true, false]);
    expect(stock).toEqual([]);

    globalThis.TastyState.enabled = false;
    globalThis.StockState.enabled = true;
    expect(handleLogical(52, 2)).toBe(true);
    expect(handleLogical(52, -4)).toBe(true);
    expect(handleLogical(30, -1)).toBe(true); // Jog follows active Stock
    expect(stock).toEqual([false, true, true]);
  });

  it('nudges a completed chord by semitone without resetting its chord state', () => {
    const quality = { name: 'm7', pcs: [0, 3, 7, 10] };
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = {
      root: 11, quality, tension: '9', bass: 4,
      _fromDiatonic: true, _diatonicScaleIdx: 0,
      _fromSecDom: true, _secDomTargetIsMajor: true,
    };
    let selectRootCalls = 0;
    let resetCalls = 0;
    globalThis.selectRoot = (root) => {
      selectRootCalls += 1;
      globalThis.BuilderState.root = root;
      globalThis.BuilderState.quality = null;
      globalThis.BuilderState.tension = null;
      globalThis.BuilderState.bass = null;
    };
    globalThis.resetVoicingSelection = () => { resetCalls += 1; };

    expect(handleLogical(35, 1)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(0);
    expect(globalThis.BuilderState.bass).toBe(5);
    expect(globalThis.BuilderState.quality).toBe(quality);
    expect(globalThis.BuilderState.tension).toBe('9');
    expect(globalThis.BuilderState._fromDiatonic).toBe(false);
    expect(globalThis.BuilderState._diatonicScaleIdx).toBeUndefined();
    expect(globalThis.BuilderState._fromSecDom).toBe(false);
    expect(globalThis.BuilderState._secDomTargetIsMajor).toBeUndefined();
    expect(selectRootCalls).toBe(0);
    expect(resetCalls).toBe(1);
  });

  it('matches Standalone by leaving active voicing engines before chord semitone nudge', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { root: 0, quality: { name: '7', pcs: [0, 4, 7, 10] }, tension: null, bass: null };
    globalThis.TastyState = { enabled: true };
    globalThis.StockState = { enabled: true };
    globalThis.disableTasty = () => { globalThis.TastyState.enabled = false; };
    globalThis.disableStock = () => { globalThis.StockState.enabled = false; };

    expect(handleLogical(35, -1)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(11);
    expect(globalThis.TastyState.enabled).toBe(false);
    expect(globalThis.StockState.enabled).toBe(false);
  });

  it('preserves signed relative magnitude for D-pad completed-chord semitone moves', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { root: 10, quality: { name: 'maj7', pcs: [0, 4, 7, 11] }, tension: '9', bass: 2 };

    expect(handleLogical(35, 3)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(1);
    expect(globalThis.BuilderState.bass).toBe(5);

    expect(handleLogical(35, -4)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(9);
    expect(globalThis.BuilderState.bass).toBe(1);
  });

  it('preserves signed relative magnitude on the chord-root encoder path', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { root: 1, quality: { name: 'm7', pcs: [0, 3, 7, 10] }, tension: null, bass: 8 };

    expect(handleLogical(56, 5)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(6);
    expect(globalThis.BuilderState.bass).toBe(1);
  });

});
