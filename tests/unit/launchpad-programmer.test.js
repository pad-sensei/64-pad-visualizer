import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
const lp = require('../../launchpad-programmer.js');
function port(id, name = 'Launchpad Pro MK3 LPProMK3 MIDI') {
  return { id, name, state:'connected', open:vi.fn(async () => {}), send:vi.fn(), clear:vi.fn() };
}
function world() {
  const input = port('in'), output = port('out');
  const access = { sysexEnabled:true, inputs:new Map([[input.id,input]]), outputs:new Map([[output.id,output]]) };
  const released = [], link = lp.create(p => released.push(p.id));
  return { input, output, access, released, link };
}
describe('Pro MK3 Programmer transport', () => {
  it('recognizes only the Pro MK3 MIDI interface, not other models/interfaces', () => {
    for (const name of ['LPProMK3 MIDI','Launchpad Pro MK3','Launchpad Pro [MK3] MIDI','Launchpad Pro MK3 LPProMK3 MIDI']) expect(lp.isMidiPort(name)).toBe(true);
    for (const name of ['Launchpad X','Launchpad Mini MK3','Launchpad Pro','LPProMK3 DAW','LPProMK3 DIN','MIDIIN2 (Launchpad Pro MK3)','MIDIOUT3 (Launchpad Pro MK3)','Push 3']) expect(lp.isMidiPort(name)).toBe(false);
  });
  it('maps exactly all 64 positions and rejects grid edges and malformed numbers', () => {
    for(let i=0;i<64;i++) expect(lp.position(lp.padNote(i))).toEqual({row:Math.floor(i/8),col:i%8});
    for(const n of [0,10,19,20,89,90,99,11.5,NaN]) expect(lp.position(n)).toBe(null);
  });
  it('opens before the mode message and owns only the exact selected input object', async () => {
    const w=world();
    expect(await w.link.connect(w.access,[w.input])).toBe(true);
    expect(w.output.open).toHaveBeenCalledOnce();
    expect(w.output.send.mock.calls[0][0]).toEqual([240,0,32,41,2,14,14,1,247]);
    expect(w.link.isActiveFor(w.input)).toBe(true);
    expect(w.link.isActiveFor({...w.input})).toBe(false);
  });
  it.each(['sysex','input count','output count','selection','open failure','send failure'])('fails closed on %s', async reason => {
    const w=world();
    let selected=[w.input];
    if(reason==='sysex') w.access.sysexEnabled=false;
    if(reason==='input count') w.access.inputs.set('other',port('other'));
    if(reason==='output count') w.access.outputs.set('other',port('other'));
    if(reason==='selection') selected=[];
    if(reason==='open failure') w.output.open.mockRejectedValue(new Error('denied'));
    if(reason==='send failure') w.output.send.mockImplementation(()=>{throw new Error('denied');});
    expect(await w.link.connect(w.access,selected)).toBe(false);
    expect(w.link.isActiveFor(w.input)).toBe(false);
  });
  it('discards a late open completion after disconnect or another connect', async () => {
    const w=world(); let finish;
    w.output.open.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=w.link.connect(w.access,[w.input]);w.link.disconnect();finish();
    expect(await pending).toBe(false);expect(w.output.send).not.toHaveBeenCalled();
  });
  it('uses native Launchpad palette, never custom Push palette numbers', () => {
    expect(lp.paletteForRenderedPad('var(--pad-basic-chord)',true,60,false)).toBe(13); // DOJO guide-C default, independently configurable.
    expect(lp.paletteForRenderedPad('var(--pad-basic-chord)',true,64,false)).toBe(13);
    expect(lp.paletteForRenderedPad('var(--pad-basic-scale)',true,62,true)).toBe(2);
    expect(lp.paletteForRenderedPad('var(--pad-chord)',false,64,false)).toBe(0);
    expect(lp.paletteForRenderedPad('var(--pad-off)',true,60,false)).toBe(0);
    expect(lp.paletteForRenderedPad('var(--pad-root)',true,62,true)).toBe(9); // D-major scale tonic, not shape.
    expect(lp.paletteForRenderedPad('var(--pad-basic-chord)',true,62,false)).toBe(13); // Scale double-stop shape.
  });
  it('sends full paint, only changed pads, and retries a failed send without caching it', async () => {
    const w=world();await w.link.connect(w.access,[w.input]);
    const colors=Array(64).fill(2);
    expect(w.link.paint(colors)).toBe(true);expect(w.output.send.mock.calls.at(-1)[0]).toHaveLength(200);
    const count=w.output.send.mock.calls.length;w.link.paint(colors);expect(w.output.send).toHaveBeenCalledTimes(count);
    colors[0]=45;w.link.paint(colors);expect(w.output.send.mock.calls.at(-1)[0]).toEqual([240,0,32,41,2,14,3,0,11,45,247]);
    w.output.send.mockImplementationOnce(()=>{throw new Error('transport');});colors[1]=13;
    expect(w.link.paint(colors)).toBe(false);expect(w.link.paint(colors)).toBe(true);
    expect(w.output.send.mock.calls.at(-1)[0]).toHaveLength(200);
  });
  it('clears before Live and Note layout; repeated teardown is silent; reconnect repaints all', async () => {
    const w=world();await w.link.connect(w.access,[w.input]);w.link.paint(Array(64).fill(13));
    w.link.disconnect();
    const calls=w.output.send.mock.calls.map(c=>c[0]);
    expect(calls.at(-3).filter((_,i)=>i>=7&&i<calls.at(-3).length-1&&((i-7)%3===2)).every(c=>c===0)).toBe(true);
    expect(calls.at(-2)).toEqual([240,0,32,41,2,14,14,0,247]);
    expect(calls.at(-1)).toEqual([240,0,32,41,2,14,0,4,0,0,247]);
    const count=calls.length;w.link.disconnect();expect(w.output.send).toHaveBeenCalledTimes(count);
    expect(w.released).toEqual(['in']);
    await w.link.connect(w.access,[w.input]);w.link.paint(Array(64).fill(13));expect(w.output.send.mock.calls.at(-1)[0]).toHaveLength(200);
  });
});

