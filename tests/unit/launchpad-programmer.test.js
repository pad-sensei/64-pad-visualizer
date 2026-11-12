import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
const lp = require('../../launchpad-programmer.js');
function port(id, name = 'Launchpad Pro MK3 LPProMK3 MIDI') {
  const listeners=new Set();
  return { id, name, state:'connected', open:vi.fn(async () => {}), send:vi.fn(), clear:vi.fn(),
    addEventListener(type,fn){if(type==='midimessage')listeners.add(fn);},
    removeEventListener(type,fn){if(type==='midimessage')listeners.delete(fn);},
    emit(data,extra={}){const e={data,...extra};for(const fn of [...listeners])fn(e);this.onmidimessage?.(e);},
    listeners };

}
function world(autoReply=true,options={}) {
  const input = port('in'), output = port('out');
  const access = { sysexEnabled:true, inputs:new Map([[input.id,input]]), outputs:new Map([[output.id,output]]) };
  if(autoReply) output.send.mockImplementation(bytes=>{if(bytes.length===8&&bytes[6]===0)input.emit([240,0,32,41,2,14,0,17,0,0,247]);});
  const released = [], link = lp.create(p => released.push(p.id),options);
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
    expect(w.output.send.mock.calls[1][0]).toEqual([240,0,32,41,2,14,0,247]);
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
async function runtime(extraInputs=[],extraOutputs=[],autoReply=true) {
  const w=world(autoReply), events=[], handlers={}, elements=new Map();let base=36;
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
    setTimeout,clearTimeout,render(){},IS_DESKTOP_MODE:false };
  c.window=c;vm.createContext(c);
  for(const f of ['midi-input-state.js','push-midi-port-contract.js','launchpad-programmer.js','midi.js']) vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  c.updateMidiDisplay=()=>{};c.scheduleMidiUpdate=()=>{};
  c.initWebMIDI();await new Promise(resolve=>setImmediate(resolve));
  return {...w,c,events,handlers,elements,send:(p,data)=>p.emit(data)};
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
      for(const key of ['lp_pending','lp_confirmed','lp_unconfirmed','lp_retry','lp_retry_title','lp_timeout','lp_wrong_mode','lp_sysex','lp_ports','lp_connection'])expect(data.midi[key]).toBeTruthy();
      expect(data.tut.onboarding.midi_msg).toContain('SysEx');
    }
    expect(fs.readFileSync('guide.html','utf8')).toContain('data-i18n="help.launchpad_programmer"');
  });
});

