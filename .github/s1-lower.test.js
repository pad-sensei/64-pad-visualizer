import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

// Boundaries stubbed here: DOM painting and audio scheduling. Theory, CC mapping,
// builder selection, mode state, settings and MIDI display snapshot are real scripts.
const root = process.cwd();
function browser() {
  const storage = new Map(), elements = new Map(), leds = new Map(), played = [];
  function element() {
    const classes = new Set();
    return { style: {}, dataset: {}, value: '', textContent: '', children: [],
      classList: { contains: c => classes.has(c), add: (...cs) => cs.forEach(c => classes.add(c)),
        remove: (...cs) => cs.forEach(c => classes.delete(c)),
        toggle(c, on) { on = on === undefined ? !classes.has(c) : on; on ? classes.add(c) : classes.delete(c); return on; } },
      appendChild(e) { this.children.push(e); }, addEventListener() {}, removeEventListener() {},
      querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, getAttribute: () => null };
  }
  const c = { console, Set, Map, Array, Math, Date, JSON, Promise,
    location: { pathname: '/apps/64-pad-dev/', search: '' },
    document: { readyState: 'loading', body: element(),
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, createElement: element },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: f => f(), addEventListener() {}, IS_DESKTOP_MODE: false };
  c.window = c; vm.createContext(c);
  const run = source => vm.runInContext(source,c);
  const read = source => JSON.parse(run('JSON.stringify(' + source + ')'));
  for (const file of ['pad-core/data.js','pad-core/theory.js','pad-core/builder-ui.js','data.js',
    'instruments.js','plain.js','perform.js','builder.js','theory.js','push-midi-cc-map.js',
    'push-web-control.js','midi-input-state.js','push-midi-port-contract.js','midi.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c,{filename:file});
  }
  for (const name of ['updateChordDisplay','updatePlainDisplay','updatePlainUI','updateMemorySlotUI','updateBankUI',
    'render','refreshLaunchpadLEDs','updateChordKeyDisplay','updateKeyButtons','updateVoicingButtons','updateOctaveLabel',
    'updateTastyUI']) c[name] = () => {};
  c.ensureAudioResumed = () => {};
  c.t = key => key;
  c.playCurrentChord = () => played.push(read('getBuilderPCS()'));
  c.padWebSendPushButtonLed = (cc,state) => leds.set(cc,state);
  run("BankState.banks=[{id:'a',name:'A',memory:Array(16).fill(null)}]; BankState.activeBankId='a'; AppState.mode='chord';AppState.key=0;AppState.scaleIdx=0;");
  let nowMs = 1000;
  function cc(code,value=127) { nowMs+=200; return c.padWebHandlePushMidiCc(code,value,{inputName:'Ableton Push 3 Live Port',nowMs}); }
  const row = () => read('padWebGetPushDisplaySnapshot().chordLowerRow');
  const state = () => read('[BuilderState.root,BuilderState.quality && BuilderState.quality.name,BuilderState.bass,BuilderState.tension,BuilderState._fromDiatonic,BuilderState._fromSecDom,BuilderState._diatonicScaleIdx]');
  return {c,run,read,cc,row,state,storage,leds,played};
}

const majorLayers = [['Diatonic',0,0],['Relative',5,9],['Harmonic Minor',7,9],['Melodic Minor',14,9],['Parallel',5,0]];
describe('S1 A01-A03: Chord lower buttons', () => {
  it('S1 A02 old-source negative: raw lower degree changes the real builder, not an instrument toggle', () => {
    const b=browser(); expect(b.c.AppState).toBeUndefined();
    b.cc(21);
    expect(b.read('BuilderState.root')).toBe(0);
    expect(b.read('BuilderState.quality.name')).toBe('maj7');
    expect(b.played.length).toBe(1);
    expect(b.played[0]).toEqual(b.read('getBuilderPCS()'));
    expect(b.read('showGuitar')).toBe(false);
  });
  it('S1 A01 old-source negative: first lower button cycles the manual layer, not Link', () => {
    const b=browser(); const previous=b.read('linkMode'); b.cc(20);
    expect(b.row()?.labels[0]).toBe('Relative');
    expect(b.read('linkMode')).toBe(previous);
  });
  for (const mode of ['triad','tetrad']) {
    it(`S1 major ${mode}: every layer and degree agrees with real core, snapshot, sound request and LEDs`, () => {
      const b=browser(); b.run(`AppState.diatonicMode='${mode}'`);
      for (const [layer,scale,key] of majorLayers) {
        const expected=b.read(`getDiatonicTetrads(SCALES[${scale}].pcs,${key},${mode==='triad'?3:4})`);
        expect(b.row().labels).toEqual([layer,...expected.map(t=>t.chordName)]);
        for (let i=0;i<7;i++) {
          b.cc(21+i);
          expect(b.read('BuilderState.root')).toBe(expected[i].rootPC);
          expect(b.read('BuilderState.quality.name')).toBe(expected[i].quality.name);
          expect(b.read('BuilderState.quality.pcs')).toEqual(expected[i].quality.pcs);
          expect(b.read('BuilderState._diatonicScaleIdx')).toBe(i);
          expect(b.read('BuilderState._fromDiatonic')).toBe(true);
          expect(b.read('BuilderState._fromSecDom')).toBe(false);
          expect(b.row().states[i+1]).toBe(true);
          expect(b.leds.get(21+i)).toBe('weak');
          expect(b.played.at(-1)).toEqual(b.read('getBuilderPCS()'));
        }
        b.cc(20);
      }
      expect(b.row().labels[0]).toBe('Secondary');
      b.cc(20); expect(b.row().labels[0]).toBe('Diatonic');
    });
  }
  for (const scale of [5,7,14]) {
    it(`S1 minor scale ${scale}: native layer order, key-relative core results and wrap`, () => {
      const b=browser(); b.run(`AppState.scaleIdx=${scale};AppState.key=10`);
      for (const [label,idx] of [['Diatonic',scale],['Natural Minor',5],['Harmonic Minor',7],['Melodic Minor',14],['Parallel',0]]) {
        expect(b.row().labels).toEqual([label,...b.read(`getDiatonicTetrads(SCALES[${idx}].pcs,10,4)`).map(t=>t.chordName)]);
        b.cc(27); expect(b.read('BuilderState.root')).toBe(b.read(`getDiatonicTetrads(SCALES[${idx}].pcs,10,4)[6].rootPC`)); b.cc(20);
      }
      expect(b.row().labels[0]).toBe('Secondary'); b.cc(20); expect(b.row().labels[0]).toBe('Diatonic');
    });
  }
  it('S1 Secondary: null cells are off/no-op, target quality is retained and ordinary selection clears stale provenance', () => {
    const b=browser(); b.cc(21); for(let i=0;i<5;i++) b.cc(20);
    expect(b.row().labels[0]).toBe('Secondary');
    expect(b.row().labels[1]).toBe(''); expect(b.row().states[1]).toBeNull(); expect(b.leds.get(21)).toBe('off');
    const before=b.state(), soundCount=b.played.length; b.cc(21);
    expect(b.state()).toEqual(before); expect(b.played.length).toBe(soundCount);
    b.cc(22); // V7/II in C = A7, minor target.
    expect(b.read('[BuilderState.root,BuilderState.quality.name,BuilderState._fromSecDom,BuilderState._fromDiatonic,BuilderState._secDomTargetIsMajor]')).toEqual([9,'7',true,false,false]);
    expect(JSON.parse(b.storage.get('64pad-settings')).showParentScales).toBe(true);
    b.cc(20); b.cc(21);
    expect(b.read('[BuilderState._fromSecDom,BuilderState._fromDiatonic,BuilderState._secDomTargetIsMajor === undefined]')).toEqual([false,true,true]);
  });
  it('S1 C root is selected, but C slash bass and tensions are not a plain layer chord', () => {
    const b=browser(); b.cc(21); expect(b.row().states[1]).toBe(true);
    b.run('BuilderState.bass=0'); b.c.padWebSyncPushButtonLeds();
    expect(b.row().states[1]).toBe(false); expect(b.leds.get(21)).toBe('white-weak');
    b.run('BuilderState.bass=null;BuilderState.tension={label:"9"}');
    expect(b.row().states[1]).toBe(false);
    b.run('BuilderState.tension=null'); expect(b.row().states[1]).toBe(true);
  });
  it('S1 non-seven-note scale keeps native Parallel fallback and safely normalizes a stale layer index', () => {
    const b=browser(); b.run('AppState.scaleIdx=SCALES.findIndex(s=>s.pcs.length!==7);padWebPushControlState.chordLowerLayerIndex=5');
    expect(b.row().labels[0]).toBe('Parallel');
    expect(b.row().labels.slice(1)).toEqual(b.read('getDiatonicTetrads(SCALES[5].pcs,0,4)').map(t=>t.chordName));
    b.cc(20); expect(b.row().labels[0]).toBe('Parallel'); b.cc(21); expect(b.read('BuilderState.root')).toBe(0);
  });
  it('S1 screen key and triad changes are reflected without mutating the view index or builder', () => {
    const b=browser(); b.cc(20); b.cc(22); const before=b.state();
    b.run('AppState.key=2;AppState.diatonicMode="triad"');
    expect(b.row().labels).toEqual(['Relative',...b.read('getDiatonicTetrads(SCALES[5].pcs,11,3)').map(t=>t.chordName)]);
    expect(b.state()).toEqual(before); expect(b.read('padWebPushControlState.chordLowerLayerIndex')).toBe(1);
  });
  it('S1 Root/Quality entry owns lower buttons before Chord, including empty root cells', () => {
    const b=browser(); b.cc(102); expect(b.row()).toBeNull();
    b.cc(27); expect(b.read('padWebPushControlState.entryStep')).toBe('root');
    b.cc(20); expect(b.read('BuilderState.root')).toBe(8);
    expect(b.read('padWebPushControlState.entryStep')).toBe('quality');
    b.cc(102); expect(b.read('padWebPushControlState.entryStep')).toBeNull();
    expect(b.read('padWebPushControlState.chordLowerLayerIndex')).toBe(0);
  });
  it('S1 Setup and Desktop never dispatch Chord lower selection; other modes do not expose the Chord row', () => {
    const b=browser(); const before=b.state(); b.run('padWebPushControlState.setupActive=true'); b.cc(22);
    expect(b.state()).toEqual(before); expect(b.row()).toBeNull();
    b.run('padWebPushControlState.setupActive=false;IS_DESKTOP_MODE=true'); expect(b.cc(22)).toBe(false); expect(b.state()).toEqual(before);
    b.run('IS_DESKTOP_MODE=false;AppState.mode="scale"'); expect(b.row()).toBeNull();
    b.run('AppState.mode="input"'); expect(b.row()).toBeNull();
  });
  it('S1 empty cells and CC releases do not change the existing chord or sound request count', () => {
    const b=browser(); b.cc(22); const before=b.state(), count=b.played.length;
    b.cc(23,0); expect(b.state()).toEqual(before); expect(b.played.length).toBe(count);
    expect(b.row().states[2]).toBe(true);
  });
});
