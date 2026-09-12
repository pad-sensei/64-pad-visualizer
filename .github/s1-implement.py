#!/usr/bin/env python3
"""Execution-only generator. Product checkout must be the accepted 3a head."""
from pathlib import Path
import re, sys
root = Path(sys.argv[1])
payload = Path(__file__).resolve().parent

def replace(file, old, new, count=1):
    p = root / file
    text = p.read_text()
    assert text.count(old) == count, (file, old[:100], text.count(old), count)
    p.write_text(text.replace(old, new))

# Only a navigation index is retained; theory, BuilderState and selection remain canonical.
replace('push-web-control.js', '    entryQualityIndex: 0,', '    entryQualityIndex: 0,\n    chordLowerLayerIndex: 0,')
helpers = r'''  // S1: same layer vocabulary as Standalone. Chord generation stays in pad-core.
  function chordLowerLayers() {
    var app = runtime.AppState, scales = runtime.SCALES;
    if (!app || !scales || typeof global.getDiatonicTetrads !== 'function') return [];
    var count = app.diatonicMode === 'triad' ? 3 : 4;
    var layers = [], seen = Object.create(null);
    function add(label, scaleIndex, key) {
      var scale = scales[scaleIndex], signature = label + ':' + scaleIndex + ':' + key;
      if (!scale || !scale.pcs || scale.pcs.length !== 7 || seen[signature]) return;
      seen[signature] = true;
      layers.push({ label: label, items: global.getDiatonicTetrads(scale.pcs, key, count).map(function(chord, degree) {
        return { tetrad: chord, degreeIdx: degree, label: chord.chordName || String(degree + 1), isSecDom: false };
      }) });
    }
    add('Diatonic', app.scaleIdx, app.key);
    if (app.scaleIdx === 0) {
      var relative = wrap(app.key + 9, 12);
      add('Relative', 5, relative);
      add('Harmonic Minor', 7, relative);
      add('Melodic Minor', 14, relative);
      add('Parallel', 5, app.key);
    } else if ([5, 7, 14].indexOf(app.scaleIdx) !== -1) {
      add('Natural Minor', 5, app.key);
      add('Harmonic Minor', 7, app.key);
      add('Melodic Minor', 14, app.key);
      add('Parallel', 0, app.key);
    } else {
      add('Parallel', 5, app.key);
    }
    var scale = scales[app.scaleIdx];
    var dominant = qualityList().filter(function(q) { return q.name === '7'; })[0];
    if (dominant && scale && scale.pcs && scale.pcs.length === 7) {
      var tones = new Set(scale.pcs.map(function(pc) { return wrap(pc + app.key, 12); }));
      layers.push({ label: 'Secondary', items: global.getDiatonicTetrads(scale.pcs, app.key, count).map(function(chord, degree) {
        var root = wrap(chord.rootPC + 7, 12);
        if (degree === 0 || !tones.has(root)) return null;
        var name = String(root);
        var spellings = typeof KEY_SPELLINGS !== 'undefined' ? KEY_SPELLINGS : global.KEY_SPELLINGS;
        var sharpNames = typeof NOTE_NAMES_SHARP !== 'undefined' ? NOTE_NAMES_SHARP : global.NOTE_NAMES_SHARP;
        var parent = typeof global.padGetParentMajorKey === 'function' ? global.padGetParentMajorKey(0, app.key) : 0;
        if (spellings && spellings[parent]) name = spellings[parent][root];
        else if (sharpNames) name = sharpNames[root] || name;
        name += '7';
        return { tetrad: { rootPC: root, pcs: dominant.pcs, quality: dominant, chordName: name, degree: 'V7/' + (degree + 1) },
          degreeIdx: degree, label: name, isSecDom: true,
          targetIsMajor: !(chord.quality && String(chord.quality.name || '').indexOf('m') === 0) };
      }) });
    }
    return layers;
  }

  function activeChordLowerLayer() {
    var layers = chordLowerLayers();
    var index = wrap(controlState.chordLowerLayerIndex || 0, Math.max(1, layers.length));
    return layers[index] || { label: 'Diatonic', items: [] };
  }

  function chordLowerItemSelected(item) {
    var builder = runtime.BuilderState;
    return !!(item && builder && item.tetrad.rootPC === builder.root
      && builder.quality && item.tetrad.quality && builder.quality.name === item.tetrad.quality.name
      && !builder.tension && (builder.bass === null || builder.bass === undefined));
  }

  function chordLowerRow() {
    if (global.IS_DESKTOP_MODE || currentMode() !== 'chord' || controlState.entryStep || controlState.setupActive) return null;
    var layer = activeChordLowerLayer();
    var labels = [layer.label], states = [true];
    for (var i = 0; i < 7; i++) {
      var item = layer.items[i];
      labels.push(item ? item.label : '');
      states.push(item ? chordLowerItemSelected(item) : null);
    }
    return { labels: labels, states: states };
  }

  function selectChordLower(index) {
    if (index === 0) {
      var layers = chordLowerLayers();
      if (layers.length) controlState.chordLowerLayerIndex = wrap((controlState.chordLowerLayerIndex || 0) + 1, layers.length);
      refresh();
      return true;
    }
    var item = activeChordLowerLayer().items[index - 1];
    if (!item || typeof global.onDiatonicClick !== 'function' || !runtime.BuilderState) return true;
    // onDiatonicClick deliberately preserves the incoming Secondary flag.
    // Explicitly clear it for a subsequent ordinary degree (not a new music rule).
    runtime.BuilderState._fromSecDom = !!item.isSecDom;
    runtime.BuilderState._secDomTargetIsMajor = item.isSecDom ? item.targetIsMajor : undefined;
    if (item.isSecDom) {
      runtime.AppState.psSortMode = 'practical';
      runtime.AppState.showParentScales = true;
    }
    global.onDiatonicClick(item.tetrad, item.degreeIdx);
    if (item.isSecDom) runtime.BuilderState._fromDiatonic = false;
    refresh();
    return true;
  }

'''
replace('push-web-control.js', '  function lowerSwitch(index) {', helpers + '  function lowerSwitch(index) {\n    if (currentMode() === \'chord\') return selectChordLower(index);')
replace('push-web-control.js', '    if (performBankContext()) return [false, false, false, false, false, false, null, null];', '    if (performBankContext()) return [false, false, false, false, false, false, null, null];\n    var chordRow = chordLowerRow();\n    if (chordRow) return chordRow.states;')
replace('push-web-control.js', '  global.padWebPushControlState = controlState;', '  global.padWebPushControlState = controlState;\n  global.padWebGetPushChordLowerRow = chordLowerRow;')
replace('midi.js', '    tensions: tensions,\n', '    tensions: tensions,\n    chordLowerRow: typeof window.padWebGetPushChordLowerRow === \'function\' ? window.padWebGetPushChordLowerRow() : null,\n')
replace('push-display-webusb-app.js', '    function drawControlRow(labels, y) {', '    function drawControlRow(labels, y, states) {')
replace('push-display-webusb-app.js', "        drawPixelText(label, 12 + i * 120, y, 1, '#84c4d2', 18);", "        const color = states && states[i] === true ? '#ffdb5c' : '#84c4d2';\n        drawPixelText(label, 12 + i * 120, y, 1, color, 18);")
replace('push-display-webusb-app.js', "      const lower = ['Link', 'Guitar TAB', 'Bass TAB', 'Piano', 'Relative', 'Parallel', 'Secondary', 'Available'];", "      const chordRow = snap.mode === 'chord' ? snap.chordLowerRow : null;\n      const lower = chordRow ? chordRow.labels : ['Link', 'Guitar TAB', 'Bass TAB', 'Piano', 'Relative', 'Parallel', 'Secondary', 'Available'];")
replace('push-display-webusb-app.js', '      drawControlRow(lower, 148);', '      drawControlRow(lower, 148, chordRow && chordRow.states);')

