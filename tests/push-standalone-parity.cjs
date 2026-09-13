// Browser classic-script regression: intentionally no window.AppState mocks.
// Expected gestures come from the Standalone control vocabulary, not from Web's
// previous implementation. DOM painting/audio hardware are the only boundaries
// stubbed; mode/view, builder state, slot persistence and Undo/Redo are real code.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');

function browser() {
  const events = [], storage = new Map(), elements = new Map();
  function element() {
    const classes = new Set();
    return { style: {}, dataset: {}, value: '', textContent: '', children: [],
      classList: { contains: c => classes.has(c), add: (...cs) => cs.forEach(c => classes.add(c)),
        remove: (...cs) => cs.forEach(c => classes.delete(c)),
        toggle(c, on) { on = on === undefined ? !classes.has(c) : on; on ? classes.add(c) : classes.delete(c); return on; } },
      appendChild(e) { this.children.push(e); }, addEventListener() {}, removeEventListener() {},
      querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, getAttribute: () => null };
  }
  const context = { console, Set, Map, Array, Math, Date, JSON, Promise,
    location: { pathname: '/apps/64-pad-dev/', search: '' },
    document: { readyState: 'loading', body: element(),
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener() {}, createElement: element },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: f => f(),
    addEventListener() {}, IS_DESKTOP_MODE: false };
  context.window = context;
  vm.createContext(context);
  function run(source) { return vm.runInContext(source, context); }
  for (const file of ['pad-core/data.js', 'data.js', 'instruments.js', 'plain.js', 'perform.js', 'builder.js', 'theory.js', 'push-midi-cc-map.js', 'push-web-control.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  for (const name of ['updateChordDisplay', 'updatePlainDisplay', 'updatePlainUI', 'updateMemorySlotUI', 'updateBankUI',
    'render', 'refreshLaunchpadLEDs', 'updateChordKeyDisplay', 'updateKeyButtons', 'updateVoicingButtons', 'updateOctaveLabel']) context[name] = () => {};
  context.noteOn = n => events.push(['on', n]);
  context.noteOff = n => events.push(['off', n]);
  context.ensureAudioResumed = () => {};
  context.playCurrentChord = () => {}; // audio scheduling boundary; inversion state is real
  context.t = key => key;
  context.setSustain = on => events.push(['sustain', on]);
  context.detectChord = () => [{ name: 'test chord' }];
  // Real-state helpers, not replacement mode/control actions.
  run("BankState.banks = [{ id:'a', name:'A', memory:Array(16).fill(null) }]; BankState.activeBankId='a';");
  let nowMs = 1000;
  function cc(cc, value = 127) { nowMs += 200; return context.padWebHandlePushMidiCc(cc, value, { inputName: 'Ableton Push 3 Live Port', nowMs }); }
  function read(expression) { return JSON.parse(run('JSON.stringify(' + expression + ')')); }
  function slot(index = 0, notes = [60,64,67]) { run(`PlainState.memory[${index}] = makeMemorySlot(${JSON.stringify(notes)},'C',null); syncMemoryToActiveBank();`); }
  function down(raw = 60) { return context.padWebPushControlWillHandlePad(raw, true); }
  function up(raw = 60) { return context.padWebPushControlWillHandlePad(raw, false); }
  return { context, run, read, cc, slot, down, up, events, storage };
}

test('classic lexical state is live; plain Chord Jog inverts instead of selecting a box', () => {
  const b = browser();
  assert.equal(b.context.AppState, undefined);
  b.run("AppState.mode='chord'; BuilderState.root=0; BuilderState.quality={name:'maj',pcs:[0,4,7]}; VoicingState.lastBoxes=[{midiNotes:[60,64,67]}, {midiNotes:[64,67,72]}];");
  b.cc(70, 1);
  assert.equal(b.read('VoicingState.inversion'), 1);
  assert.equal(b.read('VoicingState.selectedBoxIdx'), null);
  b.cc(47); // D-pad down: back to root position
  assert.equal(b.read('VoicingState.inversion'), 0);
});

test('Layout follows musical Input -> Memory slots -> Perform slots -> musical Input', () => {
  const b = browser();
  b.cc(86); // Record always enters musical Input
  assert.deepEqual(b.read('[AppState.mode,memoryViewMode,padWebPushSlotLayoutActive()]'), ['input','memory',false]);
  b.cc(31);
  assert.deepEqual(b.read('[AppState.mode,memoryViewMode,padWebPushSlotLayoutActive()]'), ['input','memory',true]);
  b.cc(31);
  assert.deepEqual(b.read('[AppState.mode,memoryViewMode,padWebPushSlotLayoutActive()]'), ['input','perform',true]);
  b.cc(31);
  assert.deepEqual(b.read('[AppState.mode,memoryViewMode,padWebPushSlotLayoutActive()]'), ['input','memory',false]);
  b.cc(31); b.cc(86); b.cc(86);
  assert.deepEqual(b.read('[AppState.mode,memoryViewMode,padWebPushSlotLayoutActive()]'), ['input','memory',false]);
});

