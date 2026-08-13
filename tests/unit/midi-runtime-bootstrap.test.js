import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const midiPath = path.resolve(here, '../../midi.js');
const source = fs.readFileSync(midiPath, 'utf8');
const indexPath = path.resolve(here, '../../index.html');
const index = fs.readFileSync(indexPath, 'utf8');
const assetVersion = index.match(/midi-input-state\.js\?v=([0-9.]+)/)?.[1];

describe('browser MIDI ownership bootstrap', () => {
  it('loads the ownership helper before the MIDI runtime in the app shell', () => {
    const helper = index.indexOf('midi-input-state.js?v=' + assetVersion);
    const midi = index.indexOf('midi.js?v=' + assetVersion);

    expect(assetVersion).toBeTruthy();
    expect(helper).toBeGreaterThanOrEqual(0);
    expect(midi).toBeGreaterThanOrEqual(0);
    expect(helper).toBeLessThan(midi);
  });

  it('precaches observed payload dependencies before the MIDI bootstrap', () => {
    const swPath = path.resolve(here, '../../sw.js');
    const sw = fs.readFileSync(swPath, 'utf8');
    const observedCore = sw.indexOf('pad-core/observed-structure.js?v=' + assetVersion);
    const consumer = sw.indexOf('observed-ust-consumer.js?v=' + assetVersion);
    const helper = sw.indexOf('midi-input-state.js?v=' + assetVersion);
    const midi = sw.indexOf('midi.js?v=' + assetVersion);

    expect(sw).toContain("var CACHE_NAME = '64pad-v" + assetVersion + "'");
    expect(observedCore).toBeGreaterThanOrEqual(0);
    expect(consumer).toBeGreaterThan(observedCore);
    expect(helper).toBeGreaterThan(consumer);
    expect(midi).toBeGreaterThan(helper);
  });

  it('loads the source-ownership helper before constructing held state', () => {
    const bootstrap = source.indexOf('midi-input-state.js');
    const heldState = source.indexOf('const midiHeldState');
    const bindingState = source.indexOf('const midiPortBindings');

    expect(bootstrap).toBeGreaterThanOrEqual(0);
    expect(heldState).toBeGreaterThan(bootstrap);
    expect(bindingState).toBeGreaterThan(bootstrap);
  });

  it('keeps theory decisions outside the source-ownership helper', () => {
    const helperPath = path.resolve(here, '../../midi-input-state.js');
    const helper = fs.readFileSync(helperPath, 'utf8');

    expect(helper).not.toMatch(/padDetectChord|DETECTED_UST|PAD_QUALITY|TENSION_ROWS|SCALE_AVAIL/);
  });
});
