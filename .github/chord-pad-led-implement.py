#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1])

def repl(path, old, new, count=1):
    p=root/path; s=p.read_text(); actual=s.count(old)
    assert actual==count,(path,actual,old[:80])
    p.write_text(s.replace(old,new))

old_led="""  // Launchpad/PUSH LED update: always show current scale only
  // (urinami 2026-04-14: PUSH は楽器なので scale のみ、chord/tasty/builder は出さない).
  // C-fixed mode はさらに C Major に固定する。
  if (typeof updateLaunchpadLEDs === 'function') {
    var ledState = (typeof padApplyScaleOnlyOverride === 'function')
      ? padApplyScaleOnlyOverride(state, AppState.key, AppState.scaleIdx, AppState.padCFixed === true)
      : state;
    updateLaunchpadLEDs(ledState);
  }
"""
new_led="""  // Push/Launchpad receives the same padState the screen just rendered.
  // Scale mode remains scale-only naturally. Chord mode now preserves the
  // selected/basic voicing positions over the educational scale background,
  // matching Standalone and the current owner ruling (2026-09-13).
  if (typeof updateLaunchpadLEDs === 'function') updateLaunchpadLEDs(padState);
"""
repl('render.js',old_led,new_led)

marker="""  var activePCS = state.activePCS;
  var bassPC = state.bassPC;
"""
insert="""  var activePCS = state.activePCS;
  var bassPC = state.bassPC;

  // Chord position overlay: mirror the exact shape shown on the screen instead
  // of expanding chord pitch classes across all duplicate pads. This follows
  // Standalone's Stock/Tasty/Guitar/selected-box/basic-form priority.
  var chordPadIdxs = null;
  if (_isPush && AppState.mode === 'chord' && AppState.showAllPositions !== true) {
    chordPadIdxs = new Set();
    function addPositions(positions) {
      if (!positions || !positions.length) return false;
      positions.forEach(function(p) { chordPadIdxs.add(p.row * COLS + p.col); });
      return chordPadIdxs.size > 0;
    }
    if (typeof StockState !== 'undefined' && StockState.enabled
        && StockState.currentIndex >= 0 && addPositions(StockState.padPositions)) {
    } else if (typeof TastyState !== 'undefined' && TastyState.enabled
        && TastyState.currentIndex >= 0 && addPositions(TastyState.padPositions)) {
    } else if (typeof isGuitarEngineActive === 'function' && isGuitarEngineActive()
        && typeof _instrumentPadSet !== 'undefined' && _instrumentPadSet && _instrumentPadSet.size) {
      _instrumentPadSet.forEach(function(idx) { chordPadIdxs.add(idx); });
    } else if (typeof VoicingState !== 'undefined' && VoicingState.lastBoxes
        && VoicingState.selectedBoxIdx !== null
        && VoicingState.lastBoxes[VoicingState.selectedBoxIdx]) {
      var selectedBox = VoicingState.lastBoxes[VoicingState.selectedBoxIdx];
      var selectedAlt = selectedBox.alternatives && selectedBox.alternatives[selectedBox.currentAlt];
      if (selectedAlt && selectedAlt.positions) addPositions(selectedAlt.positions);
    } else if (state.basicFormPadSet && state.basicFormPadSet.size) {
      state.basicFormPadSet.forEach(function(idx) { chordPadIdxs.add(idx); });
    }
    if (chordPadIdxs.size === 0) chordPadIdxs = null;
  }
"""
repl('midi.js',marker,insert)