// Exercise the real classic-script MIDI runtime; only device/audio/DOM boundaries are mocked.
async function runtime(extraInputs=[],extraOutputs=[]) {
  const w=world(), events=[], handlers={}, elements=new Map();let base=36;
  for(const p of extraInputs) w.access.inputs.set(p.id,p);
  for(const p of extraOutputs) w.access.outputs.set(p.id,p);
  const element=()=>({style:{},value:'all',options:[],appendChild(p){this.options.push(p);},querySelector:()=>({}),addEventListener(type,fn){this[type]=fn;}});
  const c={ console:{log(){},warn(){}}, Set,Map,Array,Promise,Math,performance:{now:()=>1000},
    document:{readyState:'complete',createElement:element,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}},
    localStorage:{getItem:()=>null,setItem(){}},navigator:{requestMIDIAccess:async()=>w.access},
    addEventListener(type,fn){(handlers[type] ||= []).push(fn);},
    AppState:{mode:'chord',showAllPositions:false},BuilderState:{root:0,quality:{}},
    CHORD_DETECT_DB:[],TRIAD_DETECT_DB:[],TETRAD_DETECT_DB:[],
    ROWS:8,COLS:8,ROW_INTERVAL:5,BASE_MIDI:36,baseMidi:()=>base,
    shiftOctave(delta){base+=delta*12;}, memoryViewMode:'memory',linkMode:true,
    handlePerformMidi:()=>false,ensureAudioResumed(){},applyVelocityCurve:v=>v/127,
    noteOn:(n)=>events.push(['on',n]),noteOff:(n)=>events.push(['off',n]),t:k=>k,
    setTimeout:()=>0,clearTimeout(){},render(){},IS_DESKTOP_MODE:false };
  c.window=c;vm.createContext(c);
  for(const f of ['midi-input-state.js','push-midi-port-contract.js','launchpad-programmer.js','midi.js']) vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  c.updateMidiDisplay=()=>{};c.scheduleMidiUpdate=()=>{};
  c.initWebMIDI();await new Promise(resolve=>setImmediate(resolve));
  return {...w,c,events,handlers,elements,send:(p,data)=>p.onmidimessage({data})};
}
describe('Programmer input through the production MIDI runtime',()=>{
  it('keeps 64 physical identities and releases the pressed pitch after octave moves',async()=>{
    const r=await runtime();
    for(let i=0;i<64;i++){
      const note=lp.padNote(i),expected=36+Math.floor(i/8)*5+i%8;
      r.send(r.input,[144,note,100]);r.send(r.input,[128,note,0]);
      expect(r.events.slice(-2)).toEqual([['on',expected],['off',expected]]);
    }
    r.send(r.input,[144,11,100]);r.send(r.input,[176,80,127]);r.send(r.input,[128,11,0]);
    expect(r.events.slice(-2)).toEqual([['on',36],['off',36]]);
    r.send(r.input,[144,11,100]);expect(r.events.at(-1)).toEqual(['on',48]);
    r.send(r.input,[176,91,127]);r.send(r.input,[128,11,0]);
    r.send(r.input,[144,11,100]);expect(r.events.at(-1)).toEqual(['on',48]);
  });
  it('does not remap a keyboard or allow surface CC/aftertouch into notes',async()=>{
    const keyboard=port('keys','Keyboard');const r=await runtime([keyboard]);
    r.send(keyboard,[144,61,100]);expect(r.events.at(-1)).toEqual(['on',61]);
    const count=r.events.length;
    for(const data of [[176,64,127],[160,11,100],[144,19,100],[144,99,100]])r.send(r.input,data);
    expect(r.events).toHaveLength(count);
  });
  it('does not put Launchpad handles into Push cleanup, even alongside a Push',async()=>{
    const push=port('push-in','Ableton Push 3 Live Port'),pushOut=port('push-out','Ableton Push 3 Live Port');
    const r=await runtime([push],[pushOut]);
    expect(r.c.padWebGetPushMidiOutputs()).not.toContain(r.output);
    r.send(r.input,[144,11,100]);
    for(const fn of r.handlers.pagehide)fn();
    expect(r.events.at(-1)).toEqual(['off',36]);
    expect(r.output.send.mock.calls.at(-1)[0]).toEqual([240,0,32,41,2,14,0,4,0,0,247]);
  });
  it('lights only the physically pressed pad and restores ownership after BFCache pageshow',async()=>{
    const r=await runtime();
    r.c.updateLaunchpadLEDs({launchpadPadColors:Array(64).fill(2),rootPC:0});
    r.send(r.input,[144,16,100]); // pitch41 also exists at physical 21
    const packet=r.output.send.mock.calls.at(-1)[0];
    expect(packet).toEqual([240,0,32,41,2,14,3,0,16,21,247]);
    r.send(r.input,[128,16,0]);
    for(const fn of r.handlers.pagehide)fn();
    for(const fn of r.handlers.pageshow)fn({persisted:true});
    await new Promise(resolve=>setImmediate(resolve));
    r.send(r.input,[144,11,100]);expect(r.events.at(-1)).toEqual(['on',36]);
  });
  it('shares off/root frame policy with Desktop without changing base rendered positions',async()=>{
    const r=await runtime(), colors=Array(64).fill(13);
    expect(r.c.launchpadRenderedColors({launchpadPadColors:colors,rootPC:2},new Set([0]))[0]).toBe(21);
    vm.runInContext("_lpLEDMode = 'off'",r.c);
    expect(r.c.launchpadRenderedColors({launchpadPadColors:colors,rootPC:2},new Set([0])).every(c=>c===0)).toBe(true);
    vm.runInContext("_lpLEDMode = 'root'",r.c);
    const root=r.c.launchpadRenderedColors({launchpadPadColors:colors,rootPC:2},new Set([0]));
    expect(root[0]).toBe(0);expect(root[2]).toBe(9);
    expect(r.c.launchpadRenderedColors({})).toBe(null);
  });
  it('releases held notes on output-only disconnect and ignores stale input callback',async()=>{
    const r=await runtime();const stale=r.input.onmidimessage;
    r.send(r.input,[144,11,100]);r.output.state='disconnected';r.access.onstatechange();
    await new Promise(resolve=>setImmediate(resolve));
    expect(r.events.at(-1)).toEqual(['off',36]);
    const count=r.events.length;stale({data:[144,12,100]});expect(r.events).toHaveLength(count);
  });
});

