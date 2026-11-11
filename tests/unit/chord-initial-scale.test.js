import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { dm7 } from './helpers/chord-render-fixture.mjs';

const major = [0,2,4,5,7,9,11], dorian = [0,2,3,5,7,9,10];
function empty(options = {}) { return dm7({ fullRender:true, fixed:false, root:null, quality:null, ...options }); }
function checkBackground(f, { key=0, intervals=major, fixed=false } = {}) {
  const root=fixed?0:key, pcs=new Set((fixed?major:intervals).map(iv=>(iv+root)%12));
  expect(f.read('Array.from(padState.scaleBgPCS || []).sort((a,b)=>a-b)')).toEqual([...pcs].sort((a,b)=>a-b));
  expect(f.read('padState.scaleBgRootPC')).toBe(root);
  expect(f.read('Array.from(padState.basicFormPadSet || [])')).toEqual([]);
  expect(f.pads).toHaveLength(64);
  for(let i=0;i<64;i++) {
    const pc=f.read(`pitchClass(midiNote(${Math.floor(i/8)},${i%8}))`);
    const role=!pcs.has(pc)?'pad-off':pc===root?'pad-root':'pad-basic-scale';
    expect(f.pads[i].getAttribute('fill'),`SVG pad ${i}`).toBe(`var(--${role})`);
    expect(f.read(`padState.launchpadPadColors[${i}]`),`Launchpad pad ${i}`).toBe(!pcs.has(pc)?0:pc===0?45:pc===root?9:2);
  }
}

describe('full render: Chord background before a chord exists (Issue #37)', () => {
  it('fresh Chord view sends a scale surface from render to SVG and Launchpad', () => {
    const f=empty(); expect(f.read('AppState.mode')).toBe('chord'); checkBackground(f);
  });
  it.each([
    [null,null], [2,null], [null,{name:'m7',pcs:[0,3,7,10]}],
  ])('incomplete builder root=%s quality=%j keeps background', (root,quality) => checkBackground(empty({root,quality})));
  for(const fixed of [false,true]) for(const panel of [false,true])
  it(`key/scale/octave follow without a chord, C Fixed=${fixed}, Available Scale panel=${panel}`, () => {
    const f=empty({fixed});
    f.run(`AppState.showParentScales=${panel}; AppState.key=7; AppState.scaleIdx=1; AppState.octaveShift=1;`);f.rerender();
    expect(f.read('baseMidi()')).toBe(48);checkBackground(f,{key:7,intervals:dorian,fixed});
    f.run('AppState.key=2; AppState.scaleIdx=0; AppState.octaveShift=-1');f.rerender();
    expect(f.read('baseMidi()')).toBe(24);checkBackground(f,{key:2,fixed});
  });
  it('selecting and then clearing a chord removes the old shape but keeps the scale', () => {
    const f=empty();checkBackground(f);
    f.run("BuilderState.root=2; BuilderState.quality={name:'m7',pcs:[0,3,7,10]}");f.rerender();
    const selected=f.read('[...padState.basicFormPadSet]');expect(selected).toHaveLength(4);
    selected.forEach(i=>expect(f.pads[i].getAttribute('fill')).toBe('var(--pad-basic-chord)'));
    f.run('BuilderState.root=null;BuilderState.quality=null');f.rerender();checkBackground(f);
  });
  it('Scale → empty Chord → Input → empty Chord has no stale or missing background', () => {
    const f=empty();
    for(const mode of ['scale','chord','input','chord']) {
      f.run(`AppState.mode='${mode}'`);f.rerender();
      if(mode!=='scale') checkBackground(f);
    }
  });
  it('Show All Positions on/off before chord selection keeps the same background', () => {
    const f=empty();
    for(const all of [true,false]) { f.run(`AppState.showAllPositions=${all}`); f.rerender();checkBackground(f); }
  });
  it('empty all-positions keeps C Fixed even when key and scale differ', () => {
    const f=empty({fixed:true,all:true});
    f.run('AppState.key=7;AppState.scaleIdx=1');f.rerender();checkBackground(f,{fixed:true});
  });
  it('selected voicing boxes retain their existing outside-position suppression', () => {
    const f=dm7({fullRender:true});
    f.run('VoicingState.lastBoxes=[{midiNotes:getCurrentChordMidiNotes(),currentAlt:0,alternatives:[basicFormArrangements()[0]]}];VoicingState.selectedBoxIdx=0');f.rerender();
    expect(f.read('!!padState.scaleBgPCS')).toBe(false);
    expect(f.pads[0].getAttribute('opacity')).toBe('0');
    expect(f.read('padState.launchpadPadColors[0]')).toBe(0);
  });
  it('existing Web Push no-shape scale fallback agrees without changing Push code', () => {
    const f=empty();
    const source=fs.readFileSync('midi.js','utf8');const start=source.indexOf('function _padColorToLP('),end=source.indexOf('function _pushPaletteColors64(',start);
    Object.assign(f.c,{_isPush:true,_lpLEDMode:'full',midiActiveNotes:new Set()});vm.runInContext(source.slice(start,end),f.c);
    for(let i=0;i<64;i++) {
      const pc=(36+Math.floor(i/8)*5+i%8)%12;
      expect(f.run(`_padColorToLP(padState,${Math.floor(i/8)},${i%8})`)).toBe(pc===0?3:major.includes(pc)?122:0);
    }
    checkBackground(f);
  });
});
