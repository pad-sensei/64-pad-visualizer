import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

const root = process.cwd();
function browser() {
  const storage = new Map(), elements = new Map();
  function element() {
    const classes = new Set();
    return { style:{}, dataset:{}, value:'', textContent:'', children:[], firstElementChild:null,
      classList:{ contains:c=>classes.has(c), add:(...cs)=>cs.forEach(c=>classes.add(c)), remove:(...cs)=>cs.forEach(c=>classes.delete(c)), toggle(c,on){on=on===undefined?!classes.has(c):on;on?classes.add(c):classes.delete(c);return on;} },
      appendChild(e){this.children.push(e);}, addEventListener(){}, removeEventListener(){}, querySelectorAll:()=>[], querySelector:()=>null, setAttribute(){}, getAttribute:()=>null };
  }
  const c={console,Set,Map,Array,Math,Date,JSON,Promise,
    location:{pathname:'/apps/64-pad-dev/',search:''},
    document:{readyState:'loading',body:element(),getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},createElement:element},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:f=>f(),addEventListener(){},IS_DESKTOP_MODE:false};
  c.window=c; vm.createContext(c);
  const run=s=>vm.runInContext(s,c);
  const read=s=>{const j=run('JSON.stringify('+s+')');return j===undefined?undefined:JSON.parse(j);};
  for(const file of ['pad-core/data.js','pad-core/theory.js','pad-core/builder-ui.js','data.js','instruments.js','plain.js','perform.js','builder.js','theory.js','push-midi-cc-map.js','push-web-control.js','pad-core/observed-structure.js','observed-ust-consumer.js','midi-input-state.js','push-midi-port-contract.js','midi.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c,{filename:file});
  for(const name of ['updateChordDisplay','updatePlainDisplay','updatePlainUI','updateMemorySlotUI','updateBankUI','render','refreshLaunchpadLEDs','updateChordKeyDisplay','updateKeyButtons','updateVoicingButtons','updateOctaveLabel','updateTastyUI']) c[name]=()=>{};
  c.ensureAudioResumed=()=>{}; c.playMidiNotes=()=>{}; c.t=k=>k; c.padWebSendPushButtonLed=()=>{};
  run("BankState.banks=[{id:'a',name:'A',memory:Array(16).fill(null)}];BankState.activeBankId='a';AppState.mode='chord';AppState.key=0;AppState.scaleIdx=0;BuilderState.root=null;BuilderState.quality=null;");
  return {c,run,read,snap:()=>read('padWebGetPushDisplaySnapshot().chordEntry'),logical:(code,value)=>c.padWebHandlePushControl(code,value)};
}

describe('S2 A04: Push Root/Quality entry display',()=>{
  it('old-source negative: Root entry projects 8+8 candidates and no false C selection',()=>{
    const b=browser(); b.logical(21,0); const s=b.snap();
    expect(s.title).toBe('Select Root'); expect(s.detail).toBe('Root: None');
    expect(s.upper.labels[0]).toBe('C'); expect(s.upper.labels.filter(Boolean)).toHaveLength(8);
    expect(s.lower.labels.slice(0,4).filter(Boolean)).toHaveLength(4);
    expect(s.lower.labels.slice(4)).toEqual(['','','','']);
    expect(s.upper.states.every(x=>x===false)).toBe(true);
    expect(s.lower.states.slice(4)).toEqual([null,null,null,null]);
    expect(b.read('padWebPushControlState.entryRoot')).toBeNull();
  });
  it('Jog from no Root starts at C forward and B backward, preserving C=0',()=>{
    const b=browser(); b.logical(21,0); b.logical(30,1);
    expect(b.read('padWebPushControlState.entryRoot')).toBe(0); expect(b.snap().upper.states[0]).toBe(true); expect(b.snap().detail).toBe('Root: C');
    b.run('padWebPushControlState.entryRoot=null'); b.logical(30,-1);
    expect(b.read('padWebPushControlState.entryRoot')).toBe(11); expect(b.snap().lower.states[3]).toBe(true);
  });
  it('empty Root cells are no-op, while upper button 1 selects C and advances to Quality',()=>{
    const b=browser(); b.logical(21,0); b.logical(20,4);
    expect(b.read('[BuilderState.root,padWebPushControlState.entryStep]')).toEqual([null,'root']);
    b.logical(21,0);
    expect(b.read('[BuilderState.root,padWebPushControlState.entryStep]')).toEqual([0,'quality']);
    const q=b.snap(); expect(q.title).toBe('Select Quality'); expect(q.detail.startsWith('Quality: ')).toBe(true);
  });
  it('Quality candidates mirror the real flattened BUILDER_QUALITIES and commit through existing selectQuality',()=>{
    const b=browser(); b.logical(21,0); b.logical(21,0); const q=b.snap();
    const expected=b.read('BUILDER_QUALITIES.flat().filter(Boolean).slice(0,16).map(q=>q.name)');
    expect([...q.upper.labels,...q.lower.labels].slice(0,expected.length)).toEqual(expected);
    expect(q.upper.states[0]).toBe(true);
    b.logical(21,0);
    expect(b.read('padWebPushControlState.entryStep')).toBeNull();
    expect(b.read('BuilderState.root')).toBe(0); expect(b.read('BuilderState.quality.name')).toBe(expected[0]);
    expect(b.read('padWebGetPushDisplaySnapshot().chordEntry')).toBeNull();
  });
  it('display renderer consumes chordEntry rows/title/detail instead of inventing another entry state',()=>{
    const src=fs.readFileSync(path.join(root,'push-display-webusb-app.js'),'utf8');
    expect(src).toContain('const entry = snap.chordEntry || null;');
    expect(src).toContain('entry.upper.labels'); expect(src).toContain('entry.lower.labels');
    expect(src).toContain('drawPixelText(entry.title'); expect(src).toContain('drawPixelText(entry.detail');
  });
});
