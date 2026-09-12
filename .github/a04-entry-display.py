from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    assert s.count(old) == 1, (path, s.count(old), old[:80])
    p.write_text(s.replace(old, new))

# 1) Match Standalone entry selection semantics without replacing the existing
#    selectRoot/selectQuality flow.
replace_once('push-web-control.js',
"""    controlState.entryRoot = runtime.BuilderState && runtime.BuilderState.root !== null && runtime.BuilderState.root !== undefined
      ? runtime.BuilderState.root : (runtime.AppState ? runtime.AppState.key : 0);
""",
"""    controlState.entryRoot = runtime.BuilderState && runtime.BuilderState.root !== null && runtime.BuilderState.root !== undefined
      ? runtime.BuilderState.root : null;
""")
replace_once('push-web-control.js',
"""    if (controlState.entryStep === 'root') controlState.entryRoot = wrap((controlState.entryRoot || 0) + (delta < 0 ? -1 : 1), 12);
""",
"""    if (controlState.entryStep === 'root') {
      if (controlState.entryRoot === null || controlState.entryRoot === undefined) controlState.entryRoot = delta < 0 ? 11 : 0;
      else controlState.entryRoot = wrap(controlState.entryRoot + (delta < 0 ? -1 : 1), 12);
    }
""")

marker = """  function chordLowerRow() {
"""
entry_fn = r'''  function entryRootLabel(pc) {
    if (pc === null || pc === undefined) return 'None';
    try {
      if (typeof pcName === 'function') return pcName(pc, runtime.AppState ? runtime.AppState.key : pc);
    } catch (_) {}
    var names = typeof NOTE_NAMES_SHARP !== 'undefined' ? NOTE_NAMES_SHARP : global.NOTE_NAMES_SHARP;
    return names && names[pc] ? names[pc] : String(pc);
  }

  function chordEntryDisplay() {
    if (global.IS_DESKTOP_MODE || !controlState.entryStep) return null;
    var labels = new Array(16).fill('');
    var states = new Array(16).fill(null);
    var activeIndex = -1;
    if (controlState.entryStep === 'root') {
      activeIndex = controlState.entryRoot === null || controlState.entryRoot === undefined ? -1 : controlState.entryRoot;
      for (var i = 0; i < 12; i++) {
        labels[i] = entryRootLabel(i);
        states[i] = i === activeIndex;
      }
    } else {
      var qualities = qualityList();
      activeIndex = controlState.entryQualityIndex;
      for (var q = 0; q < Math.min(16, qualities.length); q++) {
        labels[q] = qualities[q] && qualities[q].name ? qualities[q].name : '';
        states[q] = q === activeIndex;
      }
    }
    var title = controlState.entryStep === 'root' ? 'Select Root' : 'Select Quality';
    var detail = controlState.entryStep === 'root'
      ? ('Root: ' + entryRootLabel(controlState.entryRoot))
      : ('Quality: ' + (labels[activeIndex] || ''));
    return {
      step: controlState.entryStep,
      title: title,
      detail: detail,
      hint: 'Display buttons choose / Jog moves / Press confirms',
      upper: { labels: labels.slice(0, 8), states: states.slice(0, 8) },
      lower: { labels: labels.slice(8, 16), states: states.slice(8, 16) },
    };
  }

'''
replace_once('push-web-control.js', marker, entry_fn + marker)
replace_once('push-web-control.js',
"""  global.padWebGetPushChordLowerRow = chordLowerRow;
""",
"""  global.padWebGetPushChordEntryDisplay = chordEntryDisplay;
  global.padWebGetPushChordLowerRow = chordLowerRow;
""")

# 2) Put the controller-owned entry projection into the existing display snapshot.
replace_once('midi.js',
"""    tensions: tensions,
    chordLowerRow: typeof window.padWebGetPushChordLowerRow === 'function' ? window.padWebGetPushChordLowerRow() : null,
""",
"""    tensions: tensions,
    chordEntry: typeof window.padWebGetPushChordEntryDisplay === 'function' ? window.padWebGetPushChordEntryDisplay() : null,
    chordLowerRow: typeof window.padWebGetPushChordLowerRow === 'function' ? window.padWebGetPushChordLowerRow() : null,
""")

