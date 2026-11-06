import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Execute the production file, not a copied rendering/palette implementation.
const renderSource = fs.readFileSync(path.join(root, 'render.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(root, 'launchpad-programmer.js'), 'utf8');
function element(tag) {
  const attrs = new Map();
  return { tag, children: [], setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k) ?? null; }, addEventListener() {},
    appendChild(child) { this.children.push(child); } };
}
function fixture(mode = 'chord') {
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: false }) },
    document: { createElementNS: (_, tag) => element(tag) },
    ROWS: 8, COLS: 8, PAD_SIZE: 50, PAD_GAP: 4, MARGIN: 8, ROW_INTERVAL: 5,
    AppState: { mode, key: 2, colorOff: true },
    PlainState: { activeNotes: new Set() },
    VoicingState: { selectedBoxIdx: null, lastBoxes: [] },
    memoryViewMode: null, _instrumentPadSet: null, _instrumentMidiSet: null,
    midiNote: (r, c) => 60 + r * 5 + c, baseMidi: () => 60,
    pitchClass: n => n % 12, pcName: n => String(n), noteName: n => String(n),
    SCALE_DEGREE_NAMES: Array.from({ length: 12 }, (_, i) => String(i)),
    chordDegreeName: n => String(n), displayDegreeLabel: n => String(n),
    formatVoicingNoteName: n => String(n),
  });
  vm.runInContext(adapterSource, context, { filename: 'launchpad-programmer.js' });
  context.padLaunchpadProgrammer = context.window.padLaunchpadProgrammer;
  vm.runInContext(renderSource, context, { filename: 'render.js' });
  const state = {
    activePCS: new Set([2, 6, 9]), activeIvPCS: new Set([0, 4, 7]), rootPC: 2,
    bassPC: null, charPCS: new Set(), omittedPCS: new Set(), guide3PCS: new Set(),
    guide7PCS: new Set(), tensionPCS: new Set(), qualityPCS: new Set([0, 4, 7]),
    avoidPCS: new Set(), overlayPCS: null, overlayCharPCS: new Set(),
    tastyMidiSet: null, tastyDegreeMap: null, tastyTopMidi: null, tastyPadPositions: null,
  };
  return { context, state, render() {
    const svg = element('svg');
    context.renderPads(svg, state);
    const pads = svg.children.filter(e => e.tag === 'rect' && e.getAttribute('class') === 'pad');
    expect(pads).toHaveLength(64);
    expect(state.launchpadPadColors).toHaveLength(64);
    // Every final off/hidden screen pad must also be dark on hardware.
    pads.forEach((pad, index) => {
      if (['var(--pad-off)', 'var(--pad-omitted)', 'var(--bg)'].includes(pad.getAttribute('fill')) || pad.getAttribute('opacity') === '0')
        expect(state.launchpadPadColors[index]).toBe(0);
    });
    return { pads, colors: state.launchpadPadColors };
  } };
}
const dMajor = () => new Set([2, 4, 6, 7, 9, 11, 1]);

