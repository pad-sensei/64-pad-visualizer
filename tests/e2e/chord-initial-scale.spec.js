import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { isolateColourPage } from './helpers/isolated-colour-page';
test.use({viewport:{width:1280,height:900},launchOptions:{args:['--mute-audio']}});
async function prepare(page, fixed = false, key = 0, root = null, quality = null, colorOff = true) {
  const errors = await isolateColourPage(page, test.info().project.use.baseURL);
  await page.goto('./?silent=1&e2e=chord-tonic-colours');
  await page.waitForFunction(() => document.querySelectorAll('#pad-grid rect.pad').length === 64 && midiAccess !== null);
  await page.evaluate(async ({ fixed, key, root, quality, colorOff }) => {
    // No sounding output is needed for a display test. Keep all rendering/theory real.
    playCurrentChord = () => {};
    playMidiNotes = () => {};
    noteOn = () => {};
    noteOff = () => {};
    if (AppState.mode !== 'chord') throw new Error('Fresh page must start in Chord mode');
    Object.assign(AppState, { key, scaleIdx: 0, padCFixed: fixed, colorOff,
      showAllPositions: false, octaveShift: 0, semitoneShift: 0, showParentScales: true,
      pushScaleRootColor: 3, pushScaleToneColor: 122,
      launchpadColors: { ...padLaunchpadProgrammer.defaultColors } });
    Object.assign(BuilderState, { root, quality: BUILDER_QUALITIES.flat().find(q => q?.name === quality),
      tension: null, bass: null, _fromDiatonic: true, _fromSecDom: false, _diatonicScaleIdx: 1 });
    Object.assign(VoicingState, { selectedBoxIdx: null, lastBoxes: [], basicPosIdx: 0,
      basicOctave: 0, inversion: 0, drop: null, shell: null, omit3: false, omit5: false, rootless: false });
    TastyState.enabled = false; StockState.enabled = false;
    GuitarPositionState.enabled = false; BassPositionState.enabled = false;
    _voicingReflectMode = false; _stockReflectMode = false;
    _instrumentPadSet = null; _instrumentMidiSet = null;
    memoryViewMode = null; PlainState.currentSlot = null; PlainState.activeNotes.clear(); padExtNotes.clear();
    _selectedPS = null; _psChordFP = ''; _psAutoSelect = true;
    const capture = window.__colourCapture = { lp: Array(64).fill(null), push: Array(64).fill(null), lpMessages: [], pushMessages: [] };
    const input = Object.assign(new EventTarget(), { id: 'colour-lp-in', name: 'Launchpad Pro MK3 MIDI', state: 'connected', open: async () => {} });
    const lpOutput = { id: 'colour-lp-out', name: input.name, state: 'connected', open: async () => {},
      send(bytes) {
        const message = Array.from(bytes); capture.lpMessages.push(message);
        if (message.length === 8 && message[6] === 0) input.dispatchEvent(Object.assign(new Event('midimessage'), {data:[240,0,32,41,2,14,0,17,0,0,247]}));
        if (message[0] !== 0xf0 || message[6] !== 3) return;
        for (let i = 7; i < message.length - 1; i += 3) {
          if (message[i] !== 0) throw new Error('Unexpected RGB format in default-palette test');
          const position = padLaunchpadProgrammer.position(message[i + 1]);
          if (!position) throw new Error('Invalid Launchpad pad note');
          capture.lp[position.row * 8 + position.col] = message[i + 2];
        }
      } };
    const access = { sysexEnabled: true, inputs: new Map([[input.id, input]]), outputs: new Map([[lpOutput.id, lpOutput]]) };
    if (!await launchpadLink.connect(access, [input])) throw new Error('Fake Launchpad transport did not connect');
    const pushOutput = { id: 'colour-push-out', name: 'Ableton Push 3 Live Port', state: 'connected',
      send(bytes) {
        const message = Array.from(bytes); capture.pushMessages.push(message);
        if (message[0] === 0x90 && message[1] >= 36 && message[1] < 100) capture.push[message[1] - 36] = message[2];
      } };
    midiOutput = pushOutput; _pushLedOutputs = [pushOutput];
    _isPush = true; _lpOutputActive = true; _lpProgrammerMode = true; _lpLEDMode = 'full';
    _prevLEDState.fill(-1);
    updateKeyButtons(); updateChordDisplay();
    updateLaunchpadLEDs(_lastLEDState);
    document.activeElement?.blur();
  }, { fixed, key, root, quality, colorOff });
  return errors;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const css=getComputedStyle(document.documentElement);
    const normalize=value=>{const s=document.createElement('span').style;s.color=value;return s.color;};
    return {mode:AppState.mode,key:AppState.key,scaleIdx:AppState.scaleIdx,fixed:AppState.padCFixed,octave:AppState.octaveShift,all:AppState.showAllPositions,panel:AppState.showParentScales,root:BuilderState.root,quality:BuilderState.quality?.name??null,
      background:[...(_lastLEDState.scaleBgPCS||[])].sort((a,b)=>a-b),backgroundRoot:_lastLEDState.scaleBgRootPC,shape:[...(_lastLEDState.basicFormPadSet||[])],overlay:[...(_lastLEDState.overlayPCS||[])],
      roles:Object.fromEntries(['pad-root','pad-basic-scale','pad-off','pad-basic-chord'].map(r=>[r,normalize(css.getPropertyValue('--'+r).trim())])),messages:{launchpad:window.__colourCapture.lpMessages,push:window.__colourCapture.pushMessages},
      pads:[...document.querySelectorAll('#pad-grid rect.pad')].map((p,i)=>({index:i,midi:midiNote(i>>3,i%8),fill:p.getAttribute('fill'),computed:normalize(getComputedStyle(p).fill),opacity:getComputedStyle(p).opacity,width:p.getBoundingClientRect().width,lp:window.__colourCapture.lp[i],push:window.__colourCapture.push[i]}))};
  });
}
function background(s,key=0,intervals=[0,2,4,5,7,9,11]) {
  const pcs=intervals.map(v=>(v+key)%12).sort((a,b)=>a-b);
  expect(s.background).toEqual(pcs);expect(s.backgroundRoot).toBe(key);expect(s.shape).toEqual([]);expect(s.pads).toHaveLength(64);
  for(const p of s.pads){const pc=p.midi%12,role=!pcs.includes(pc)?'pad-off':pc===key?'pad-root':'pad-basic-scale';
    expect(p.fill,`SVG ${p.index}`).toBe(`var(--${role})`);expect(p.computed,`CSS ${p.index}`).toBe(s.roles[role]);expect(p.opacity).not.toBe('0');expect(p.width).toBeGreaterThan(0);
    expect(p.lp,`Launchpad ${p.index}`).toBe(!pcs.includes(pc)?0:pc===0?45:pc===key?9:2);// Preserve main's existing empty-Chord overview palette (active scale tones use18).
    expect(p.push,`Web Push ${p.index}`).toBe(!pcs.includes(pc)?0:pc===key?3:s.all?18:122);
  }
}
async function record(page,info,name,errors){const s=await snapshot(page);await writeFile(info.outputPath(name+'.json'),JSON.stringify({state:s,errors},null,2));await page.locator('#pad-grid').screenshot({path:info.outputPath(name+'.png')});expect(errors.page).toEqual([]);expect(errors.http).toEqual([]);expect(errors.network).toEqual([]);const localConsole=errors.console.filter(e=>!(e.message.includes('ERR_BLOCKED_BY_CLIENT')&&errors.blockedExternal.length)&&(!e.url||e.url.startsWith(errors.origin+'/')));expect(localConsole).toEqual([]);return s;}
test('fresh empty Chord, select and clear, controls and Available Scale boundaries',async({page},info)=>{
  const errors=await prepare(page);background(await record(page,info,'01-fresh-chord',errors));
  await page.evaluate(()=>selectRoot(2));background(await record(page,info,'02-root-only',errors));
  await page.evaluate(()=>selectQuality(BUILDER_QUALITIES.flat().find(q=>q?.name==='m7')));
  const chord=await record(page,info,'03-dm7-selected',errors);expect(chord.shape).toHaveLength(4);
  for(const i of chord.shape) expect(chord.pads[i].fill).toBe('var(--pad-basic-chord)');
  await page.locator('.ps-row:not(.ps-selected)').first().click();
  const manual=await record(page,info,'03-manual-available-scale',errors);
  expect(manual.root).toBe(2);expect(manual.backgroundRoot).toBe(2);expect(manual.background).toEqual([...manual.overlay].sort((a,b)=>a-b));expect(manual.shape).toHaveLength(4);
  for(const i of manual.shape) expect(manual.pads[i].fill).toBe('var(--pad-basic-chord)');
  await page.keyboard.press('x');background(await record(page,info,'04-cleared-with-x',errors));
  await page.evaluate(()=>setMode('scale'));
  await page.locator('#key-row-major [data-pc="7"]').click();await page.evaluate(()=>setMode('chord'));background(await record(page,info,'05-g-major',errors),7);
  await page.evaluate(()=>setMode('scale'));await page.locator('#scale-select').selectOption('1');await page.evaluate(()=>setMode('chord'));background(await record(page,info,'06-g-dorian',errors),7,[0,2,3,5,7,9,10]);
  await page.locator('#oct-up').click();const up=await record(page,info,'07-octave-up',errors);expect(up.octave).toBe(1);background(up,7,[0,2,3,5,7,9,10]);
  await page.evaluate(()=>toggleCFixed(true));background(await record(page,info,'08-c-fixed',errors));
  for(const suffix of ['on','off']){await page.locator('#btn-show-all-positions').click();background(await record(page,info,'09-all-'+suffix,errors));}
  for(const suffix of ['off','on']){await page.evaluate(()=>toggleParentScales());background(await record(page,info,'10-panel-'+suffix,errors));}
  await page.evaluate(()=>toggleCFixed(false));background(await record(page,info,'11-follow-restored',errors),7,[0,2,3,5,7,9,10]);
  let n=0;for(const mode of ['scale','chord','input','chord']){await page.evaluate(m=>setMode(m),mode);const s=await record(page,info,'12-mode-'+(++n)+'-'+mode,errors);if(mode==='chord')background(s,7,[0,2,3,5,7,9,10]);}
});