test('Back deselects a voicing before unwinding the real builder', () => {
  const b = browser();
  b.run("AppState.mode='chord'; BuilderState.root=0; BuilderState.quality={name:'maj',pcs:[0,4,7]}; BuilderState.step=2; BuilderState.tension={label:'9'}; VoicingState.selectedBoxIdx=0;");
  b.cc(119);
  assert.deepEqual(b.read('[VoicingState.selectedBoxIdx,BuilderState.step,BuilderState.tension.label]'), [null,2,'9']);
  b.cc(93); // Jog right side = Back/Undo
  assert.deepEqual(b.read('[BuilderState.step,BuilderState.tension]'), [1,null]);
  b.cc(119);
  assert.equal(b.read('BuilderState.quality'), null);
});

for (const view of ['memory', 'perform']) {
  test(`${view} slots: held Jog/inversion/semitone/octave edits update sounding and saved notes`, () => {
    const b = browser(); b.slot(); b.cc(31); if (view === 'perform') b.cc(31);
    b.down();
    assert.deepEqual(b.events, [['on',60],['on',64],['on',67]]);
    b.cc(70,1);
    assert.deepEqual(b.read('PlainState.memory[0].midiNotes'), [64,67,72]);
    b.cc(45);
    assert.deepEqual(b.read('PlainState.memory[0].midiNotes'), [65,68,73]);
    b.cc(55);
    assert.deepEqual(b.read('PlainState.memory[0].midiNotes'), [77,80,85]);
    b.cc(47);
    assert.deepEqual(b.read('PlainState.memory[0].midiNotes'), [73,77,80]);
    assert.deepEqual(b.read('[...PlainState.activeNotes]'), [73,77,80]);
    assert.equal(b.read('AppState.octaveShift'), 0);
    assert.deepEqual(JSON.parse(b.storage.get('64pad-settings')).banks[0].memory[0].midiNotes, [73,77,80]);
    b.up();
    assert.deepEqual(b.events.slice(-3), [['off',73],['off',77],['off',80]]);
    assert.equal(b.read('PerformState.activePad'), null);
    assert.equal(b.events.some(e => e[0] === 'sustain'), false);
  });
}

test('slot release and repeated packets cannot release a newer slot; auxiliary pads are silent', () => {
  const b = browser(); b.slot(); b.slot(1,[62,65,69]); b.cc(31);
  b.down(); b.down(); assert.equal(b.events.length,3);
  b.down(61); const before = b.events.length;
  b.up(60); assert.equal(b.events.length, before);
  assert.equal(b.read('padWebPushControlState.heldSlot'), 1);
  assert.equal(b.down(99),true); assert.equal(b.up(99),true); assert.equal(b.events.length,before);
  b.up(61); assert.deepEqual(b.events.slice(-3),[['off',62],['off',65],['off',69]]);
});

test('Undo/Redo works on real saved slots, and a new edit invalidates Redo', () => {
  const b = browser(); b.slot(); b.cc(31); b.cc(31); b.down(); b.cc(45);
  b.cc(119); assert.deepEqual(b.read('PlainState.memory[0].midiNotes'), [60,64,67]);
  b.cc(49); b.cc(119); b.cc(49,0);
  assert.deepEqual(b.read('PlainState.memory[0].midiNotes'), [61,65,68]);
  b.cc(93); assert.deepEqual(b.read('PlainState.memory[0].midiNotes'), [60,64,67]);
  b.run("pushUndoState(); PlainState.memory[0]=makeMemorySlot([70,74,77],'new',null);");
  b.cc(95); assert.deepEqual(b.read('PlainState.memory[0].midiNotes'), [70,74,77]);
});

test('screen view, mode changes, slot LED layout and reconnect follow the same state', () => {
  const b = browser(); b.slot(); b.cc(86); b.context.toggleMemoryView('perform');
  assert.equal(b.read('padWebPushSlotLayoutActive()'), true);
  assert.equal(b.context.padWebPushSlotPadColor(3,0),45);
  assert.equal(b.context.padWebPushSlotPadColor(7,7),0);
  b.down(); assert.equal(b.context.padWebPushSlotPadColor(3,0),9);
  b.context.padWebResetPushInputState();
  assert.deepEqual(b.events.slice(-3),[['off',60],['off',64],['off',67]]);
  assert.equal(b.read('padWebPushControlState.ownedPads.size'),0);
  b.context.toggleMemoryView('memory');
  assert.equal(b.context.padWebPushSlotPadColor(3,0),null);
  b.cc(58); assert.equal(b.read('AppState.mode'),'scale');
  assert.equal(b.read('padWebPushSlotLayoutActive()'),false);
});