# 3) Display the same upper/lower 8-button candidate rows and entry title/detail.
replace_once('push-display-webusb-app.js',
"""      const inputMode = snap.mode === 'input';
      const upper = inputMode
        ? ['', '', '', '', '', '', 'Key', 'Scale']
        : ['', 'Tasty', 'Stock', 'Guitar', '', 'Tension', 'Key', 'Scale'];
      const chordRow = snap.mode === 'chord' ? snap.chordLowerRow : null;
      const lower = chordRow ? chordRow.labels : ['Link', 'Guitar TAB', 'Bass TAB', 'Piano', 'Relative', 'Parallel', 'Secondary', 'Available'];
      drawControlRow(upper, 14);
      drawControlRow(lower, 148, chordRow && chordRow.states);
      drawKeyScale(snap);

      if (snap.chord) drawPixelText(snap.chord, 32, 42, 4, '#ffdb5c', 20);
      if (snap.notes?.length) drawPixelText(`NOTE: ${snap.notes.join(' ')}`, 36, 82, 1, '#ccdae0', 34);

      const detailX = 430;
      if (snap.ust) {
        const parts = String(snap.ust).split(' / ');
        drawPixelText(`UST ${parts[0]}`, detailX, 70, 2, '#ffdb5c', 34);
        if (parts.length > 1) drawPixelText(`/ ${parts.slice(1).join(' / ')}`, detailX, 88, 1, '#ffdb5c', 64);
      }
      if (snap.shell) drawUtf8Text(`Shell: ${snap.shell}`, detailX, 104, '#ccdae0');
      if (snap.tensions) drawUtf8Text(`Tension ${snap.tensions}`, detailX, 122, '#ffb848');
""",
"""      const entry = snap.chordEntry || null;
      const inputMode = snap.mode === 'input';
      const upper = entry ? entry.upper.labels : (inputMode
        ? ['', '', '', '', '', '', 'Key', 'Scale']
        : ['', 'Tasty', 'Stock', 'Guitar', '', 'Tension', 'Key', 'Scale']);
      const chordRow = snap.mode === 'chord' ? snap.chordLowerRow : null;
      const lower = entry ? entry.lower.labels : (chordRow ? chordRow.labels : ['Link', 'Guitar TAB', 'Bass TAB', 'Piano', 'Relative', 'Parallel', 'Secondary', 'Available']);
      drawControlRow(upper, 14, entry ? entry.upper.states : null);
      drawControlRow(lower, 148, entry ? entry.lower.states : (chordRow && chordRow.states));
      drawKeyScale(snap);

      if (entry) {
        drawPixelText(entry.title, 32, 42, 3, '#ffdb5c', 24);
        drawPixelText(entry.detail, 36, 82, 2, '#ccdae0', 32);
        drawUtf8Text(entry.hint, 430, 112, '#84c4d2', 420);
      } else {
        if (snap.chord) drawPixelText(snap.chord, 32, 42, 4, '#ffdb5c', 20);
        if (snap.notes?.length) drawPixelText(`NOTE: ${snap.notes.join(' ')}`, 36, 82, 1, '#ccdae0', 34);

        const detailX = 430;
        if (snap.ust) {
          const parts = String(snap.ust).split(' / ');
          drawPixelText(`UST ${parts[0]}`, detailX, 70, 2, '#ffdb5c', 34);
          if (parts.length > 1) drawPixelText(`/ ${parts.slice(1).join(' / ')}`, detailX, 88, 1, '#ffdb5c', 64);
        }
        if (snap.shell) drawUtf8Text(`Shell: ${snap.shell}`, detailX, 104, '#ccdae0');
        if (snap.tensions) drawUtf8Text(`Tension ${snap.tensions}`, detailX, 122, '#ffb848');
      }
""")

# 4) Delivery identity for every changed runtime file.
for path in ['index.html', 'sw.js']:
    p = Path(path); s = p.read_text()
    pairs = [
      ('push-web-control.js?v=1.8.0-chord-lower-s1', 'push-web-control.js?v=1.8.0-entry-a04'),
      ('midi.js?v=1.8.0-chord-pad-led2', 'midi.js?v=1.8.0-entry-a04'),
      ('push-display-webusb-app.js?v=webusb-20260912-s1', 'push-display-webusb-app.js?v=webusb-20260913-a04'),
    ]
    for old, new in pairs:
      assert s.count(old) == 1, (path, old, s.count(old))
      s = s.replace(old, new)
    p.write_text(s)
replace_once('sw.js', "var CACHE_NAME = '64pad-v180-preview-20260913-chord-pad-led2';", "var CACHE_NAME = '64pad-v180-preview-20260913-entry-a04';")
replace_once('tests/unit/push-display-exposure.test.js', "64pad-v180-preview-20260913-chord-pad-led2", "64pad-v180-preview-20260913-entry-a04")

# 5) Focused real-script regression.
Path('tests/unit/push-chord-entry-display.test.js').write_text(r'''import fs from 'node:fs';
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
  c.ensureAudioResumed=()=>{}; c.t=k=>k; c.padWebSendPushButtonLed=()=>{};
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
''')