describe('Launchpad delivery assets', () => {
  it('loads the adapter before MIDI and precaches every versioned local script including hyphenated versions', () => {
    const index=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
    expect(index.indexOf('src="launchpad-programmer.js?')).toBeLessThan(index.indexOf('src="midi.js?'));
    const assets=[...index.matchAll(/(?:src|href)="([^"?]+\.(?:js|css)\?v=[^"\s]+)"/g)].map(m=>m[1]).filter(s=>!s.startsWith('http'));
    expect(assets.length).toBeGreaterThan(40);
    for(const asset of assets) expect(sw,asset).toContain("'"+asset+"'");
  });
  it('documents the limited device scope in all nine languages and the Guide', () => {
    for(const lang of ['en','ja','zh','es','fr','pt','de','ko','it']) {
      let data;
      vm.runInNewContext(fs.readFileSync(`lang-${lang}.js`,'utf8'),{I18N:{addLang:(id,obj)=>{expect(id).toBe(lang);data=obj;}}});
      expect(data.help.launchpad_programmer).toContain('Launchpad Pro MK3');
      expect(data.help.launchpad_programmer).toContain('SysEx');
      expect(data.tut.onboarding.midi_msg).toContain('SysEx');
    }
    expect(fs.readFileSync('guide.html','utf8')).toContain('data-i18n="help.launchpad_programmer"');
  });
});
