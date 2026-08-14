import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const midiPath = path.resolve(here, '../../midi.js');
const source = fs.readFileSync(midiPath, 'utf8');
const indexPath = path.resolve(here, '../../index.html');
const index = fs.readFileSync(indexPath, 'utf8');

describe('browser MIDI ownership bootstrap', () => {
  it('loads the ownership helper before the MIDI runtime in the app shell', () => {
    const helper = index.indexOf('midi-input-state.js?v=6.7.52');
    const midi = index.indexOf('midi.js?v=6.7.52');

    expect(helper).toBeGreaterThanOrEqual(0);
    expect(midi).toBeGreaterThanOrEqual(0);
    expect(helper).toBeLessThan(midi);
  });

  it('precaches observed payload dependencies before the MIDI bootstrap', () => {
    const swPath = path.resolve(here, '../../sw.js');
    const sw = fs.readFileSync(swPath, 'utf8');
    const observedCore = sw.indexOf('pad-core/observed-structure.js?v=6.7.52');
    const consumer = sw.indexOf('observed-ust-consumer.js?v=6.7.52');
    const helper = sw.indexOf('midi-input-state.js?v=6.7.52');
    const midi = sw.indexOf('midi.js?v=6.7.52');

    expect(observedCore).toBeGreaterThanOrEqual(0);
    expect(consumer).toBeGreaterThan(observedCore);
    expect(helper).toBeGreaterThan(consumer);
    expect(midi).toBeGreaterThan(helper);
  });

  it('precaches the parser-time master tail at the app-shell cache version', () => {
    const version = index.match(/midi-input-state\.js\?v=([\d.]+)/)?.[1];
    const dynamicMasterTail = index.indexOf("'master-tail.js'");
    const dynamicAudioBinding = index.indexOf("'audio-ui-binding.js'");
    const swPath = path.resolve(here, '../../sw.js');
    const sw = fs.readFileSync(swPath, 'utf8');
    const precachedMasterTail = sw.indexOf(`'master-tail.js?v=${version}'`);
    const precachedAudioBinding = sw.indexOf(`'audio-ui-binding.js?v=${version}'`);

    expect(version).toBeTruthy();
    expect(dynamicMasterTail).toBeGreaterThanOrEqual(0);
    expect(dynamicAudioBinding).toBeGreaterThan(dynamicMasterTail);
    expect(precachedMasterTail).toBeGreaterThanOrEqual(0);
    expect(precachedAudioBinding).toBeGreaterThan(precachedMasterTail);
  });

  it('loads parser-time observed dependencies from the same cache version', () => {
    const helperPath = path.resolve(here, '../../midi-input-state.js');
    const helper = fs.readFileSync(helperPath, 'utf8');
    const swPath = path.resolve(here, '../../sw.js');
    const sw = fs.readFileSync(swPath, 'utf8');

    for (const asset of [
      'pad-core/observed-structure.js?v=6.7.52',
      'observed-ust-consumer.js?v=6.7.52',
    ]) {
      expect(helper).toContain(asset);
      expect(sw).toContain(`'${asset}'`);
    }
  });

  it('inherits the app-shell cache version for the parser-time ownership fallback', () => {
    const helperVersion = index.match(/midi-input-state\.js\?v=([\d.]+)/)?.[1];
    const swPath = path.resolve(here, '../../sw.js');
    const sw = fs.readFileSync(swPath, 'utf8');

    expect(helperVersion).toBeTruthy();
    expect(sw).toContain(`'midi-input-state.js?v=${helperVersion}'`);
    expect(source).toContain('document.currentScript');
    expect(source).not.toMatch(/midi-input-state\.js\?v=\d/);
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
