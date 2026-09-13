from pathlib import Path

p = Path('push-web-control.js')
s = p.read_text()
anchor = "  global.padWebGetPushChordEntryDisplay = chordEntryDisplay;\n  global.padWebGetPushChordLowerRow = chordLowerRow;"
insert = """  function chordUpperDisplayStates() {
    if (currentMode() !== 'chord') return null;
    return [
      false,
      !!(runtime.TastyState && runtime.TastyState.enabled),
      !!(runtime.StockState && runtime.StockState.enabled),
      !!call('isGuitarEngineActive'),
      false,
      !!controlState.tensionMode,
      keySectionVisible(),
      false,
    ];
  }

  global.padWebGetPushChordEntryDisplay = chordEntryDisplay;
  global.padWebGetPushChordLowerRow = chordLowerRow;
  global.padWebGetPushChordUpperDisplayStates = chordUpperDisplayStates;"""
assert anchor in s
s = s.replace(anchor, insert, 1)
old = "      resetButtonLedState: resetButtonLedState,\n"
new = "      resetButtonLedState: resetButtonLedState,\n      chordUpperDisplayStates: chordUpperDisplayStates,\n"
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('push-display-webusb-app.js')
s = p.read_text()
old = "      drawControlRow(upper, 14, entry ? entry.upper.states : null);"
new = "      const upperStates = entry ? entry.upper.states : (snap.mode === 'chord' ? window.padWebGetPushChordUpperDisplayStates?.() : null);\n      drawControlRow(upper, 14, upperStates);"
assert old in s
p.write_text(s.replace(old, new, 1))

for name in ['index.html', 'sw.js', 'tests/unit/push-display-exposure.test.js', 'tests/unit/push-web-cc-integration.test.js']:
    p = Path(name)
    s = p.read_text()
    s = s.replace('push-web-control.js?v=1.8.0-entry-a04b', 'push-web-control.js?v=1.8.0-active-color')
    s = s.replace('push-display-webusb-app.js?v=webusb-20260913-a04c', 'push-display-webusb-app.js?v=webusb-20260913-active-color')
    s = s.replace('64pad-v180-preview-20260913-entry-a04c', '64pad-v180-preview-20260913-active-color')
    p.write_text(s)

Path('tests/unit/push-display-active-color.test.js').write_text("""import { afterEach, describe, expect, it } from 'vitest';
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
""")
