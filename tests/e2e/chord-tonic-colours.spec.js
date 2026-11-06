import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { isolateColourPage } from './helpers/isolated-colour-page';

// Actual DOM/render/updateLaunchpadLEDs paths. Only device/audio boundaries are fake.
// This is browser/transport-role evidence, never physical LED or Native Push acceptance.
test.use({ viewport: { width: 1280, height: 900 },
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] } });

async function prepare(page, fixed, key = 0) {
  const errors = await isolateColourPage(page, test.info().project.use.baseURL);
  await page.goto('./?silent=1&e2e=chord-tonic-colours');
  await page.waitForFunction(() => document.querySelectorAll('#pad-grid rect.pad').length === 64 && midiAccess !== null);
  await page.evaluate(async ({ fixed, key }) => {
    // No sounding output is needed for a display test. Keep all rendering/theory real.
    playCurrentChord = () => {};
    playMidiNotes = () => {};
    noteOn = () => {};
    noteOff = () => {};
    setMode('chord');
    Object.assign(AppState, { key, scaleIdx: 0, padCFixed: fixed, colorOff: true,
      showAllPositions: false, octaveShift: 0, semitoneShift: 0, showParentScales: true,
      pushScaleRootColor: 3, pushScaleToneColor: 122,
      launchpadColors: { ...padLaunchpadProgrammer.defaultColors } });
    Object.assign(BuilderState, { root: 2, quality: BUILDER_QUALITIES.flat().find(q => q?.name === 'm7'),
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
    const input = { id: 'colour-lp-in', name: 'Launchpad Pro MK3 MIDI', state: 'connected' };
    const lpOutput = { id: 'colour-lp-out', name: input.name, state: 'connected', open: async () => {},
      send(bytes) {
        const message = Array.from(bytes); capture.lpMessages.push(message);
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
    render();
    document.activeElement?.blur();
  }, { fixed, key });
  return errors;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const svg = document.getElementById('pad-grid');
    const normalize = value => { const style = document.createElement('span').style; style.color = value; return style.color; };
    const css = getComputedStyle(document.documentElement);
    const roles = Object.fromEntries(['pad-basic-chord', 'pad-basic-scale', 'pad-root', 'pad-off']
      .map(role => [role, normalize(css.getPropertyValue('--' + role).trim())]));
    return {
      root: BuilderState.root, chordLabel: document.getElementById('chord-name').textContent, key: AppState.key, fixed: AppState.padCFixed, all: AppState.showAllPositions,
      overlay: [...(_lastLEDState.overlayPCS || [])].sort((a,b) => a-b),
      backgroundRoot: _lastLEDState.scaleBgRootPC, background: [..._lastLEDState.scaleBgPCS].sort((a,b) => a-b),
      shape: [...(_lastLEDState.basicFormPadSet || [])].sort((a,b) => a-b), notes: getCurrentChordMidiNotes(),
      position: VoicingState.basicPosIdx, count: basicFormArrangements().length,
      lpMessages: window.__colourCapture.lpMessages.length, pushMessages: window.__colourCapture.pushMessages.length,
      roles,
      messages: { launchpad: window.__colourCapture.lpMessages, push: window.__colourCapture.pushMessages },
      pads: [...svg.querySelectorAll('rect.pad')].map((pad, index) => {
        const box = pad.getBoundingClientRect();
        return { index, midi: midiNote(Math.floor(index / 8), index % 8), fill: pad.getAttribute('fill'),
          computedFill: normalize(getComputedStyle(pad).fill), opacity: pad.getAttribute('opacity'),
          bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
          lp: window.__colourCapture.lp[index], push: window.__colourCapture.push[index] };
      }),
    };
  });
}

function assertSurface(state, root, all = false) {
  expect(state.root).toBe(root); expect(state.all).toBe(all);
  if (root === 2) expect(state.chordLabel).toBe('Dm7');
  expect(state.backgroundRoot).toBe(0);
  expect(state.background).toEqual([0, 2, 4, 5, 7, 9, 11]);
  // Auto Available Scale is D Dorian for Dm7 in C Major. Keep it independently asserted.
  if (root === 2) expect(state.overlay).toEqual([0, 2, 4, 5, 7, 9, 11]);
  expect(state.pads).toHaveLength(64);
  expect(state.lpMessages).toBeGreaterThan(0); expect(state.pushMessages).toBeGreaterThan(0);
  if (!all) {
    expect(state.shape).toHaveLength(4);
    expect(state.shape.map(i => state.pads[i].midi).sort((a,b) => a-b)).toEqual(state.notes);
  }
  const chord = [0, 3, 7, 10].map(iv => (root + iv) % 12);
  for (const pad of state.pads) {
    const pc = pad.midi % 12;
    const chordRole = (all ? chord.includes(pc) : state.shape.includes(pad.index)) || (pc === 0 && chord.includes(0));
    const scaleRole = [0, 2, 4, 5, 7, 9, 11].includes(pc);
    const role = chordRole ? 'pad-basic-chord' : scaleRole ? (pc === 0 ? 'pad-root' : 'pad-basic-scale') : 'pad-off';
    expect(pad.fill, `screen pad ${pad.index}`).toBe(`var(--${role})`);
    expect(pad.computedFill, `resolved CSS pad ${pad.index}`).toBe(state.roles[role]);
    expect(pad.lp, `Launchpad message pad ${pad.index}`).toBe(chordRole ? 13 : scaleRole ? (pc === 0 ? 45 : 2) : 0);
    // Push overview retains non-tonic chord-degree roles; its palette differs from Launchpad.
    let push = chordRole ? 21 : scaleRole ? (pc === 0 ? 3 : 122) : 0;
    if (all && pc !== 0 && chord.includes(pc))
      push = pc === root ? 3 : pc === (root + 3) % 12 ? 26 : pc === (root + 10) % 12 ? 10 : 18;
    // Existing Push overview distinguishes non-chord Available Scale overlay (121)
    // from the plain scale fallback (122). Chord roles, including tonic C, win.
    if (all && !chord.includes(pc) && state.overlay.includes(pc)) push = 121;
    expect(pad.push, `Push message pad ${pad.index}`).toBe(push);
    expect(pad.bounds.width).toBeGreaterThan(0); expect(pad.bounds.height).toBeGreaterThan(0);
    expect(pad.opacity).not.toBe('0');
  }
}

async function record(page, info, name, state, errors) {
  // The line reporter does not materialize inline attachment bodies in --output.
  const json = info.outputPath(name + '.json');
  await writeFile(json, JSON.stringify({ state, errors }, null, 2));
  await info.attach(name + '.json', { path: json, contentType: 'application/json' });
  const file = info.outputPath(name + '.png');
  await page.locator('#pad-grid').screenshot({ path: file });
  await info.attach(name, { path: file, contentType: 'image/png' });
  expect(errors.page).toEqual([]);
  expect(errors.network).toEqual([]);
  expect(errors.http).toEqual([]);
  const unexpectedConsole = errors.console.filter(entry => {
    if (entry.message.includes('ERR_BLOCKED_BY_CLIENT') && errors.blockedExternal.length) return false;
    return !entry.url || entry.url.startsWith(errors.origin + '/');
  });
  expect(unexpectedConsole).toEqual([]);
}

for (const fixed of [false, true]) {
  test(`Dm7 C tone, selected shape and chromatic return (C Fixed ${fixed})`, async ({ page }, info) => {
    const errors = await prepare(page, fixed);
    const initial = await snapshot(page);
    await record(page, info, 'dm7-initial', initial, errors);
    assertSurface(initial, 2); expect(initial.notes).toEqual([50, 53, 57, 60]);
    for (const [key, root] of [['ArrowLeft', 1], ['ArrowRight', 2], ['ArrowRight', 3], ['ArrowLeft', 2]]) {
      await page.keyboard.press(key);
      const state = await snapshot(page);
      await record(page, info, `${key}-${root}`, state, errors);
      assertSurface(state, root);
    }
    const returned = await snapshot(page);
    expect(returned.shape).toEqual(initial.shape); expect(returned.notes).toEqual(initial.notes);
    if (returned.count > 1) {
      await page.keyboard.press('Space');
      const cycled = await snapshot(page);
      await record(page, info, 'dm7-cycled-shape', cycled, errors);
      assertSurface(cycled, 2);
      expect(cycled.position).toBe((returned.position + 1) % returned.count);
      expect(cycled.shape).not.toEqual(returned.shape); expect(cycled.notes).toEqual(returned.notes);
    }
    await page.locator('#btn-show-all-positions').click();
    const overview = await snapshot(page);
    await record(page, info, 'dm7-all-positions', overview, errors);
    assertSurface(overview, 2, true);
    await page.locator('#btn-show-all-positions').click();
    const one = await snapshot(page);
    await record(page, info, 'dm7-one-position-restored', one, errors);
    assertSurface(one, 2);
    expect(one.shape).toEqual(initial.shape);
  });
}

test('C Fixed stays C Major over a G key and auto Available Scale', async ({ page }, info) => {
  const errors = await prepare(page, true, 7);
  const state = await snapshot(page);
  await record(page, info, 'fixed-C-over-key-G', state, errors);
  assertSurface(state, 2); expect(state.key).toBe(7);
});