const confirmedLayout=[240,0,32,41,2,14,0,17,0,0,247];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
describe('layout confirmation boundaries',()=>{
  it('send success alone never authorizes notes or LED painting',async()=>{
    const w=world(false),p=w.link.connect(w.access,[w.input]);await tick();
    expect(w.link.isActiveFor(w.input)).toBe(false);expect(w.link.getStatus()).toBe('pending');expect(w.link.isManagedFor(w.input)).toBe(true);expect(w.link.paint(Array(64).fill(2))).toBe(false);
    expect(w.output.send.mock.calls.map(c=>c[0])).toEqual([[240,0,32,41,2,14,14,1,247],[240,0,32,41,2,14,0,247]]);
    w.input.emit(confirmedLayout);expect(await p).toBe(true);expect(w.link.getStatus()).toBe('confirmed');w.link.disconnect();
  });
  it.each([confirmedLayout.slice(0,-1),[...confirmedLayout,0],confirmedLayout.map((v,i)=>i===5?12:v),confirmedLayout.map((v,i)=>i===6?14:v),confirmedLayout.map((v,i)=>i===9?1:v),confirmedLayout.map((v,i)=>i===7?128:v)])('ignores malformed/different-product reply %j',async data=>{
    const w=world(false),p=w.link.connect(w.access,[w.input]);await tick();w.input.emit(data);expect(w.link.isActiveFor(w.input)).toBe(false);expect(w.link.getStatus()).toBe('pending');w.link.disconnect();expect(await p).toBe(false);expect(w.input.listeners.size).toBe(0);
  });
  it.each([[4,0],[17,1]])('rejects wrong layout/page %s/%s and restores Note',async(layout,page)=>{
    const w=world(false),p=w.link.connect(w.access,[w.input]);await tick();const data=confirmedLayout.slice();data[7]=layout;data[8]=page;w.input.emit(data);expect(await p).toBe(false);expect(w.link.getStatus()).toBe('mismatch');expect(w.link.isManagedFor(w.input)).toBe(true);expect(w.output.send.mock.calls.at(-1)[0]).toEqual([240,0,32,41,2,14,0,4,0,0,247]);expect(w.input.listeners.size).toBe(0);w.link.disconnect();
  });
  it('timeout releases held ownership and ignores late responses',async()=>{
    vi.useFakeTimers();try{const w=world(false,{timeoutMs:50}),p=w.link.connect(w.access,[w.input]);await Promise.resolve();const stale=[...w.input.listeners][0];await vi.advanceTimersByTimeAsync(50);expect(await p).toBe(false);expect(w.link.getStatus()).toBe('timeout');expect(w.released).toEqual(['in']);stale({data:confirmedLayout});w.input.emit(confirmedLayout);expect(w.link.isActiveFor(w.input)).toBe(false);expect(w.input.listeners.size).toBe(0);w.link.disconnect();}finally{vi.useRealTimers();}
  });
  it('ignores pre-query, stale timestamp and other-input responses',async()=>{
    const w=world(false,{now:()=>100});w.output.send.mockImplementation(bytes=>{if(bytes.length===9)w.input.emit(confirmedLayout);});const p=w.link.connect(w.access,[w.input]);await tick();expect(w.link.isActiveFor(w.input)).toBe(false);port('other').emit(confirmedLayout);w.input.emit(confirmedLayout,{timeStamp:99});expect(w.link.isActiveFor(w.input)).toBe(false);w.input.emit(confirmedLayout,{timeStamp:101});expect(await p).toBe(true);w.link.disconnect();
  });
  it('old handlers and promises cannot authorize a reconnect; duplicate ACK is inert',async()=>{
    const w=world(false),first=w.link.connect(w.access,[w.input]);await tick();const stale=[...w.input.listeners][0],second=w.link.connect(w.access,[w.input]);await tick();expect(await first).toBe(false);stale({data:confirmedLayout});expect(w.link.isActiveFor(w.input)).toBe(false);w.input.emit(confirmedLayout);expect(await second).toBe(true);const count=w.output.send.mock.calls.length;w.input.emit(confirmedLayout);expect(w.output.send).toHaveBeenCalledTimes(count);w.link.disconnect();
  });
  it.each(['input','output'])('rejects confirmation after %s disconnect',async which=>{
    const w=world(false),p=w.link.connect(w.access,[w.input]);await tick();w[which].state='disconnected';w.input.emit(confirmedLayout);expect(await p).toBe(false);expect(w.link.isActiveFor(w.input)).toBe(false);w.link.disconnect();
  });
  it('pending input is silent; confirmation loss releases captured pitch after octave change',async()=>{
    const keyboard=port('keyboard','Keyboard'),r=await runtime([keyboard],[],false);expect(r.elements.get('midi-indicator').style.background).toBe('#ff9800');for(const data of [[144,11,100],[128,11,0],[176,91,127],[176,80,127]])r.send(r.input,data);expect(r.events).toEqual([]);r.send(keyboard,[144,61,100]);expect(r.events.at(-1)).toEqual(['on',61]);r.send(r.input,confirmedLayout);await tick();expect(r.elements.get('midi-indicator').style.background).toBe('#4caf50');r.send(r.input,[144,11,100]);r.send(r.input,[176,80,127]);const lost=confirmedLayout.slice();lost[7]=4;r.send(r.input,lost);expect(r.events.at(-1)).toEqual(['off',36]);expect(r.elements.get('midi-indicator').style.background).toBe('#ff9800');const count=r.events.length;r.send(r.input,[144,11,100]);r.send(r.input,confirmedLayout);r.send(r.input,[128,11,0]);expect(r.events).toHaveLength(count);for(const fn of r.handlers.pagehide)fn();
  });
});

