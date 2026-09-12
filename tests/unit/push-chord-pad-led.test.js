import fs from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`\nfunction ${nextName}(`, start);
  if (start < 0 || end < 0) throw new Error(`missing ${name}`);
  return source.slice(start, end);
}

function runPadColor(state, app, row, col, extras = {}) {
  const source = fs.readFileSync('midi.js', 'utf8');
  const fn = extractFunction(source, '_padColorToLP', '_pushPaletteColors64');
  const context = {
    Set,
    window: {},
    _lpLEDMode: 'full',
    _isPush: true,
    midiActiveNotes: new Set(),
    baseMidi: () => 36,
    ROW_INTERVAL: 5,
    COLS: 8,
    AppState: app,
    SCALES: [{ pcs: [0,2,4,5,7,9,11] }],
    StockState: { enabled:false, currentIndex:-1, padPositions:[] },
    TastyState: { enabled:false, currentIndex:-1, padPositions:[] },
    VoicingState: { lastBoxes:[], selectedBoxIdx:null },
    isGuitarEngineActive: () => false,
    _instrumentPadSet: new Set(),
    ...extras,
  };
  vm.createContext(context);
  vm.runInContext(fn, context);
  return context._padColorToLP(state, row, col);
}

function chordState() {
  return {
    rootPC: 0,
    activePCS: new Set([0,4,7,11]),
    bassPC: null,
    omittedPCS: new Set(),
    guide3PCS: new Set([4]),
    guide7PCS: new Set([11]),
    tensionPCS: new Set(),
    avoidPCS: new Set(),
    overlayPCS: null,
    basicFormPadSet: new Set([0, 9, 18, 27]),
  };
}

const app = {
  mode:'chord', padCFixed:false, key:0, scaleIdx:0,
  pushScaleRootColor:3, pushScaleToneColor:122, pushPressedColor:25,
  showAllPositions:false,
};

describe('Push Chord pad LEDs', () => {
  it('negative control: render sends displayed padState, not the obsolete scale-only override', () => {
    const source = fs.readFileSync('render.js','utf8');
    expect(source).toContain('updateLaunchpadLEDs(padState)');
    expect(source).not.toMatch(/Launchpad\/PUSH LED update: always show current scale only/);
  });

  it('one-position chord mirrors exact displayed pads over the scale background', () => {
    const state = chordState();
    expect(runPadColor(state, app, 0, 0)).toBe(21); // selected chord position
    expect(runPadColor(state, app, 0, 2)).toBe(122); // D scale background
    expect(runPadColor(state, app, 0, 1)).toBe(0); // C# outside scale
  });

  it('C-fixed keeps C-major background without erasing the chord shape', () => {
    const state = chordState();
    const fixed = {...app, padCFixed:true, key:7, scaleIdx:0};
    expect(runPadColor(state, fixed, 0, 0)).toBe(21);
    expect(runPadColor(state, fixed, 0, 2)).toBe(122);
  });

  it('selected voicing positions outrank basic-form positions', () => {
    const state = chordState();
    const VoicingState = {
      lastBoxes:[{currentAlt:0, alternatives:[{positions:[{row:0,col:3},{row:1,col:3}]}]}],
      selectedBoxIdx:0,
    };
    expect(runPadColor(state, app, 0, 3, {VoicingState})).toBe(21);
    expect(runPadColor(state, app, 0, 0, {VoicingState})).toBe(3); // scale root background, not old basic shape
  });

  it('Tasty/Stock-style explicit positions get exact-position overlay priority', () => {
    const state = chordState();
    const StockState={enabled:true,currentIndex:0,padPositions:[{row:2,col:2}]};
    expect(runPadColor(state, app, 2, 2, {StockState})).toBe(21);
    expect(runPadColor(state, app, 0, 0, {StockState})).toBe(3);
  });

  it('all-position view colors chord tones and keeps scale background behind them', () => {
    const state=chordState();
    const overview={...app,showAllPositions:true};
    expect(runPadColor(state, overview, 0, 0)).toBe(3); // C chord root
    expect(runPadColor(state, overview, 0, 2)).toBe(122); // D scale only
    expect(runPadColor(state, overview, 0, 4)).toBe(26); // E guide 3rd
  });

  it('Scale mode remains ordinary scale-only behavior', () => {
    const state=chordState();
    const scaleApp={...app,mode:'scale'};
    expect(runPadColor(state, scaleApp, 0, 0)).toBe(3);
    expect(runPadColor(state, scaleApp, 0, 2)).toBe(122);
    expect(runPadColor(state, scaleApp, 0, 1)).toBe(0);
  });
});