describe('actual renderPads → Launchpad screen-position projection', () => {
  it('scale preserves tonic/background/C and excludes off-scale pads', () => {
    const f = fixture('scale'); f.state.activePCS = new Set([0, ...dMajor()]);
    const { pads, colors } = f.render();
    expect(pads[2].getAttribute('fill')).toBe('var(--pad-root)'); expect(colors[2]).toBe(9);
    expect(pads[4].getAttribute('fill')).toBe('var(--pad-scale)'); expect(colors[4]).toBe(2);
    expect(colors[0]).toBe(45); expect(colors[3]).toBe(0);
  });
  it('scale double-stop shape overrides the ordinary scale background', () => {
    const f = fixture('scale'); f.state.activePCS = dMajor(); f.state.doubleStopPadSet = new Set([2, 6]);
    const { pads, colors } = f.render();
    expect(pads[2].getAttribute('fill')).toBe('var(--pad-basic-chord)'); expect(colors[2]).toBe(13);
    expect(colors[6]).toBe(13); expect(colors[4]).toBe(2);
  });
  it('basic shape distinguishes duplicate pitch positions from background tonic', () => {
    const f = fixture(); f.state.basicFormPadSet = new Set([2, 6, 12]);
    f.state.scaleBgPCS = dMajor(); f.state.scaleBgRootPC = 2;
    const { pads, colors } = f.render();
    // MIDI66 appears at (0,6) and (1,1), but only the former belongs to the shape.
    expect(pads[6].getAttribute('fill')).toBe('var(--pad-basic-chord)'); expect(colors[6]).toBe(13);
    expect(pads[9].getAttribute('fill')).toBe('var(--pad-basic-scale)'); expect(colors[9]).toBe(2);
    // Unselected tonic D remains a background reference, even though D is a chord tone.
    expect(pads[20].getAttribute('fill')).toBe('var(--pad-root)'); expect(colors[20]).toBe(9);
  });
  it('selected voicing suppresses hidden same-pitch duplicates', () => {
    const f = fixture(); f.context.VoicingState.selectedBoxIdx = 0;
    f.context.VoicingState.lastBoxes = [{ midiNotes: [62, 66, 69], currentAlt: 0,
      alternatives: [{ positions: [{ row: 0, col: 2 }, { row: 0, col: 6 }, { row: 1, col: 4 }] }] }];
    const { pads, colors } = f.render();
    expect(colors[6]).toBe(13); expect(pads[9].getAttribute('opacity')).toBe('0'); expect(colors[9]).toBe(0);
  });
  it.each([true, false])('Tasty/Stock shared compact contract ignores stale boxes (scale background: %s)', background => {
    const f = fixture(); f.context.VoicingState.selectedBoxIdx = 0;
    f.context.VoicingState.lastBoxes = [{ midiNotes: [62], currentAlt: 0, alternatives: [{ positions: [{ row: 0, col: 2 }] }] }];
    // Both engines feed this shared production rendering contract.
    f.state.tastyMidiSet = new Set([62, 66, 69]);
    f.state.tastyPadPositions = [{ row: 0, col: 2 }, { row: 0, col: 6 }, { row: 1, col: 4 }];
    if (background) {
      f.state.basicFormPadSet = new Set([2, 6, 12]); f.state.engineScaleBg = true;
      f.state.scaleBgPCS = dMajor(); f.state.scaleBgRootPC = 2;
    }
    const { pads, colors } = f.render();
    expect(pads[6].getAttribute('opacity')).not.toBe('0'); expect(colors[6]).toBe(13);
    expect(pads[9].getAttribute('fill')).toBe(background ? 'var(--pad-basic-scale)' : 'var(--pad-off)');
    expect(colors[9]).toBe(background ? 2 : 0);
    expect(colors[20]).toBe(background ? 9 : 0);
  });
});


describe('custom Launchpad colours keep the resolved handshape positions', () => {
  it('changes role colours without lighting same-pitch duplicates or changing the screen shape', () => {
    const f = fixture(); f.state.activePCS.add(0); f.state.basicFormPadSet = new Set([0, 2, 6, 12]); f.state.scaleBgPCS = new Set([0, ...dMajor()]); f.state.scaleBgRootPC = 2;
    const before = f.render();
    f.context.AppState.launchpadColors = { scale: 'p:7', c: 'p:45', guide: '#00aaff', guideC: 'p:0', pressed: 'p:21' };
    const after = f.render();
    expect(after.colors[0]).toBe(0); // guide C can intentionally be dark
    expect(after.colors[6]).toBe('#00aaff'); // physical shape pad
    expect(after.colors[9]).toBe(7); // same MIDI pitch, different physical background pad
    expect(after.colors[20]).toBe(9); // unselected tonic keeps the background role
    expect(after.pads.map(p=>p.getAttribute('fill'))).toEqual(before.pads.map(p=>p.getAttribute('fill')));
    expect(after.pads.map(p=>p.getAttribute('opacity'))).toEqual(before.pads.map(p=>p.getAttribute('opacity')));
  });
});

