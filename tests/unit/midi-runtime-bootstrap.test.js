import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const midiPath = path.resolve(here, '../../midi.js');
const source = fs.readFileSync(midiPath, 'utf8');
const indexPath = path.resolve(here, '../../index.html');
const index = fs.readFileSync(indexPath, 'utf8');
const assetVersion = index.match(/midi-input-state\.js\?v=([0-9.]+)/)?.[1];
const midiInputStatePath = path.resolve(here, '../../midi-input-state.js');
const midiInputStateSource = fs.readFileSync(midiInputStatePath, 'utf8');

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

  it('precaches the parser-loaded master tail in its runtime dependency order', () => {
    const swPath = path.resolve(here, '../../sw.js');
    const sw = fs.readFileSync(swPath, 'utf8');
    const runtimeMasterTail = index.indexOf("'master-tail.js'");
    const audio = sw.indexOf('audio-core/audio.js?v=' + assetVersion);
    const masterTail = sw.indexOf('master-tail.js?v=' + assetVersion);
    const audioUi = sw.indexOf('audio-ui-binding.js?v=' + assetVersion);

    expect(runtimeMasterTail).toBeGreaterThanOrEqual(0);
    expect(masterTail).toBeGreaterThan(audio);
    expect(masterTail).toBeLessThan(audioUi);
  });

  it('loads parser-time observed dependencies at the current precached asset version', () => {
    const writes = [];
    const runtimeWindow = {};
    vm.runInNewContext(midiInputStateSource, {
      window: runtimeWindow,
      document: {
        readyState: 'loading',
        currentScript: { src: 'https://example.test/midi-input-state.js?v=' + assetVersion },
        write: (html) => writes.push(html),
      },
      Set,
      Map,
      Array,
      Object,
      String,
      Number,
    });

    expect(writes).toEqual([
      '<script src="pad-core/observed-structure.js?v=' + assetVersion + '"></script>',
      '<script src="observed-ust-consumer.js?v=' + assetVersion + '"></script>',
    ]);
  });

  it('loads the standalone ownership fallback at the current precached asset version', () => {
    const writes = [];
    vm.runInNewContext(source.slice(0, source.indexOf('const midiActiveNotes')), {
      document: {
        readyState: 'loading',
        currentScript: { src: 'https://example.test/midi.js?v=' + assetVersion },
        write: (html) => writes.push(html),
      },
    });

    expect(writes).toEqual([
      '<script src="midi-input-state.js?v=' + assetVersion + '"></script>',
    ]);
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