test('a physical held slot, not a latched screen buffer, owns octave editing', () => {
  const b = browser(); b.cc(86);
  b.run('PlainState.activeNotes=new Set([60,64,67]); PerformState.activePad=0;');
  b.cc(55);
  assert.equal(b.read('AppState.octaveShift'),1);
  assert.deepEqual(b.read('[...PlainState.activeNotes]'),[60,64,67]);
});

test('Desktop receives no second Web dispatch', () => {
  const b=browser(); b.context.IS_DESKTOP_MODE=true;
  assert.equal(b.cc(31),false); assert.equal(b.down(),false);
  assert.equal(b.context.padWebHandlePushControl(47,0),false);
  assert.equal(b.read('AppState.mode'),'chord');
});

async function midiBrowser(instrument) {
  const b = browser(), c = b.context, cancelled = [];
  const input = { id:'push-live', name:'Ableton Push 3 Live Port', state:'connected', type:'input', connection:'open', onmidimessage:null, open:async () => {} };
  const user = { id:'push-user', name:'Ableton Push 3 User Port', state:'connected', type:'input', connection:'open', onmidimessage:null, open:async () => {} };
  const access = { inputs:new Map([[input.id,input],[user.id,user]]), outputs:new Map(), sysexEnabled:true, onstatechange:null };
  c.navigator = { requestMIDIAccess: async () => access };
  c.document.getElementById('midi-device-select').value='all';
  Object.assign(c, {
    CHORD_DETECT_DB:[], TRIAD_DETECT_DB:[], TETRAD_DETECT_DB:[],
    _soundMuted:false, _useEpianoWorklet:instrument==='worklet',
    masterGain:{}, audioCtx:{currentTime:0,state:'running'},
    AudioState:{instrument: instrument==='sampler' ? {sampler:'fixture'} : instrument==='waf' ? {data:{}} : {epiano:'Rhodes DI'}},
    _hidePadHint() {}, triggerAutoFilter() {}, saveSoundSettings() {}, _ensureWafPlayer:()=>true,
    wafPlayer:{queueWaveTable:()=>({cancel:()=>cancelled.push('waf')}),cancelQueue(){}},
    _samplerNoteOn:()=>({cancel:()=>cancelled.push('sampler')}),
    epianoNoteOn:()=>({cancel:()=>cancelled.push('fallback')}),
    EP_AMP_PRESETS:{'Rhodes DI':{useCabinet:false}}, EpState:{preset:'Rhodes DI'},
    epianoReverbSend:{gain:{setValueAtTime(){}}}, epianoDirectOut:{}, epianoAmpOut:{},
  });
  const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c,{filename:file});
  let dsp, resolveModule;
  if(instrument==='worklet') {
    let Processor;
    const dc=vm.createContext({console,sampleRate:48000, AudioWorkletProcessor:class {constructor(){this.port={postMessage(){}};}}, registerProcessor:(_,P)=>{Processor=P;}});
    vm.runInContext(fs.readFileSync(path.join(root,'audio-core/epiano-worklet-processor.js'),'utf8'),dc);
    dsp=new Processor();
    c.AudioWorkletNode=class {constructor(){this.port={postMessage:message=>dsp.port.onmessage({data:message})};}connect(){}};
    c.audioCtx.audioWorklet={addModule:()=>new Promise(resolve=>{resolveModule=resolve;})};
    c.fetch=()=>Promise.reject(new Error('no optional FDTD fixture'));
    load('audio-core/epiano-worklet-engine.js');
  }
  load('audio-core/audio-voice.js');
  load('pad-core/observed-structure.js'); load('observed-ust-consumer.js');
  load('midi-input-state.js'); load('push-midi-port-contract.js'); load('midi.js');
  c.updateMidiDisplay=()=>{}; c.scheduleMidiUpdate=()=>{};
  c.refreshLaunchpadLEDs=()=>{};
  c.initWebMIDI();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof input.onmidimessage,'function');
  assert.equal(user.onmidimessage,null,'User Port must not take over performance input');
  function send(status,number,value) { input.onmidimessage({data:[status,number,value]}); }
  return {...b, send, access, input, cancelled, dsp,
    async finishInit(){assert.ok(resolveModule);resolveModule();await new Promise(resolve => setImmediate(resolve));} };
}