old_return="""  if (AppState.mode === 'scale' || (_isPush && cFixed)) {
    if (pc === scaleRoot) return AppState.pushScaleRootColor || 3;
    if (scalePCS.has(pc)) return AppState.pushScaleToneColor || 122;
    return 0;
  }
  if (isRoot && isActive) return AppState.pushScaleRootColor || 3;
  if (isBass) return AppState.pushScaleRootColor || 3;
  if (isGuide3) return 26;                // Push: hot pink — guide tone 3rd
  if (isGuide7) return 10;                // Push: bright green — guide tone 7th
  if (isAvoid) return 25;                 // Push: pink-red — avoid note
  if (isTension) return 16;               // Push: cyan — tension
  if (isActive) return 18;                // Push: sky blue — chord tone
  if (overlayPCS && overlayPCS.has(pc)) return 121; // Push: dim white — selected scale overlay
  return 0;                                // Off
"""
new_return="""  if (AppState.mode === 'scale') {
    if (pc === scaleRoot) return AppState.pushScaleRootColor || 3;
    if (scalePCS.has(pc)) return AppState.pushScaleToneColor || 122;
    return 0;
  }

  if (_isPush && AppState.mode === 'chord' && chordPadIdxs) {
    if (chordPadIdxs.has(row * COLS + col)) return 21;
    if (pc === scaleRoot) return AppState.pushScaleRootColor || 3;
    if (scalePCS.has(pc)) return AppState.pushScaleToneColor || 122;
    return 0;
  }

  var chordColor = 0;
  if (isRoot && isActive) chordColor = AppState.pushScaleRootColor || 3;
  else if (isBass) chordColor = AppState.pushScaleRootColor || 3;
  else if (isGuide3) chordColor = 26;
  else if (isGuide7) chordColor = 10;
  else if (isAvoid) chordColor = 25;
  else if (isTension) chordColor = 16;
  else if (isActive) chordColor = 18;
  else if (overlayPCS && overlayPCS.has(pc)) chordColor = 121;
  if (chordColor) return chordColor;

  if (_isPush && AppState.mode === 'chord' && AppState.showAllPositions === true) {
    if (pc === scaleRoot) return AppState.pushScaleRootColor || 3;
    if (scalePCS.has(pc)) return AppState.pushScaleToneColor || 122;
  }
  return 0;
"""
repl('midi.js',old_return,new_return)

# App-level script identity only; do not rewrite pad-core/render.js.
repl('index.html','<script src="render.js?v=6.7.52"></script>','<script src="render.js?v=1.8.0-chord-pad-led"></script>')
repl('index.html','<script src="midi.js?v=1.8.0-chord-lower-s1"></script>','<script src="midi.js?v=1.8.0-chord-pad-led"></script>')
repl('sw.js',"'render.js?v=6.7.52'","'render.js?v=1.8.0-chord-pad-led'")
repl('sw.js',"'midi.js?v=1.8.0-chord-lower-s1'","'midi.js?v=1.8.0-chord-pad-led'")
versions={
 'render.js?v=6.7.52':'render.js?v=1.8.0-chord-pad-led',
 'midi.js?v=1.8.0-chord-lower-s1':'midi.js?v=1.8.0-chord-pad-led',
}
for p in (root/'tests/unit').glob('*.test.js'):
    s=p.read_text(); changed=False
    for old,new in versions.items():
        if old in s: s=s.replace(old,new); changed=True
    if changed: p.write_text(s)

(root/'tests/unit/push-chord-pad-led.test.js').write_text((Path(__file__).parent/'chord-pad-led.test.js').read_text())
(root/'docs/PUSH_CHORD_PAD_LED_2026-09-13.md').write_text('''# Push Chord pad LED parity — 2026-09-13\n\nOwner observation after S1 acceptance: Chord-mode lower controls are correct,\nbut a built chord is not shown on the physical Push pads. The cause was the\nWeb-only 2026-04-14 scale-only override immediately before LED output.\n\nThis bounded change sends the already-rendered `padState` to controller LEDs.\nChord one-position view mirrors the exact current Stock/Tasty/Guitar/selected\nvoicing/basic-form positions over the current scale background. All-positions\nview shows chord pitch classes over the same scale background. Scale mode is\nunchanged. C-fixed keeps the background C Major but no longer erases the chord.\nMemory/Perform slot layout remains owned by `padWebPushSlotPadColor`.\n\nNo theory, audio, pedal, native, manual, release, or S2 button behavior changes.\nPhysical Push colour/perception remains a Human Gate after machine/audit/dev.\n''')
print('applied chord pad LED patch')