// Execute the background assembly from render() verbatim, then the real renderPads().
// This covers the auto/manual Available Scale boundary without MIDI or audio access.
function chordBackground({ fixed = false, all = false, manual = false, key = 0, rootPC = 2, selected = true } = {}) {
  const f = fixture();
  Object.assign(f.context.AppState, { key, scaleIdx: 0, padCFixed: fixed,
    showAllPositions: all, showParentScales: selected });
  f.state.rootPC = rootPC;
  f.state.activePCS = new Set([0, 3, 7, 10].map(iv => (rootPC + iv) % 12));
  f.state.activeIvPCS = new Set([0, 3, 7, 10]);
  f.state.overlayPCS = new Set([0, 2, 3, 5, 7, 9, 10].map(iv => (rootPC + iv) % 12));
  const positions = [];
  for (let i = 0; i < 64 && positions.length < 4; i++) {
    if (f.state.activePCS.has((60 + Math.floor(i / 8) * 5 + i % 8) % 12))
      positions.push({ row: Math.floor(i / 8), col: i % 8 });
  }
  Object.assign(f.context, {
    padState: f.state, BuilderState: { root: rootPC },
    SCALES: [{ pcs: [0, 2, 4, 5, 7, 9, 11] }],
    TastyState: { enabled: false }, StockState: { enabled: false },
    _voicingReflectMode: false, _stockReflectMode: false,
    _selectedPS: selected ? { parentKey: key, scaleIdx: 1 } : null,
    _psAutoSelect: !manual,
    chordBasicFormActive: () => !all,
    getCurrentChordMidiNotes: () => positions.map(p => 60 + p.row * 5 + p.col),
    basicFormArrangements: () => [{ positions }],
  });
  const start = renderSource.indexOf('  // Basic-form default:');
  const end = renderSource.indexOf("  if (AppState.mode === 'scale' && typeof doubleStopActive", start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  vm.runInContext(renderSource.slice(start, end), f.context);
  return f;
}

describe('Chord scale background context (RC1 Dm7 regression)', () => {
  it.each([false, true])('auto Dorian does not move the C Major tonic (all positions %s)', all => {
    const f = chordBackground({ all });
    expect(f.state.scaleBgRootPC).toBe(0);
    expect([...f.state.scaleBgPCS].sort()).toEqual([0, 2, 4, 5, 7, 9, 11].sort());
    const { pads } = f.render();
    pads.forEach((p, i) => {
      const pc = (60 + Math.floor(i / 8) * 5 + i % 8) % 12;
      if (pc === 2) expect(p.getAttribute('fill')).not.toBe('var(--pad-root)');
      if (pc === 0 && (all || f.state.basicFormPadSet.has(i)))
        expect(p.getAttribute('fill')).toBe('var(--pad-basic-chord)');
    });
  });
  it.each([1, 2, 3])('half-step chord root %i leaves the selected key background in place', rootPC => {
    const f = chordBackground({ rootPC, key: 7 });
    expect(f.state.scaleBgRootPC).toBe(7);
    expect(f.state.scaleBgPCS.has(6)).toBe(true); // G Major F#
    f.render();
  });
  it('explicit Available Scale selection retains its chord-rooted surface', () => {
    const f = chordBackground({ manual: true });
    expect(f.state.scaleBgRootPC).toBe(2);
    expect([...f.state.scaleBgPCS]).toEqual([...f.state.overlayPCS]);
    f.render();
  });
  it.each([false, true])('C Fixed keeps C Major even for explicit selection and G key (all %s)', all => {
    const f = chordBackground({ fixed: true, manual: true, key: 7, all });
    expect(f.state.scaleBgRootPC).toBe(0);
    expect([...f.state.scaleBgPCS].sort()).toEqual([0, 2, 4, 5, 7, 9, 11].sort());
    f.render();
  });
  it('C Fixed all positions respects C Major when Available Scale is closed', () => {
    const f = chordBackground({ fixed: true, key: 7, all: true, selected: false });
    expect(f.state.scaleBgRootPC).toBe(0);
    expect(f.state.scaleBgPCS.has(6)).toBe(false);
    f.render();
  });
  it('keeps C in the chord role without changing the selected one shape', () => {
    const f = chordBackground({ selected: false });
    const { pads, colors } = f.render();
    let selectedC = 0, backgroundC = 0;
    pads.forEach((p, i) => {
      if ((60 + Math.floor(i / 8) * 5 + i % 8) % 12 !== 0) return;
      const shown = f.state.basicFormPadSet.has(i);
      expect(p.getAttribute('fill')).toBe(shown ? 'var(--pad-basic-chord)' : 'var(--pad-root)');
      expect(colors[i]).toBe(shown ? 13 : 45); // membership, not pitch class
      if (shown) selectedC++; else backgroundC++;
    });
    expect(selectedC).toBeGreaterThan(0); expect(backgroundC).toBeGreaterThan(0);
  });
});

it('engine background flag does not turn unselected tonic copies into a second shape', () => {
  const f=fixture(); f.context.AppState.key=0;
  f.state.activePCS=new Set([0,2,5,9]); f.state.rootPC=2;
  f.state.tastyMidiSet=new Set([62,65,69,72]);
  f.state.tastyPadPositions=[{row:0,col:2},{row:0,col:5},{row:1,col:4},{row:2,col:2}];
  f.state.allPosScaleBg=true; f.state.engineScaleBg=true;
  f.state.scaleBgPCS=new Set([0,2,4,5,7,9,11]); f.state.scaleBgRootPC=0;
  const {pads,colors}=f.render();
  expect(pads[18].getAttribute('fill')).toBe('var(--pad-basic-chord)'); expect(colors[18]).toBe(13);
  expect(pads[0].getAttribute('fill')).toBe('var(--pad-root)'); expect(colors[0]).toBe(45);
});
it('explicit Available Scale keeps outside tonic at background while its selected copy is chord-coloured', () => {
  const f=chordBackground({manual:true});const {pads,colors}=f.render();
  let inside=0,outside=0;
  for(let i=0;i<64;i++) if((60+Math.floor(i/8)*5+i%8)%12===2) {
    const chosen=f.state.basicFormPadSet.has(i);chosen?inside++:outside++;
    expect(pads[i].getAttribute('fill')).toBe(chosen?'var(--pad-basic-chord)':'var(--pad-root)');
    expect(colors[i]).toBe(chosen?13:9);
  }
  expect(inside).toBeGreaterThan(0);expect(outside).toBeGreaterThan(0);
});
