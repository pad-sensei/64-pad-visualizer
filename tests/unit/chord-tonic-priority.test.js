import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { dm7 } from './helpers/chord-render-fixture.mjs';

describe('Dm7 / C Major tonic versus actual one-position chord shape', () => {
  it.each([false, true])('selected C uses the chord role, not background C (C Fixed %s)', fixed => {
    const f = dm7({ fixed });
    expect(f.read('actualNotes')).toEqual([50, 53, 57, 60]);
    expect(f.read('arrangements.length')).toBeGreaterThan(0);
    const selected = new Set(f.read('[...padState.basicFormPadSet]'));
    const cIndices = f.read('Array.from({length:64}, (_,i) => i).filter(i => pitchClass(midiNote(Math.floor(i/8),i%8)) === 0)');
    const selectedC = cIndices.filter(i => selected.has(i));
    expect(selected.size).toBe(4);
    expect(selectedC).toHaveLength(1);
    selectedC.forEach(i => {
      expect(f.pads[i].getAttribute('fill')).toBe('var(--pad-basic-chord)');
      expect(f.read(`padState.launchpadPadColors[${i}]`)).toBe(13);
    });
    // The tonic is a chord tone even outside the selected shape; other duplicates stay background.
    const outsideC = cIndices.filter(i => !selected.has(i));
    expect(outsideC.length).toBeGreaterThan(0);
    outsideC.forEach(i => {
      expect(f.pads[i].getAttribute('fill')).toBe('var(--pad-basic-chord)');
      expect(f.read(`padState.launchpadPadColors[${i}]`)).toBe(13);
    });
  });
  it('all-positions gives every C the chord role while the chord remains Dm7', () => {
    const f = dm7({ all: true });
    expect(f.read('[...padState.activePCS].sort()')).toEqual([0, 2, 5, 9]);
    const cIndices = f.read('Array.from({length:64}, (_,i) => i).filter(i => pitchClass(midiNote(Math.floor(i/8),i%8)) === 0)');
    cIndices.forEach(i => {
      expect(f.pads[i].getAttribute('fill')).toBe('var(--pad-basic-chord)');
      expect(f.read(`padState.launchpadPadColors[${i}]`)).toBe(13);
    });
  });
  it.each([1, 2, 3])('C chord-tone priority follows the actual inverted one shape (%i)', inversion => {
    const f = dm7({ inversion });
    const selected = new Set(f.read('[...padState.basicFormPadSet]'));
    expect(selected.size).toBe(4);
    const selectedC = f.read('[...padState.basicFormPadSet].filter(i => pitchClass(midiNote(Math.floor(i/8),i%8)) === 0)');
    expect(selectedC).toHaveLength(1);
    selectedC.forEach(i => expect(f.read(`padState.launchpadPadColors[${i}]`)).toBe(13));
  });
});

it.each([1, 2, 3, 2])('half-step chord root %i recalculates C priority without expanding other chord tones', root => {
  const f = dm7({ root });
  const selected = new Set(f.read('[...padState.basicFormPadSet]'));
  expect(selected.size).toBe(4);
  for (let i = 0; i < 64; i++) {
    const pc = f.read(`pitchClass(midiNote(${Math.floor(i / 8)}, ${i % 8}))`);
    if (selected.has(i)) continue;
    if (pc === 0) {
      expect(f.pads[i].getAttribute('fill')).toBe(root === 2 ? 'var(--pad-basic-chord)' : 'var(--pad-root)');
      expect(f.read(`padState.launchpadPadColors[${i}]`)).toBe(root === 2 ? 13 : 45);
    } else if (f.read(`padState.activePCS.has(${pc})`) && f.read(`padState.scaleBgPCS.has(${pc})`)) {
      expect(f.pads[i].getAttribute('fill')).toBe('var(--pad-basic-scale)');
    }
  }
});

it('degree-colour opt-in uses the chord seventh role for C, keeping tonic-only scope', () => {
  const f = dm7({ colorOff: false });
  for (const i of [0, 15, 18, 36, 54, 57])
    expect(f.pads[i].getAttribute('fill')).toBe('var(--pad-guide7)');
  expect(f.pads[2].getAttribute('fill')).toBe('var(--pad-basic-scale)');
});

function webPush(f, index) {
  const source = fs.readFileSync('midi.js', 'utf8');
  const start = source.indexOf('function _padColorToLP(');
  const end = source.indexOf('function _pushPaletteColors64(', start);
  Object.assign(f.c, { _isPush: true, _lpLEDMode: 'full', midiActiveNotes: new Set() });
  vm.runInContext(source.slice(start, end), f.c);
  return vm.runInContext(`_padColorToLP(padState, ${Math.floor(index / 8)}, ${index % 8})`, f.c);
}
it.each([false, true])('Web Push shares the C chord priority with screen and Launchpad (all=%s)', all => {
  const f = dm7({ all });
  for (const i of [0, 15, 18, 36, 54, 57]) expect(webPush(f, i)).toBe(21);
  if (!all) {
    expect(webPush(f, 2)).toBe(122); // D outside selected shape remains background
    expect(webPush(f, 5)).toBe(122); // F
    expect(webPush(f, 12)).toBe(122); // A
  }
});
it('Web Push preserves degree-colour C role and changes it after a half-step', () => {
  expect(webPush(dm7({ colorOff: false }), 0)).toBe(10);
  for (const root of [1, 2, 3, 2]) expect(webPush(dm7({ root }), 0)).toBe(root === 2 ? 21 : 3);
});

it('selected voicing boxes retain the existing outside-shape suppression and Push background', () => {
  const f = dm7();
  vm.runInContext(`VoicingState.lastBoxes = [{ midiNotes: actualNotes, currentAlt: 0, alternatives: [arrangements[0]] }]; VoicingState.selectedBoxIdx = 0;`, f.c);
  f.rerender();
  expect(f.pads[0].getAttribute('opacity')).toBe('0');
  expect(f.read('padState.launchpadPadColors[0]')).toBe(0);
  expect(webPush(f, 0)).toBe(3); // existing Push scale reference; no new chord-tone expansion
});
it('the production chromatic arrow branch updates C priority over repeated left/right steps', () => {
  const f = dm7();
  const main = fs.readFileSync('main.js', 'utf8');
  const start = main.indexOf("  if (key === 'ArrowLeft' || key === 'ArrowRight') {");
  const end = main.indexOf('  // Plain mode shortcuts', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  Object.assign(f.c, { consumeShortcut() {}, updateKeyButtons() {}, updateChordDisplay() {}, render: () => f.rerender() });
  vm.runInContext('function chromaticStep(key) {' + main.slice(start, end) + '}', f.c);
  for (const [key, root] of [['ArrowLeft',1], ['ArrowRight',2], ['ArrowRight',3], ['ArrowLeft',2]]) {
    f.c.chromaticStep(key);
    expect(f.read('BuilderState.root')).toBe(root);
    expect(f.read('[...padState.basicFormPadSet].length')).toBe(4);
    expect(f.pads[0].getAttribute('fill')).toBe(root === 2 ? 'var(--pad-basic-chord)' : 'var(--pad-root)');
    expect(webPush(f, 0)).toBe(root === 2 ? 21 : 3);
  }
});