for(const instrument of ['sampler','waf','fallback']) {
  test(`Live-port raw CC64 -> real MIDI handler -> audio-voice -> ${instrument} release`,async()=>{
    const b=await midiBrowser(instrument);
    b.send(0xb0,64,127); b.send(0x90,36,100); b.send(0x80,36,0);
    assert.equal(b.read('_sustainOn'),true);
    assert.equal(b.read('activeVoices.size'),1);
    assert.equal(b.cancelled.length,0);
    b.send(0xb0,64,0);
    assert.equal(b.read('activeVoices.size'),0);
    assert.deepEqual(b.cancelled,[instrument]);
  });
}

test('Live-port CC64 before init reaches real worklet DSP; physical release clears pending voices',async()=>{
  const b=await midiBrowser('worklet');
  b.send(0xb0,64,127); b.send(0x90,36,100); b.send(0x80,36,0);
  await b.finishInit();
  const pitch=b.read('baseMidi()');
  assert.equal(b.dsp.sustainOn,true);
  assert.equal(b.dsp.sustainPending[pitch],1);
  assert.ok(b.dsp.vActive.some(value=>value>0 && value!==3));
  function tailRms(blocks) {
    const left=new Float32Array(128), right=new Float32Array(128);
    let energy=0;
    for(let block=0;block<blocks;block++) {
      b.dsp.process([],[[left,right]],{});
      if(block>=blocks-50) for(const sample of left) {assert.ok(Number.isFinite(sample));energy+=sample*sample;}
    }
    return Math.sqrt(energy/(50*128));
  }
  const heldRms=tailRms(120);
  assert.ok(heldRms>1e-7, 'DSP became silent while physical sustain was held');
  b.send(0xb0,64,0);
  assert.equal(b.dsp.sustainOn,false);
  assert.equal(b.dsp.sustainPending[pitch],0);
  assert.ok(b.dsp.vActive.some(value=>value===3));
  const releasedRms=tailRms(200);
  assert.ok(releasedRms<heldRms*0.01, `pedal-up did not damp PCM: ${releasedRms}/${heldRms}`);
});

test('Live-port held slot Jog is not swallowed by the held-pad CC filter; CC64 survives Layout',async()=>{
  const b=await midiBrowser('waf'); b.slot(); b.context.detectChord=()=>[{name:'test chord'}];
  b.send(0xb0,31,127); b.send(0x90,60,100);
  b.send(0xb0,70,1);
  assert.deepEqual(b.read('PlainState.memory[0].midiNotes'),[64,67,72]);
  b.send(0xb0,64,127); b.send(0x80,60,0); b.send(0xb0,31,127);
  assert.equal(b.read('_midiSustainOn'),true);
  assert.equal(b.read('_sustainOn'),true);
  b.send(0xb0,64,0); assert.equal(b.read('activeVoices.size'),0);
});


test('Layout releases old musical key ownership without forging pedal-up',async()=>{
  const b=await midiBrowser('waf');
  b.send(0x90,36,100);
  b.send(0xb0,31,127);
  assert.equal(b.read('midiActiveNotes.size'),0);
  assert.equal(b.read('activeVoices.size'),0);
  b.send(0x80,36,0);
  assert.deepEqual(b.cancelled,['waf']);
  b.send(0xb0,86,127);
  b.send(0xb0,64,127); b.send(0x90,36,100); b.send(0xb0,31,127);
  assert.equal(b.read('_midiSustainOn'),true);
  assert.equal(b.read('_sustainOn'),true);
  b.send(0x80,36,0); b.send(0xb0,64,0);
  assert.equal(b.read('activeVoices.size'),0);
});

test('disconnect and stale callbacks release slot and sustain, with no stale replay',async()=>{
  const b=await midiBrowser('waf'); b.slot(); b.send(0xb0,31,127); b.send(0xb0,64,127); b.send(0x90,60,100);
  const stale=b.input.onmidimessage;
  b.input.state='disconnected'; b.access.onstatechange();
  assert.equal(b.read('activeVoices.size'),0);
  assert.equal(b.read('_sustainOn'),false);
  assert.equal(b.read('padWebPushControlState.heldSlot'),null);
  stale({data:[0x90,60,100]}); assert.equal(b.read('activeVoices.size'),0);
});

test('held pitch edits clamp MIDI bounds and never modify another slot',()=>{
  const b=browser(); b.slot(0,[120,124,127]); b.slot(1,[60,64,67]); b.cc(31); b.down(); b.cc(55);
  assert.deepEqual(b.read('PlainState.memory[0].midiNotes'),[127,127,127]);
  assert.deepEqual(b.read('PlainState.memory[1].midiNotes'),[60,64,67]);
  b.up(); b.slot(0,[0,3,7]); b.down(); b.cc(54);
  assert.deepEqual(b.read('PlainState.memory[0].midiNotes'),[0,0,0]);
});
