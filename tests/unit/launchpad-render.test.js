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
    // D at row2,col4 is a scale tonic, not another copy of the chord handshape.
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
    expect(after.colors[20]).toBe(9); // selected scale tonic remains a separate Explorer role
    expect(after.pads.map(p=>p.getAttribute('fill'))).toEqual(before.pads.map(p=>p.getAttribute('fill')));
    expect(after.pads.map(p=>p.getAttribute('opacity'))).toEqual(before.pads.map(p=>p.getAttribute('opacity')));
  });
});