describe('unavailable Programmer transport is still quarantined',()=>{
  it.each(['sysex','ambiguous outputs'])('never passes Pro MK3 notes through on %s',async reason=>{
    const r=await runtime([],reason==='ambiguous outputs'?[port('out2')]:[],false);
    if(reason==='sysex'){r.access.sysexEnabled=false;r.elements.get('midi-device-select').change();await tick();}
    expect(vm.runInContext('launchpadLink.isManagedFor(midiAccess.inputs.get("in"))',r.c)).toBe(true);
    expect(r.elements.get('midi-indicator').style.background).toBe('#ff9800');
    for(const data of [[144,11,100],[176,91,127],[128,11,0]])r.send(r.input,data);
    expect(r.events).toEqual([]);for(const fn of r.handlers.pagehide)fn();
  });
});

describe('restored page must reconfirm',()=>{
  it('BFCache resume remains silent until a new response, never reuses the old ACK',async()=>{
    const r=await runtime();r.send(r.input,[144,11,100]);for(const fn of r.handlers.pagehide)fn();expect(r.events.at(-1)).toEqual(['off',36]);
    r.output.send.mockImplementation(()=>{});for(const fn of r.handlers.pageshow)fn({persisted:true});await tick();
    const count=r.events.length;r.send(r.input,[144,11,100]);expect(r.events).toHaveLength(count);
    expect(vm.runInContext('launchpadLink.getStatus()',r.c)).toBe('pending');r.send(r.input,confirmedLayout);await tick();r.send(r.input,[144,11,100]);expect(r.events.at(-1)).toEqual(['on',36]);
    for(const fn of r.handlers.pagehide)fn();
  });
});

describe('reported Note-mode hypothesis and one-click recovery',()=>{
  it('blocks raw24/36 until confirmed, then maps11/33 to C1/C2 without blacklisting valid coordinates',async()=>{
    const keyboard=port('keyboard','Keyboard'),r=await runtime([keyboard],[],false);
    const oldAck=[...r.input.listeners][0];
    for(const raw of [24,36]){r.send(r.input,[144,raw,100]);r.send(r.input,[128,raw,0]);}expect(r.events).toEqual([]);
    const noteMode=confirmedLayout.slice();noteMode[7]=4;r.send(r.input,noteMode);
    expect(vm.runInContext('launchpadLink.getReason()',r.c)).toBe('layout');
    for(const raw of [24,36])r.send(r.input,[144,raw,100]);expect(r.events).toEqual([]);
    r.send(keyboard,[144,61,100]);const retry=r.elements.get('launchpad-retry');expect(retry.hidden).toBe(false);retry.onclick();retry.onclick();await tick();
    expect(r.events).toEqual([['on',61]]);expect(vm.runInContext('launchpadLink.getReason()',r.c)).toBe(null);expect(vm.runInContext('launchpadLink.getStatus()',r.c)).toBe('pending');
    oldAck({data:noteMode});expect(vm.runInContext('launchpadLink.getStatus()',r.c)).toBe('pending');expect(vm.runInContext('launchpadLink.getReason()',r.c)).toBe(null);
    for(const raw of [24,36])r.send(r.input,[144,raw,100]);expect(r.events).toEqual([['on',61]]);
    r.send(r.input,confirmedLayout);await tick();expect(retry.hidden).toBe(true);expect(vm.runInContext('launchpadLink.getReason()',r.c)).toBe(null);
    for(const [raw,pitch] of [[11,36],[33,48],[24,44],[36,51]]){r.send(r.input,[144,raw,100]);r.send(r.input,[128,raw,0]);expect(r.events.slice(-2)).toEqual([['on',pitch],['off',pitch]]);}
    expect(r.events.filter(e=>e[0]==='off'&&e[1]===61)).toEqual([]);for(const fn of r.handlers.pagehide)fn();
  });
  it.each(['sysex','ports'])('shows unavailable reason %s without trying to force permission or a port',async reason=>{
    const w=world(false);if(reason==='sysex')w.access.sysexEnabled=false;else w.access.outputs.set('other',port('other'));
    expect(await w.link.connect(w.access,[w.input])).toBe(false);expect(w.link.getReason()).toBe(reason);expect(w.output.send).not.toHaveBeenCalled();w.link.disconnect();expect(w.link.getReason()).toBe(null);
  });
});
