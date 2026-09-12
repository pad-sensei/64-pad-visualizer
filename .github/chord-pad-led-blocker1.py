from pathlib import Path
import sys
root = Path(sys.argv[1])
p = root / 'midi.js'
s = p.read_text()
old = """  if (_isPush && AppState.mode === 'chord' && chordPadIdxs) {
    if (chordPadIdxs.has(row * COLS + col)) return 21;
    if (pc === scaleRoot) return AppState.pushScaleRootColor || 3;
    if (scalePCS.has(pc)) return AppState.pushScaleToneColor || 122;
    return 0;
  }

  var chordColor = 0;
"""
new = """  if (_isPush && AppState.mode === 'chord' && chordPadIdxs) {
    if (chordPadIdxs.has(row * COLS + col)) return 21;
    if (pc === scaleRoot) return AppState.pushScaleRootColor || 3;
    if (scalePCS.has(pc)) return AppState.pushScaleToneColor || 122;
    return 0;
  }

  // Standalone SSOT: one-position Chord view never falls through to
  // pitch-class role colours. If no exact shape is currently available
  // (for example while root/quality selection is incomplete), keep only
  // the scale background until an exact shape exists.
  if (_isPush && AppState.mode === 'chord' && AppState.showAllPositions !== true) {
    if (pc === scaleRoot) return AppState.pushScaleRootColor || 3;
    if (scalePCS.has(pc)) return AppState.pushScaleToneColor || 122;
    return 0;
  }

  var chordColor = 0;
"""
assert s.count(old) == 1, s.count(old)
p.write_text(s.replace(old, new))
