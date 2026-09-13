import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chordUpperDisplayStates } = require('../../push-web-control.js');
const touched = ['AppState','TastyState','StockState','isGuitarEngineActive','localStorage'];
afterEach(() => { for (const key of touched) delete globalThis[key]; globalThis.padWebPushControlState.tensionMode = false; });
describe('Push default Chord active-color projection', () => {
  it('matches Standalone upper active states without coloring Root/Quality/Scale', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.TastyState = { enabled: true };
    globalThis.StockState = { enabled: false };
    globalThis.isGuitarEngineActive = () => true;
    globalThis.localStorage = { getItem: () => JSON.stringify({ key: true }) };
    globalThis.padWebPushControlState.tensionMode = true;
    expect(chordUpperDisplayStates()).toEqual([false,true,false,true,false,true,true,false]);
  });
  it('returns null outside Chord mode', () => {
    globalThis.AppState = { mode: 'scale' };
    expect(chordUpperDisplayStates()).toBeNull();
  });
  it('renderer consumes the dedicated state projection and keeps selected color', () => {
    const source = fs.readFileSync('push-display-webusb-app.js','utf8');
    expect(source).toContain("window.padWebGetPushChordUpperDisplayStates?.()");
    expect(source).toContain("states && states[i] === true ? '#ffdb5c' : '#84c4d2'");
  });
});