# Changed assets receive identities in both index and precache. Existing debt is untouched.
versions = {
 'push-web-control.js?v=1.8.0-parity2': 'push-web-control.js?v=1.8.0-chord-lower-s1',
 'midi.js?v=1.8.0-parity2': 'midi.js?v=1.8.0-chord-lower-s1',
 'push-display-webusb-app.js?v=webusb-20260912-11': 'push-display-webusb-app.js?v=webusb-20260912-s1',
}
for file in ['index.html', 'sw.js']:
    for old, new in versions.items(): replace(file, old, new)
old_cache = '64pad-v180-preview-20260912-semitone-delta-6'
new_cache = '64pad-v180-preview-20260912-chord-lower-s1'
replace('sw.js', old_cache, new_cache)
changed_expected = []
for p in (root/'tests/unit').glob('*.test.js'):
    text=p.read_text()
    if old_cache in text:
        p.write_text(text.replace(old_cache,new_cache)); changed_expected.append(str(p.relative_to(root)))
assert len(changed_expected)==1, changed_expected
for name, target in [('s1-lower.test.js','tests/unit/push-chord-lower.test.js'), ('s1-lower.spec.js','tests/e2e/push-chord-lower.spec.js')]:
    (root/target).write_text((payload/name).read_text())
(root/'docs/PUSH_CHORD_LOWER_S1.md').write_text('''# Push Chord lower row — S1\n\nScope: manual parity A01–A03 only. The first lower button cycles Diatonic,\nRelative/minor variants, Parallel and Secondary layers in the existing\nStandalone order. Buttons 2–8 call the existing diatonic selection path.\nTheory remains in pad-core; no dependency pointer or native audio change.\nThe displayed lower row and its LED states derive from the same layer and\ncurrent BuilderState. Root/Quality entry and Setup retain input priority.\n\nReferences: manual Push display chapter at abac1b18303c2a5268a161e0c26aaaba62a1d82f;\nStandalone PluginEditor.cpp at 9ebe324a4eb4d7652c20cb04d2a0b7c8624f42a1,\n_pushChordLowerLayers and _pushToggleLowerSwitch. A non-seven-tone scale\nretains the native Parallel layer; minor variants keep the native labels\nand order. This is not a new theory or controller-wide parity specification.\n\nTwo explicit edge corrections relative to the native reference: a slash\nbass of C (0) is not absent; a normal degree selected after Secondary\nclears the old Secondary provenance before onDiatonicClick, whose contract\notherwise preserves it. No persisted settings schema is introduced.\n\nTests: push-chord-lower.test.js uses real classic scripts, core theory,\nraw CC mapping, BuilderState, MIDI display snapshot and LED output.\npush-chord-lower.spec.js exercises the real browser/DOM/canvas path with\nMIDI and USB transport boundaries simulated; it is not physical USB,\nnative/Windows, listening, or full manual acceptance. Existing 18-case\nStandalone parity coverage is retained. Independent audit and new physical\nacceptance are separate from these machine checks.\n\nNo other mode, pedal, native plugin, release, production deployment,\nmanual source or existing accepted semitone/Perform behavior is changed.\n''')
print('S1 generator applied; cache expectation:', changed_expected)
