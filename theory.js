// ========================================
// GENRE PRESET WEIGHTS (URL ?preset=folk|bossa|jazz|funk|neoSoul)
// ========================================
var GENRE_WEIGHTS = {
  folk:  { rootBass:100, fifthBass:20, rootStr6:40, rootStr5:35, rootStr4:20,
           top4:10, guideTone:30, openStr:55, stringCount:35, avgFret:12,
           span:10, gaps:20, fullFret:0, closedAForm:0, major7OpenCluster:0 },
  jazz:  { rootBass:60, fifthBass:0, rootStr6:20, rootStr5:30, rootStr4:40,
           top4:100, guideTone:50, openStr:0, stringCount:20, avgFret:6,
           span:10, gaps:15, fullFret:20 },
  bossa: { rootBass:70, fifthBass:60, openStr:25, top4:60, guideTone:40,
           avgFret:12, stringCount:35 },
  funk:  { rootBass:20, fifthBass:0, openStr:0, top4:120, guideTone:40,
           stringCount:20, span:20, gaps:25 },
  neoSoul: { rootBass:15, fifthBass:0, rootStr6:10, rootStr5:20, rootStr4:60,
           top4:140, guideTone:80, openStr:0, stringCount:15, avgFret:4,
           span:20, gaps:25, fullFret:10, closedAForm:40, major7OpenCluster:120 }
};

function normalizeGenrePreset(genre) {
  if (genre === 'neo-soul' || genre === 'neosoul') return 'neoSoul';
  return genre;
}

var _presetParam = (typeof URLSearchParams !== 'undefined') ? normalizeGenrePreset(new URLSearchParams(location.search).get('preset')) : null;
var _presetGenre = _presetParam && GENRE_WEIGHTS[_presetParam] ? _presetParam : '';
var _presetWeights = _presetGenre ? GENRE_WEIGHTS[_presetGenre] : null;
var _presetNoOpen = _presetGenre === 'funk' || _presetGenre === 'neoSoul';

function setGenrePreset(genre) {
  var guitarEngineWasActive = typeof isGuitarEngineActive === 'function' && isGuitarEngineActive();
  var prevGuitarGroup = guitarEngineWasActive && GuitarPositionState.groups[GuitarPositionState.currentGroupIdx]
    ? GuitarPositionState.groups[GuitarPositionState.currentGroupIdx].labelKey
    : null;
  genre = normalizeGenrePreset(genre);
  _presetGenre = genre && GENRE_WEIGHTS[genre] ? genre : '';
  _presetWeights = _presetGenre ? GENRE_WEIGHTS[_presetGenre] : null;
  _presetNoOpen = _presetGenre === 'funk' || _presetGenre === 'neoSoul';
  var presetSelects = document.querySelectorAll('#genre-preset-select, .guitar-engine-preset');
  presetSelects.forEach(function(sel) { sel.value = _presetGenre || ''; });
  // Invalidate cache to force re-enumeration
  GuitarPositionState._lastKey = null;
  GuitarPositionState._engineKey = null;
  BassPositionState._lastKey = null;
  updateGuitarPositions();
  updateBassPositions();
  if (typeof refreshGuitarEnginePositionsForBuilder === 'function' &&
      typeof isGuitarEngineActive === 'function' && isGuitarEngineActive()) {
    refreshGuitarEnginePositionsForBuilder(true);
    if (prevGuitarGroup && typeof setGuitarEngineGroup === 'function') {
      for (var i = 0; i < GuitarPositionState.groups.length; i++) {
        if (GuitarPositionState.groups[i].labelKey === prevGuitarGroup) {
          setGuitarEngineGroup(i);
          break;
        }
      }
    }
  }
  render();
  if (typeof updateChordDisplay === 'function') updateChordDisplay();
}

// ========================================
// PAD GRID FUNCTIONS
// ========================================
function baseMidi() { return BASE_MIDI + AppState.octaveShift * 12 + AppState.semitoneShift; }

function setOctaveShift(value) {
  var clamped = Math.max(-1, Math.min(3, value));
  if (clamped === AppState.octaveShift) return false;
  AppState.octaveShift = clamped;
  updateOctaveLabel();
  if ((TastyState.enabled || StockState.enabled) && typeof refreshActiveVoicingPadLayout === 'function') {
    refreshActiveVoicingPadLayout();
  }
  return true;
}

function shiftOctave(delta) {
  if (TastyState.enabled || StockState.enabled) {
    if (typeof refreshActiveVoicingPadLayout === 'function') refreshActiveVoicingPadLayout();
    render();
    return;
  }
  var specialVoicingActive = TastyState.enabled || StockState.enabled;
  if (!setOctaveShift(AppState.octaveShift + delta)) return;
  if (!specialVoicingActive) {
    resetVoicingSelection();
  }
  render();
  if (specialVoicingActive && typeof getCurrentChordPlaybackMidiNotes === 'function') {
    var notes = getCurrentChordPlaybackMidiNotes();
    if (notes && notes.length) playMidiNotes(notes);
  } else {
    playCurrentChord();
  }
  saveAppSettings();
}

// Basic-form octave nav (Shift+Up/Down). Move the shown chord up/down an octave.
// Case A: it still fits on the grid → shift the chord only, grid range fixed (basicOctave).
// Case B: it would fall off the grid edge → extend the grid octave range instead, so the
// chord can keep rising/falling. render() re-clamps basicOctave; we play the shown notes.
function shiftBasicFormOctave(delta) {
  var notes = getCurrentChordMidiNotes();
  if (!notes || notes.length === 0) return;
  var lo = baseMidi(), hi = baseMidi() + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  var next = (VoicingState.basicOctave || 0) + delta;
  var shifted = notes.map(function(n){ return n + next * 12; });
  var fits = Math.min.apply(null, shifted) >= lo && Math.max.apply(null, shifted) <= hi;
  if (fits) {
    VoicingState.basicOctave = next;                         // case A
  } else if (!setOctaveShift(AppState.octaveShift + delta)) {
    return;                                                  // case B but grid already at limit
  }
  render();                                                  // render() clamps basicOctave to grid
  var played = getCurrentChordMidiNotes().map(function(n){ return n + (VoicingState.basicOctave || 0) * 12; });
  if (typeof playMidiNotes === 'function') playMidiNotes(played);
  saveAppSettings();
}

// Basic-form Up/Down: step the chord by ONE inversion, UNCAPPED across octaves.
// Going up past the top inversion rolls into the next octave (inversion=0, basicOctave+1) so
// the chord keeps climbing the grid; going down past root rolls into the previous octave
// (inversion=maxInv, basicOctave-1). The 8x8 grid is the physical ceiling/floor: if the next
// step would push a note off the grid, we stay put (no wrap — keep the "climbing" mental model).
function stepBasicFormInversion(dir) {
  var pcs = (typeof getBuilderPCS === 'function') ? getBuilderPCS() : null;
  // Climb through EVERY chord tone before rolling to the next octave (no 3-cap), so 5+ note
  // chords (9th/11th/13th) don't skip their upper inversions. padCalcVoicingOffsets supports them.
  var maxInv = ((pcs && pcs.length) || 4) - 1;
  var inv = VoicingState.inversion;
  var oct = VoicingState.basicOctave || 0;
  var newInv, newOct;
  if (dir > 0) {
    if (inv < maxInv) { newInv = inv + 1; newOct = oct; }
    else { newInv = 0; newOct = oct + 1; }       // climbed past top inversion → next octave
  } else {
    if (inv > 0) { newInv = inv - 1; newOct = oct; }
    else { newInv = maxInv; newOct = oct - 1; }  // descended past root → previous octave
  }
  // Test grid fit at the candidate inversion (inversions change the chord's vertical span).
  var savedInv = VoicingState.inversion;
  VoicingState.inversion = newInv;
  var notes = getCurrentChordMidiNotes();
  if (!notes || notes.length === 0) { VoicingState.inversion = savedInv; return; }
  var lo = baseMidi(), hi = baseMidi() + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  var shifted = notes.map(function(n){ return n + newOct * 12; });
  var fits = Math.min.apply(null, shifted) >= lo && Math.max.apply(null, shifted) <= hi;
  if (!fits) { VoicingState.inversion = savedInv; return; }   // at the grid edge → stay put
  VoicingState.basicOctave = newOct;
  VoicingState.basicPosIdx = 0;                  // new shape → start at the compact arrangement
  if (typeof updateVoicingButtons === 'function') updateVoicingButtons();
  if (typeof updateChordDisplay === 'function') updateChordDisplay();
  render();
  var played = getCurrentChordMidiNotes().map(function(n){ return n + (VoicingState.basicOctave || 0) * 12; });
  if (typeof playMidiNotes === 'function') playMidiNotes(played);
  saveAppSettings();
}

// All "other positions" of the chord at the SAME register = same pitches, different pad
// layout (because each note repeats on the grid). Reuses the voicing-box enumerator
// (padCalcAllVoicingPositions): fix the bass pitch, place each upper note at its available
// pads, keep compact arrangements. Sorted compact-first ([0] = the basic form). The octave
// register itself is moved separately by Shift+Up/Down (basicOctave).
function basicFormArrangements() {
  var base = (typeof getCurrentChordMidiNotes === 'function') ? getCurrentChordMidiNotes() : null;
  if (!base || base.length === 0) return [];
  var oct = VoicingState.basicOctave || 0;
  var notes = base.map(function(n){ return n + oct * 12; }).sort(function(a, b){ return a - b; });
  var bass = notes[0];
  var offsets = notes.map(function(n){ return n - bass; });
  var bm = baseMidi();
  var bassPositions = [];
  for (var r = 0; r < ROWS; r++) {
    var c = bass - bm - r * ROW_INTERVAL;
    if (c >= 0 && c < COLS) bassPositions.push({ row: r, col: c });
  }
  var all = [];
  bassPositions.forEach(function(bp){
    var arr = calcAllVoicingPositions(bp.row, bp.col, offsets);
    if (arr) arr.forEach(function(vp){ all.push(vp); });
  });
  var seen = {}, uniq = [];
  all.forEach(function(vp){
    var key = vp.positions.map(function(p){ return p.row + ',' + p.col; }).sort().join('|');
    if (!seen[key]) { seen[key] = 1; uniq.push(vp); }
  });
  uniq.sort(function(a, b){ return a.maxDim - b.maxDim || a.area - b.area; });
  return uniq;
}

// Space in basic-form: advance to the next same-register pad arrangement (wrap) and play it.
// Returns true if it cycled (more than one arrangement exists), false otherwise.
function cycleBasicFormPosition() {
  var arr = basicFormArrangements();
  if (arr.length <= 1) return false;
  VoicingState.basicPosIdx = ((VoicingState.basicPosIdx || 0) + 1) % arr.length;
  render();
  var chosen = arr[VoicingState.basicPosIdx];
  var bm = baseMidi();
  var notes = chosen.positions.map(function(p){ return bm + p.row * ROW_INTERVAL + p.col; });
  if (typeof playMidiNotes === 'function') playMidiNotes(notes, 1.0);
  return true;
}

function shiftSemitone(delta) {
  if (TastyState.enabled || StockState.enabled) return;
  var next = AppState.semitoneShift + delta;
  if (next < -11 || next > 11) return;
  AppState.semitoneShift = next;
  updateOctaveLabel();
  render();
  saveAppSettings();
}

function updateOctaveLabel() {
  const lo = baseMidi();
  const hi = lo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  document.getElementById('oct-label').textContent = noteName(lo) + ' — ' + noteName(hi);
  var hpsAutoFit = (TastyState.enabled && TastyState.currentIndex >= 0) ||
    (StockState.enabled && StockState.currentIndex >= 0);
  document.getElementById('oct-down').disabled = hpsAutoFit || (AppState.octaveShift <= -1);
  document.getElementById('oct-up').disabled = hpsAutoFit || (AppState.octaveShift >= 3);
  // 32-pad labels
  var octLabel32 = document.getElementById('oct-label-32');
  if (octLabel32) {
    var lo32 = baseMidi();
    var hi32 = lo32 + (GRID_32.ROWS - 1) * GRID_32.ROW_INTERVAL + (GRID_32.COLS - 1);
    octLabel32.textContent = noteName(lo32) + '—' + noteName(hi32);
  }
  var semiLabel = document.getElementById('semi-label');
  if (semiLabel) {
    var s = AppState.semitoneShift;
    semiLabel.textContent = s === 0 ? '±0' : (s > 0 ? '+' + s : '' + s);
  }
  var semiDown = document.getElementById('semi-down');
  var semiUp = document.getElementById('semi-up');
  if (semiDown) semiDown.disabled = (AppState.semitoneShift <= -11);
  if (semiUp) semiUp.disabled = (AppState.semitoneShift >= 11);
}

function toggleOmit5() { VoicingState.omit5 = !VoicingState.omit5; VoicingState.shell = null; updateVoicingButtons(); updateChordDisplay(); render(); playCurrentChord(); }
function toggleRootless() { VoicingState.rootless = !VoicingState.rootless; VoicingState.shell = null; updateVoicingButtons(); updateChordDisplay(); render(); playCurrentChord(); }
function toggleOmit3() { VoicingState.omit3 = !VoicingState.omit3; VoicingState.shell = null; updateVoicingButtons(); updateChordDisplay(); render(); playCurrentChord(); }
function setShell(mode) {
  VoicingState.shell = mode;
  if (mode) {
    VoicingState.omit5 = true; VoicingState.rootless = false; VoicingState.omit3 = false;
    VoicingState.inversion = 0; VoicingState.drop = null;
  }
  resetVoicingSelection();
  updateVoicingButtons(); updateChordDisplay(); render();
  playCurrentChord();
}
function setInversion(inv) {
  VoicingState.inversion = inv;
  VoicingState.shell = null;
  if (VoicingState.selectedBoxIdx !== null) VoicingState._preservePosition = { type: 'voicing' };
  updateVoicingButtons(); updateChordDisplay(); render();
  playCurrentChord();
}
function setDrop(drop) {
  VoicingState.drop = VoicingState.drop === drop ? null : drop;
  VoicingState.shell = null;
  if (VoicingState.selectedBoxIdx !== null) VoicingState._preservePosition = { type: 'voicing' };
  updateVoicingButtons(); updateChordDisplay(); render();
  playCurrentChord();
}
function updateVoicingButtons() {
  document.getElementById('btn-omit5').classList.toggle('active', VoicingState.omit5);
  document.getElementById('btn-rootless').classList.toggle('active', VoicingState.rootless);
  document.getElementById('btn-omit3').classList.toggle('active', VoicingState.omit3);
  document.getElementById('btn-shell137').classList.toggle('active', VoicingState.shell === '137');
  document.getElementById('btn-shell173').classList.toggle('active', VoicingState.shell === '173');
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById('btn-inv' + i);
    if (el) el.classList.toggle('active', VoicingState.inversion === i);
  }
  const d2 = document.getElementById('btn-drop2');
  const d3 = document.getElementById('btn-drop3');
  if (d2) d2.classList.toggle('active', VoicingState.drop === 'drop2');
  if (d3) d3.classList.toggle('active', VoicingState.drop === 'drop3');
  const sap = document.getElementById('btn-show-all-positions');
  if (sap) sap.classList.toggle('active', AppState.showAllPositions === true);
}

function playVoicingBoxAudio(idx) {
  if (!VoicingState.lastBoxes[idx]) return;
  let midiNotes = [...VoicingState.lastBoxes[idx].midiNotes];

  // Shell voicing: add chord tones not in the voicing box (tensions etc.)
  if (VoicingState.shell && AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality) {
    const fullPCS = getBuilderPCS();
    if (fullPCS) {
      const rootPC = BuilderState.root;
      const boxRoot = midiNotes.find(m => m % 12 === rootPC);
      if (boxRoot !== undefined) {
        const existingPCs = new Set(midiNotes.map(m => m % 12));
        existingPCs.add((rootPC + 7) % 12);
        for (const iv of fullPCS) {
          const notePC = (rootPC + iv) % 12;
          if (!existingPCs.has(notePC)) {
            midiNotes.push(boxRoot + iv);
            existingPCs.add(notePC);
          }
        }
      }
    }
  }

  // Bass note for slash chords (guard against double bass from voicing boxes)
  if (BuilderState.bass !== null) {
    const hasBass = midiNotes.some(m => m % 12 === BuilderState.bass);
    if (!hasBass) {
      const lowest = Math.min(...midiNotes);
      let bassMidi = 36 + BuilderState.bass + AppState.octaveShift * 12;
      while (bassMidi >= lowest) bassMidi -= 12;
      midiNotes.unshift(bassMidi);
    }
  }

  midiNotes.sort((a, b) => a - b);
  playMidiNotes(midiNotes);
}

function selectVoicingBox(idx) {
  const wasSelected = VoicingState.selectedBoxIdx === idx;
  const box = VoicingState.lastBoxes[idx];
  const hasCycle = box && box.alternatives && box.alternatives.length > 1;

  if (!wasSelected) {
    // Case 1: Not selected -> select it
    VoicingState.selectedBoxIdx = idx;
    // TASTY mode: update voicing to this box's position
    if (TastyState.enabled && box) {
      TastyState.midiNotes = box.midiNotes;
      TastyState.topNote = Math.max.apply(null, box.midiNotes);
      TastyState.midiDegrees = TastyState.currentMatches[TastyState.currentIndex].v.slice(0, box.midiNotes.length);
      TastyState.degreeMap = buildDegreeMapFromItems(makeVoicingItemsFromMidiDegrees(box.midiNotes, TastyState.midiDegrees));
      updateTastyUI();
    }
    render();
    playVoicingBoxAudio(idx);
  } else if (hasCycle) {
    // Case 2: Already selected + has alternatives -> cycle to next
    const nextAlt = (box.currentAlt + 1) % box.alternatives.length;
    VoicingState.cycleIndices[idx] = nextAlt;
    // Recompute box midiNotes for the new alternative
    var bm = baseMidi();
    box.currentAlt = nextAlt;
    box.midiNotes = box.alternatives[nextAlt].positions
      .map(function(p) { return bm + p.row * ROW_INTERVAL + p.col; })
      .sort(function(a, b) { return a - b; });
    // TASTY mode: update to cycled alternative
    if (TastyState.enabled) {
      TastyState.midiNotes = box.midiNotes;
      TastyState.topNote = Math.max.apply(null, box.midiNotes);
      TastyState.midiDegrees = TastyState.currentMatches[TastyState.currentIndex].v.slice(0, box.midiNotes.length);
      TastyState.degreeMap = buildDegreeMapFromItems(makeVoicingItemsFromMidiDegrees(box.midiNotes, TastyState.midiDegrees));
      updateTastyUI();
    }
    render();
    playVoicingBoxAudio(idx);
  } else {
    // Case 3: Already selected + no alternatives -> deselect
    VoicingState.selectedBoxIdx = null;
    render();
  }
}

// Low interval limits for automatic builder playback.
// Key = pitch-class distance between the lower note and an upper chord tone.
// Value = the lowest MIDI note where that interval still speaks clearly enough.
// These are conservative keyboard voicing defaults; recorded Perform slots and
// curated TASTY/Stock/Guitar voicings keep their saved register.
var CHORD_PLAYBACK_LOW_INTERVAL_LIMITS = {
  1: 60, // b9 / m2
  2: 48, // 9 / M2
  3: 43, // b3 / #9
  4: 43, // 3
  5: 40, // 11 / sus4
  6: 42, // #11 / b5
  7: 36, // 5
  8: 36, // #5 / b13
  9: 36, // 6 / 13
  10: 34, // b7
  11: 36  // maj7
};

function applyChordPlaybackRangeRules(notes) {
  if (!notes || notes.length < 2) return notes;
  var out = notes.slice().sort(function(a, b) { return a - b; });
  var guard = 0;
  while (guard++ < 4) {
    var tooLow = false;
    for (var i = 0; i < out.length - 1 && !tooLow; i++) {
      for (var j = i + 1; j < out.length; j++) {
        var distance = (out[j] - out[i]) % 12;
        if (distance === 0) continue;
        var limit = CHORD_PLAYBACK_LOW_INTERVAL_LIMITS[distance];
        if (limit !== undefined && out[i] < limit) {
          tooLow = true;
          break;
        }
      }
    }
    if (!tooLow) break;
    out = out.map(function(n) { return n + 12; });
  }
  return out;
}

// Play current chord automatically (for tension/shell/voicing changes)
function playCurrentChord() {
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) return;
  let pcs = getBuilderPCS();
  if (!pcs || pcs.length === 0) return;

  const rootPC = BuilderState.root;
  let intervals;

  if (VoicingState.shell) {
    intervals = getShellIntervals(BuilderState.quality.pcs, VoicingState.shell, 0, pcs);
    if (!intervals) return;
  } else {
    // Normal voicing: apply omit/rootless filters
    if (VoicingState.omit5) pcs = pcs.filter(iv => iv % 12 !== 7);
    if (VoicingState.rootless) pcs = pcs.filter(iv => iv % 12 !== 0);
    if (VoicingState.omit3) pcs = pcs.filter(iv => iv % 12 !== 3 && iv % 12 !== 4);
    if (pcs.length === 0) return;
    intervals = calcVoicingOffsets(pcs, VoicingState.inversion, VoicingState.drop).voiced;
  }

  // Convert to MIDI (root at C3 = MIDI 48, shifted by octave)
  const octOff = AppState.octaveShift * 12;
  const rootMidi = 48 + rootPC + octOff;
  const midiNotes = intervals.map(o => rootMidi + o);
  // Add bass note for slash chords
  if (BuilderState.bass !== null) {
    midiNotes.unshift(36 + BuilderState.bass + octOff);
  }
  playMidiNotes(applyChordPlaybackRangeRules(midiNotes), 2);
}


// ========================================
// VOICING CALCULATION — Adapters to pad-core pure functions
// ========================================
function getShellIntervals(qualityPCS, shellMode, extension, fullPCS) {
  return padGetShellIntervals(qualityPCS, shellMode, extension, fullPCS);
}

// Search grid for all valid voicing positions, draw bounding boxes, update VoicingState.lastBoxes
function computeAndDrawVoicingBoxes(svg, offsets, targetPC, strokeColor, badgeColor, maxRS, maxCS) {
  const boxes = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const midi = midiNote(row, col);
      if (pitchClass(midi) !== targetPC) continue;
      const allVP = calcAllVoicingPositions(row, col, offsets);
      if (allVP.length === 0) continue;
      // Apply maxRS/maxCS filter to all alternatives
      const filtered = maxRS ? allVP.filter(vp => {
        const rs = vp.maxRow - vp.minRow + 1, cs = vp.maxCol - vp.minCol + 1;
        return rs <= maxRS && cs <= maxCS;
      }) : allVP;
      if (filtered.length === 0) continue;
      boxes.push({ midi, row, col, alternatives: filtered });
    }
  }
  boxes.sort((a, b) => a.midi - b.midi);
  // Save previous selection for proximity matching (only when flagged)
  const preserve = VoicingState._preservePosition;
  const prevBoxData = (preserve && VoicingState.selectedBoxIdx !== null
    && VoicingState.lastBoxes[VoicingState.selectedBoxIdx])
    ? VoicingState.lastBoxes[VoicingState.selectedBoxIdx] : null;
  VoicingState._preservePosition = false; // consume flag
  // Build lastBoxes with alternatives and current cycling index
  const cycleableSet = new Set();
  VoicingState.lastBoxes = boxes.map((b, idx) => {
    const altIdx = VoicingState.cycleIndices[idx] || 0;
    const safeIdx = altIdx < b.alternatives.length ? altIdx : 0;
    const currentVP = b.alternatives[safeIdx];
    if (b.alternatives.length > 1) cycleableSet.add(idx);
    return {
      rootRow: b.row, rootCol: b.col,
      midiNotes: currentVP.positions.map(p => baseMidi() + p.row * ROW_INTERVAL + p.col).sort((a, b) => a - b),
      alternatives: b.alternatives,
      currentAlt: safeIdx
    };
  });
  // Position preservation (only on transpose/inversion/drop)
  if (prevBoxData !== null && VoicingState.lastBoxes.length > 0) {
    if (preserve.type === 'transpose') {
      // Shape-based matching: compare physical finger shape (relative grid offsets from root)
      const prevAlt = prevBoxData.alternatives[prevBoxData.currentAlt];
      const prevShape = prevAlt.positions
        .map(p => ({ dr: p.row - prevBoxData.rootRow, dc: p.col - prevBoxData.rootCol }))
        .sort((a, b) => a.dr - b.dr || a.dc - b.dc);
      const bm = baseMidi();
      const prevRootMidi = bm + prevBoxData.rootRow * ROW_INTERVAL + prevBoxData.rootCol;
      const expectedMidi = prevRootMidi + preserve.midiDelta;
      // Search all boxes × all alternatives for matching shape
      let bestIdx = -1, bestAltIdx = -1, bestPitchDist = Infinity, bestGridDist = Infinity;
      let fallbackIdx = 0, fallbackPitchDist = Infinity, fallbackGridDist = Infinity;
      VoicingState.lastBoxes.forEach((box, i) => {
        const boxMidi = bm + box.rootRow * ROW_INTERVAL + box.rootCol;
        const pitchDist = Math.abs(boxMidi - expectedMidi);
        const gridDist = Math.abs(box.rootRow - prevBoxData.rootRow) + Math.abs(box.rootCol - prevBoxData.rootCol);
        // Track fallback (closest pitch, then closest grid position as tiebreaker)
        if (pitchDist < fallbackPitchDist || (pitchDist === fallbackPitchDist && gridDist < fallbackGridDist)) {
          fallbackPitchDist = pitchDist; fallbackGridDist = gridDist; fallbackIdx = i;
        }
        // Check every alternative of this box for shape match
        box.alternatives.forEach((alt, j) => {
          const shape = alt.positions
            .map(p => ({ dr: p.row - box.rootRow, dc: p.col - box.rootCol }))
            .sort((a, b) => a.dr - b.dr || a.dc - b.dc);
          if (shape.length === prevShape.length &&
              shape.every((s, k) => s.dr === prevShape[k].dr && s.dc === prevShape[k].dc)) {
            if (pitchDist < bestPitchDist || (pitchDist === bestPitchDist && gridDist < bestGridDist)) {
              bestPitchDist = pitchDist; bestGridDist = gridDist; bestIdx = i; bestAltIdx = j;
            }
          }
        });
      });
      // Prefer shape match, but reject if it jumps too far (> 7 semitones from expected)
      if (bestIdx >= 0 && bestPitchDist <= 7) {
        VoicingState.selectedBoxIdx = bestIdx;
        // Switch to the matching alternative
        VoicingState.cycleIndices[bestIdx] = bestAltIdx;
        const selBox = VoicingState.lastBoxes[bestIdx];
        selBox.currentAlt = bestAltIdx;
        selBox.midiNotes = selBox.alternatives[bestAltIdx].positions
          .map(p => bm + p.row * ROW_INTERVAL + p.col).sort((a, b) => a - b);
      } else {
        // No nearby shape match: stay in same pitch range (fallback)
        VoicingState.selectedBoxIdx = fallbackIdx;
      }
    } else {
      // Voicing change (inversion/drop): root stays same, find exact same root position
      const pr = prevBoxData.rootRow, pc = prevBoxData.rootCol;
      let bestIdx = null, bestDist = Infinity;
      VoicingState.lastBoxes.forEach((box, i) => {
        if (box.rootRow === pr && box.rootCol === pc) { bestIdx = i; return; }
        const dist = Math.abs(box.rootRow - pr) + Math.abs(box.rootCol - pc);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      });
      if (bestIdx !== null) VoicingState.selectedBoxIdx = bestIdx;
    }
  } else if (VoicingState.selectedBoxIdx !== null && VoicingState.lastBoxes.length === 0) {
    VoicingState.selectedBoxIdx = null;
  }
  const midiCount = new Map();
  boxes.forEach(b => midiCount.set(b.midi, (midiCount.get(b.midi) || 0) + 1));
  const dupSet = new Set();
  boxes.forEach((b, i) => { if (midiCount.get(b.midi) > 1) dupSet.add(i); });
  // Use current alternative's vp for drawing
  const vpArray = boxes.map((b, idx) => {
    const safeIdx = VoicingState.lastBoxes[idx].currentAlt;
    return b.alternatives[safeIdx];
  });
  drawVoicingBoxes(svg, vpArray, strokeColor, badgeColor, dupSet, cycleableSet);
}

function calcVoicingOffsets(chordPCS, inversion, drop) {
  return padCalcVoicingOffsets(chordPCS, inversion, drop);
}

function getBassCase(bassPC, rootPC, chordPCS) {
  return padGetBassCase(bassPC, rootPC, chordPCS);
}

function applyOnChordBass(voiced, rootPC, bassPC) {
  return padApplyOnChordBass(voiced, rootPC, bassPC);
}

function calcAllVoicingPositions(bassRow, bassCol, offsets, maxResults) {
  return padCalcAllVoicingPositions(bassRow, bassCol, offsets, ROWS, COLS, baseMidi(), ROW_INTERVAL, maxResults);
}

// Backward-compatible wrapper: returns single best position or null
function calcVoicingPositions(bassRow, bassCol, offsets) {
  const all = calcAllVoicingPositions(bassRow, bassCol, offsets, 1);
  return all.length > 0 ? all[0] : null;
}

// Shell voicing position calculator
// Returns {positions: [{row,col},...], minRow, maxRow, minCol, maxCol} or null
function calcShellPositions(rootRow, rootCol, thirdInterval, seventhInterval, shellType) {
  const bm = baseMidi();
  const rootMidi = bm + rootRow * ROW_INTERVAL + rootCol;
  // 1-3-7: R at bottom, 3rd above, 7th on top (ascending natural)
  // 1-7-3: R at bottom, 7th above, 3rd on top (3rd displaced up an octave)
  const targetOffsets = shellType === '137'
    ? [thirdInterval, seventhInterval]
    : [seventhInterval, thirdInterval + 12];
  // Find all valid pad positions for each target
  const candidates = targetOffsets.map(offset => {
    const targetMidi = rootMidi + offset;
    const positions = [];
    for (let r = 0; r < ROWS; r++) {
      const c = targetMidi - bm - r * ROW_INTERVAL;
      if (c >= 0 && c < COLS) positions.push({ row: r, col: c });
    }
    return positions;
  });
  if (candidates.some(c => c.length === 0)) return null;
  // Find combination with smallest max-dimension, then area
  let best = null, bestMaxDim = Infinity, bestArea = Infinity;
  const p0 = { row: rootRow, col: rootCol };
  for (const p1 of candidates[0]) {
    for (const p2 of candidates[1]) {
      const minR = Math.min(p0.row, p1.row, p2.row);
      const maxR = Math.max(p0.row, p1.row, p2.row);
      const minC = Math.min(p0.col, p1.col, p2.col);
      const maxC = Math.max(p0.col, p1.col, p2.col);
      const rowSpan = maxR - minR + 1;
      const colSpan = maxC - minC + 1;
      const maxDim = Math.max(rowSpan, colSpan);
      const area = rowSpan * colSpan;
      if (maxDim < bestMaxDim || (maxDim === bestMaxDim && area < bestArea)) {
        bestMaxDim = maxDim; bestArea = area;
        best = { positions: [p0, p1, p2], minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC };
      }
    }
  }
  // Filter: skip if bounding box too large (impractical hand reach)
  if (best) {
    const rs = best.maxRow - best.minRow + 1;
    const cs = best.maxCol - best.minCol + 1;
    if (rs > 4 || cs > 5) return null;
  }
  return best;
}

// ========================================
// GUITAR/BASS POSITION ALTERNATIVES (v3.19, groups v3.21)
// ========================================
var INSTRUMENT_POSITION_MAX_RESULTS = 10;
var GUITAR_ENGINE_POSITION_MAX_RESULTS = 30;

function groupGuitarForms(alternatives, openMidi, rootPC) {
  var numStrings = openMidi.length;
  var groups = [];
  // All positions first (user preference: most general filter first)
  if (alternatives.length > 0) {
    groups.push({ labelKey: 'pos.all', forms: alternatives });
  }
  // Root string groups (check bottom 3 strings)
  var maxRoot = Math.min(3, numStrings);
  for (var si = numStrings - 1; si >= numStrings - maxRoot; si--) {
    var forms = [];
    for (var i = 0; i < alternatives.length; i++) {
      var f = alternatives[i];
      if (!f.rootInBass) continue;
      // Find lowest sounding string
      var lo = -1;
      for (var j = f.frets.length - 1; j >= 0; j--) {
        if (f.frets[j] !== null) { lo = j; break; }
      }
      if (lo === si) forms.push(f);
    }
    if (forms.length > 0) {
      groups.push({ labelKey: 'pos.root_' + (si + 1), forms: forms });
    }
  }
  // Open string forms
  var openForms = [];
  for (var i = 0; i < alternatives.length; i++) {
    for (var j = 0; j < alternatives[i].frets.length; j++) {
      if (alternatives[i].frets[j] === 0) { openForms.push(alternatives[i]); break; }
    }
  }
  if (openForms.length > 0) {
    groups.push({ labelKey: 'pos.open', forms: openForms });
  }
  var noOpenForms = [];
  for (var i = 0; i < alternatives.length; i++) {
    var hasOpen = false;
    for (var j = 0; j < alternatives[i].frets.length; j++) {
      if (alternatives[i].frets[j] === 0) { hasOpen = true; break; }
    }
    if (!hasOpen) noOpenForms.push(alternatives[i]);
  }
  if (noOpenForms.length > 0) {
    groups.push({ labelKey: 'pos.no_open', forms: noOpenForms });
  }
  // Voice count groups (3-voice, 4-voice, 5-voice)
  for (var vc = 3; vc <= 5; vc++) {
    var vcForms = [];
    for (var i = 0; i < alternatives.length; i++) {
      if (alternatives[i].stringCount === vc) vcForms.push(alternatives[i]);
    }
    if (vcForms.length > 0) {
      groups.push({ labelKey: 'pos.voice_' + vc, forms: vcForms });
    }
  }
  return groups;
}

function _resetPositionState(state) {
  state.currentAlt = 0;
  state.currentGroupIdx = 0;
  state.currentAltInGroup = 0;
}

function _currentFormIndex(state) {
  if (state.groups.length === 0) return 0;
  var g = state.groups[state.currentGroupIdx];
  if (!g) return 0;
  return state.alternatives.indexOf(g.forms[state.currentAltInGroup]);
}

function updateGuitarPositions() {
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) {
    GuitarPositionState.enabled = false;
    GuitarPositionState._lastKey = null;
    updatePositionBar('guitar');
    return;
  }
  if (_guitarSyncSource === 'manual') {
    GuitarPositionState.enabled = false;
    GuitarPositionState._lastKey = null;
    updatePositionBar('guitar');
    return;
  }

  var pcs = getBuilderPCS();
  if (!pcs) { GuitarPositionState.enabled = false; GuitarPositionState._lastKey = null; updatePositionBar('guitar'); return; }

  var key = BuilderState.root + ':' + pcs.join(',');
  if (key !== GuitarPositionState._lastKey) {
    GuitarPositionState._lastKey = key;
    GuitarPositionState.alternatives = padEnumGuitarChordForms(pcs, BuilderState.root, GUITAR_OPEN_MIDI, 21, 4, { maxResults: INSTRUMENT_POSITION_MAX_RESULTS, weights: _presetWeights, noOpen: _presetNoOpen, genre: _presetGenre });
    GuitarPositionState.groups = groupGuitarForms(GuitarPositionState.alternatives, GUITAR_OPEN_MIDI, BuilderState.root);
    _resetPositionState(GuitarPositionState);
    GuitarPositionState.enabled = GuitarPositionState.alternatives.length > 0;
    if (GuitarPositionState.enabled) {
      applyGuitarForm(GuitarPositionState.alternatives[0]);
    }
  }
  updatePositionBar('guitar');
}

function updateBassPositions() {
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) {
    BassPositionState.enabled = false;
    BassPositionState._lastKey = null;
    updatePositionBar('bass');
    return;
  }
  if (_guitarSyncSource === 'manual') {
    BassPositionState.enabled = false;
    BassPositionState._lastKey = null;
    updatePositionBar('bass');
    return;
  }

  var pcs = getBuilderPCS();
  if (!pcs) { BassPositionState.enabled = false; BassPositionState._lastKey = null; updatePositionBar('bass'); return; }

  var key = BuilderState.root + ':' + pcs.join(',');
  if (key !== BassPositionState._lastKey) {
    BassPositionState._lastKey = key;
    BassPositionState.alternatives = padEnumGuitarChordForms(pcs, BuilderState.root, PAD_BASS_TUNING, 21, 4, { maxResults: INSTRUMENT_POSITION_MAX_RESULTS, weights: _presetWeights, noOpen: _presetNoOpen, genre: _presetGenre });
    BassPositionState.groups = groupGuitarForms(BassPositionState.alternatives, PAD_BASS_TUNING, BuilderState.root);
    _resetPositionState(BassPositionState);
    BassPositionState.enabled = BassPositionState.alternatives.length > 0;
    if (BassPositionState.enabled) {
      applyBassForm(BassPositionState.alternatives[0]);
    }
  }
  updatePositionBar('bass');
}

function applyGuitarForm(form) {
  guitarSelectedFrets = form.frets.slice();
  _guitarSyncSource = 'position';
  instrumentInputActive = true;
}

function applyBassForm(form) {
  bassSelectedFrets = form.frets.slice();
}

function cycleGuitarPosition(delta) {
  if (!GuitarPositionState.enabled || GuitarPositionState.groups.length === 0) return;
  var g = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
  if (!g) return;
  var len = g.forms.length;
  GuitarPositionState.currentAltInGroup = (GuitarPositionState.currentAltInGroup + delta + len) % len;
  GuitarPositionState.currentAlt = GuitarPositionState.alternatives.indexOf(g.forms[GuitarPositionState.currentAltInGroup]);
  applyGuitarForm(g.forms[GuitarPositionState.currentAltInGroup]);
  updatePositionBar('guitar');
  render();
}

function cycleBassPosition(delta) {
  if (!BassPositionState.enabled || BassPositionState.groups.length === 0) return;
  var g = BassPositionState.groups[BassPositionState.currentGroupIdx];
  if (!g) return;
  var len = g.forms.length;
  BassPositionState.currentAltInGroup = (BassPositionState.currentAltInGroup + delta + len) % len;
  BassPositionState.currentAlt = BassPositionState.alternatives.indexOf(g.forms[BassPositionState.currentAltInGroup]);
  applyBassForm(g.forms[BassPositionState.currentAltInGroup]);
  updatePositionBar('bass');
  render();
}

function cycleGuitarGroup(delta) {
  if (!GuitarPositionState.enabled || GuitarPositionState.groups.length <= 1) return;
  var len = GuitarPositionState.groups.length;
  GuitarPositionState.currentGroupIdx = (GuitarPositionState.currentGroupIdx + delta + len) % len;
  GuitarPositionState.currentAltInGroup = 0;
  var g = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
  GuitarPositionState.currentAlt = GuitarPositionState.alternatives.indexOf(g.forms[0]);
  applyGuitarForm(g.forms[0]);
  updatePositionBar('guitar');
  render();
}

function cycleBassGroup(delta) {
  if (!BassPositionState.enabled || BassPositionState.groups.length <= 1) return;
  var len = BassPositionState.groups.length;
  BassPositionState.currentGroupIdx = (BassPositionState.currentGroupIdx + delta + len) % len;
  BassPositionState.currentAltInGroup = 0;
  var g = BassPositionState.groups[BassPositionState.currentGroupIdx];
  BassPositionState.currentAlt = BassPositionState.alternatives.indexOf(g.forms[0]);
  applyBassForm(g.forms[0]);
  updatePositionBar('bass');
  render();
}

function updatePositionBar(which) {
  var state = which === 'guitar' ? GuitarPositionState : BassPositionState;
  var bar = document.getElementById(which + '-position-bar');
  var label = document.getElementById(which + '-pos-label');
  var groupsEl = document.getElementById(which + '-pos-groups');
  if (!bar || !label) return;
  if (which === 'guitar' && typeof isGuitarEngineActive === 'function' && isGuitarEngineActive()) {
    bar.style.display = 'none';
    if (groupsEl) groupsEl.style.display = 'none';
    return;
  }
  if (state.enabled && state.alternatives.length > 0) {
    bar.style.display = 'flex';
    // Group tabs
    if (groupsEl) {
      groupsEl.innerHTML = '';
      if (state.groups.length > 1) {
        groupsEl.style.display = 'flex';
        for (var i = 0; i < state.groups.length; i++) {
          var tab = document.createElement('button');
          tab.className = 'pos-group-tab' + (i === state.currentGroupIdx ? ' active' : '');
          tab.textContent = t(state.groups[i].labelKey);
          tab.dataset.idx = i;
          tab.onclick = (function(w, idx) {
            return function() {
              if (w === 'guitar') { GuitarPositionState.currentGroupIdx = idx; GuitarPositionState.currentAltInGroup = 0; cycleGuitarGroup(0); }
              else { BassPositionState.currentGroupIdx = idx; BassPositionState.currentAltInGroup = 0; cycleBassGroup(0); }
            };
          })(which, i);
          groupsEl.appendChild(tab);
        }
      } else {
        groupsEl.style.display = 'none';
      }
    }
    // Label: show current group info
    var g = state.groups[state.currentGroupIdx];
    if (g) {
      var groupLabel = state.groups.length > 1 ? t(g.labelKey) + ': ' : '';
      label.textContent = groupLabel + (state.currentAltInGroup + 1);
    } else {
      label.textContent = String(state.currentAlt + 1);
    }
  } else {
    bar.style.display = 'none';
    if (groupsEl) groupsEl.style.display = 'none';
  }
  // Show voicing-reflect button independently (guitar only)
  if (which === 'guitar') {
    var vrBtn = document.getElementById('voicing-reflect-btn');
    if (vrBtn) {
      // The left side is the instrument area. Guitar-to-pad selection now lives
      // in the builder engine tabs alongside TASTY/STOCK.
      vrBtn.style.display = 'none';
    }
  }
}

// ========================================
// CHORD NAMING & HELPERS
// ========================================
function chordDegreeName(interval, qualityPCS, finalPCS) {
  switch(interval) {
    case 0: return 'R';
    case 1: return 'b9';
    case 2:
      if (BuilderState.tension && BuilderState.tension.mods && BuilderState.tension.mods.replace3 === 2) return '2';
      return '9';
    case 3:
      if (finalPCS && finalPCS.has(4)) return '#9';
      return 'm3';
    case 4: return '3';
    case 5:
      if (BuilderState.tension && BuilderState.tension.mods && BuilderState.tension.mods.replace3 === 5) return '4';
      if (qualityPCS && !qualityPCS.includes(3) && !qualityPCS.includes(4)) return '4';
      return '11';
    case 6:
      if (qualityPCS && qualityPCS.includes(6)) return 'b5';
      return '#11';
    case 7: return '5';
    case 8:
      if (qualityPCS && qualityPCS.includes(8)) return '#5';
      if (BuilderState.tension && BuilderState.tension.mods && BuilderState.tension.mods.sharp5) return '#5';
      return 'b13';
    case 9:
      if (qualityPCS && qualityPCS.includes(9) && !qualityPCS.includes(10) && !qualityPCS.includes(11)) return '6';
      return '13';
    case 10: return 'b7';
    case 11: return '7';
  }
  return '';
}

function detectedChordQualityFlags(chordName) {
  var name = chordName || '';
  return {
    flat5: /(?:b5|♭5|m7\(b5\)|ø|dim)/i.test(name),
    sharp5: /(?:#5|♯5|aug|\+)/i.test(name),
    seventh: /(?:7|6|13|9|11)/.test(name)
  };
}

function detectedNoteDegreeName(interval, finalPCS, chordName) {
  var flags = detectedChordQualityFlags(chordName);
  switch(interval) {
    case 0: return '1';
    case 1: return 'b9';
    case 2: return '9';
    case 3:
      if (finalPCS && finalPCS.has(4)) return '#9';
      return 'm3';
    case 4: return '3';
    case 5:
      if (finalPCS && (finalPCS.has(3) || finalPCS.has(4))) return '11';
      return '4';
    case 6:
      if (flags.flat5) return 'b5';
      if (finalPCS && (finalPCS.has(3) || finalPCS.has(4) || flags.seventh)) return '#11';
      return 'b5';
    case 7: return '5';
    case 8:
      if (flags.sharp5) return '#5';
      if (finalPCS && (finalPCS.has(3) || finalPCS.has(4) || finalPCS.has(7) || flags.seventh)) return 'b13';
      return '#5';
    case 9:
      if (finalPCS && (finalPCS.has(10) || finalPCS.has(11))) return '13';
      return '6';
    case 10: return 'b7';
    case 11: return '7';
  }
  return '';
}

function pcNameForDetectedDegree(pc, degreeName) {
  if (degreeName && (degreeName.charAt(0) === 'b' || degreeName === 'm3')) return NOTE_NAMES_FLAT[pc];
  return NOTE_NAMES_SHARP[pc];
}

function pcNameForChordDegree(pc, rootName, degreeName) {
  if (!rootName || !degreeName) return pcNameForDetectedDegree(pc, degreeName);
  var letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var naturalPCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var rootLetter = rootName.charAt(0).toUpperCase();
  var rootIndex = letters.indexOf(rootLetter);
  if (rootIndex < 0) return pcNameForDetectedDegree(pc, degreeName);

  var stepByDegree = {
    '1': 0,
    'b9': 1, '9': 1, '#9': 1,
    'm3': 2, '3': 2,
    '4': 3, '11': 3, '#11': 3,
    'b5': 4, '5': 4, '#5': 4,
    '6': 5, '13': 5, 'b13': 5,
    'b7': 6, '7': 6
  };
  var step = stepByDegree[degreeName];
  if (step === undefined) return pcNameForDetectedDegree(pc, degreeName);

  var letter = letters[(rootIndex + step) % 7];
  var natural = naturalPCS[letter];
  var diff = ((pc - natural + 18) % 12) - 6;
  if (diff === -2) return letter + 'bb';
  if (diff === -1) return letter + 'b';
  if (diff === 0) return letter;
  if (diff === 1) return letter + '#';
  if (diff === 2) return letter + '##';
  return pcNameForDetectedDegree(pc, degreeName);
}

function chordRootDisplayName(chordName) {
  var match = (chordName || '').match(/^[A-G](?:#|b)?/);
  return match ? match[0] : '';
}

function formatDetectedNoteDegreeSummary(notes, rootPC, chordName) {
  var sorted = notes.slice().sort(function(a, b) { return a - b; });
  if (rootPC === null || rootPC === undefined) {
    return {
      noteNames: sorted.map(function(n) { return NOTE_NAMES_SHARP[n % 12]; }),
      degreeNames: []
    };
  }
  var finalPCS = new Set(sorted.map(function(n) { return ((n % 12 - rootPC) + 12) % 12; }));
  var noteNames = [];
  var degreeNames = [];
  var rootName = chordRootDisplayName(chordName);
  sorted.forEach(function(n) {
    var pc = n % 12;
    var iv = ((pc - rootPC) + 12) % 12;
    var degreeName = detectedNoteDegreeName(iv, finalPCS, chordName);
    noteNames.push(iv === 0 ? (rootName || pcNameForDetectedDegree(pc, degreeName)) : pcNameForChordDegree(pc, rootName, degreeName));
    degreeNames.push(degreeName);
  });
  return { noteNames: noteNames, degreeNames: degreeNames };
}

function formatDetectedNoteDegreeText(notes, rootPC, chordName) {
  var summary = formatDetectedNoteDegreeSummary(notes, rootPC, chordName);
  var text = 'Note: ' + summary.noteNames.join(' ');
  if (summary.degreeNames.length) text += '  Degree: ' + summary.degreeNames.join(' ');
  return text;
}

function detectedUstBaseQuality(chordName) {
  var chord = chordName || '';
  var rootMatch = chord.match(/^[A-G](?:#|b)?/);
  var quality = rootMatch ? chord.slice(rootMatch[0].length) : chord;
  var isMinor = /^m/i.test(quality) && !/^maj/i.test(quality);
  var isHalfDiminished = /^(m7\((?:b5|\u266D5)|m7b5|m7-5|\u00F87|\u00F8)/i.test(quality);
  var hasMajorSeventh = quality.indexOf('\u25B37') !== -1 || /maj7/i.test(quality);
  var hasExplicitSeventh = quality.indexOf('7') !== -1;
  var isSuspended = /^sus/i.test(quality);
  var isDiminishedOrAugmented = /^(?:dim|aug|\+|\u00F8|\u00B0)/i.test(quality);
  var isMajorSixFamily = /^(?:maj)?6(?:\/?9|\.9|\(|$)/i.test(quality);
  var isMinorSixFamily = /^m6(?:\/?9|\.9|\(|$)/i.test(quality);
  var impliesDominantSeventh = /^(9|11|13)(\(|$)/.test(quality);
  var impliesMinorSeventh = /^(m9|m11|m13|min9|min11|min13)(\(|$)/i.test(quality);
  var hasSeventhExtension = hasExplicitSeventh || impliesDominantSeventh || impliesMinorSeventh;
  if (isHalfDiminished) return 'm7(b5)';
  if (!isMinor && isMajorSixFamily) return '6';
  if (isMinor && isMinorSixFamily) return 'm6';
  if (isMinor && hasMajorSeventh) return 'm\u25B37';
  if (isMinor && hasSeventhExtension) return 'm7';
  if (hasMajorSeventh) return '\u25B37';
  if (hasSeventhExtension) return '7';
  if (isSuspended || isDiminishedOrAugmented) return '';
  if (isMinor) return 'm';
  if (quality === '' || /^add/i.test(quality) || /^\(/.test(quality)) return 'major';
  return '';
}

function detectedUstTriadRootName(rootPC, triadRoot, chordName) {
  var interval = ((triadRoot - rootPC) + 12) % 12;
  var rootName = chordRootDisplayName(chordName);
  if (rootName.indexOf('b') !== -1) return NOTE_NAMES_FLAT[triadRoot];
  if (rootName.indexOf('#') !== -1) return NOTE_NAMES_SHARP[triadRoot];
  return (interval === 1 || interval === 3 || interval === 6 || interval === 8 || interval === 10)
    ? NOTE_NAMES_FLAT[triadRoot]
    : NOTE_NAMES_SHARP[triadRoot];
}

function detectedUstTriadAvailable(pcs, rootPC, offset, quality) {
  var intervals = DETECTED_UST_QUALITIES[quality]
    ? DETECTED_UST_QUALITIES[quality].intervals
    : (quality === 'm' ? [0, 3, 7] : [0, 4, 7]);
  var triadRoot = (rootPC + offset) % 12;
  return intervals.every(function(iv) {
    return pcs.has((triadRoot + iv) % 12);
  });
}

function detectedUstQuartalAvailable(notes, rootPC, offset) {
  var pcs = [offset, offset + 5, offset + 10].map(function(iv) { return (rootPC + iv) % 12; });
  var sorted = notes.slice().sort(function(a, b) { return a - b; });
  for (var i = 0; i < sorted.length; i++) {
    if (((sorted[i] % 12) + 12) % 12 !== pcs[0]) continue;
    for (var j = 0; j < sorted.length; j++) {
      if (sorted[j] <= sorted[i]) continue;
      if (((sorted[j] % 12) + 12) % 12 !== pcs[1]) continue;
      var gap1 = sorted[j] - sorted[i];
      if (gap1 !== 5 && gap1 !== 17) continue;
      for (var k = 0; k < sorted.length; k++) {
        if (sorted[k] <= sorted[j]) continue;
        if (((sorted[k] % 12) + 12) % 12 !== pcs[2]) continue;
        var gap2 = sorted[k] - sorted[j];
        if (gap2 === 5 || gap2 === 17) return true;
      }
    }
  }
  return false;
}

var DETECTED_UST_QUALITIES = {
  major: { suffix: '\u25B3', intervals: [0, 4, 7] },
  m: { suffix: 'm', intervals: [0, 3, 7] },
  q: { suffix: 'Q', intervals: [0, 5, 10], quartal: true }
};

var DETECTED_UST_RULES = {
  '7': [
    // Standard dominant USTs over a 3+b7 shell. bII major is intentionally
    // excluded: it includes the natural 11 against the dominant 3rd and is
    // better treated as an advanced side-slip color, not a default label.
    { offset: 2, quality: 'q' },      // Q2: 9, 5, R
    { offset: 3, quality: 'q' },      // Qb3: #9, b13, b9
    { offset: 4, quality: 'q' },      // Q3: 3, 13, 9
    { offset: 8, quality: 'q' },      // Qb6: b13, b9, #11
    { offset: 9, quality: 'q' },      // Q6: 13, 9, 5
    { offset: 2, quality: 'major' },  // II: 9, #11, 13
    { offset: 3, quality: 'major' },  // bIII: #9, 5, b7
    { offset: 6, quality: 'major' },  // bV: #11, b7, b9
    { offset: 8, quality: 'major' },  // bVI: b13, R, #9
    { offset: 9, quality: 'major' },  // VI: 13, b9, 3
    { offset: 1, quality: 'm', forbid: [5] }, // bIIm: b9, 3, b13
    { offset: 2, quality: 'm' },      // IIm: 9, 11, 13
    { offset: 7, quality: 'm' }       // Vm: 5, b7, 9
  ],
  '\u25B37': [
    { offset: 2, quality: 'q' },      // Q2: 9, 5, R
    { offset: 4, quality: 'q' },      // Q3: 3, 13, 9
    { offset: 9, quality: 'q' },      // Q6: 13, 9, 5
    { offset: 11, quality: 'q' },     // Q7: 7, 3, 13
    { offset: 7, quality: 'major' },  // V: 5, 7, 9
    { offset: 4, quality: 'major' },  // III: 3, #5, 7
    { offset: 2, quality: 'major' },  // II: 9, #11, 13
    { offset: 11, quality: 'm' }      // VIIm: 7, 9, #11
  ],
  'major': [
    { offset: 2, quality: 'q' },      // Q2: 9, 5, R
    { offset: 4, quality: 'q' },      // Q3: 3, 13, 9
    { offset: 9, quality: 'q' },      // Q6: 13, 9, 5
    { offset: 11, quality: 'q' }      // Q7: 7, 3, 13
  ],
  'm7': [
    { offset: 0, quality: 'q' },      // Q1: R, 11, b7
    { offset: 2, quality: 'q' },      // Q2: 9, 5, R
    { offset: 5, quality: 'q' },      // Q4: 11, b7, m3
    { offset: 7, quality: 'q' },      // Q5: 5, R, 11
    { offset: 2, quality: 'm' },      // IIm: 9, 11, 13
    { offset: 10, quality: 'major' }, // bVII: b7, 9, 11
    { offset: 7, quality: 'm' },      // Vm: 5, b7, 9
    { offset: 5, quality: 'major' }   // IV: 11, 13, R
  ],
  'm': [
    { offset: 2, quality: 'q' },      // Q2: 9, 5, R
    { offset: 5, quality: 'q' },      // Q4: 11, b7, m3
    { offset: 7, quality: 'q' },      // Q5: 5, R, 11
    { offset: 10, quality: 'q' }      // Qb7: b7, m3, b13
  ],
  'm6': [
    { offset: 5, quality: 'major' },  // IV: 11, 13, R
    { offset: 7, quality: 'major' }   // V: 5, 7, 9
  ],
  'm7(b5)': [
    { offset: 0, quality: 'q' },      // Q1: R, 11, b7
    { offset: 5, quality: 'q' },      // Q4: 11, b7, m3
    { offset: 10, quality: 'q' },     // Qb7: b7, m3, b13
    { offset: 10, quality: 'major' }, // bVII: b7, 9, 11
    { offset: 8, quality: 'major' }   // bVI: b13, R, m3
  ],
  '6': [
    { offset: 2, quality: 'major' }   // II over C6: 9, #11, 13
  ]
};

function detectedUstHasShellContext(intervals, baseQuality) {
  if (baseQuality === '7') return intervals.has(4) && intervals.has(10) && !intervals.has(11);
  if (baseQuality === '\u25B37') return intervals.has(4) && intervals.has(11) && !intervals.has(10);
  if (baseQuality === 'major') return intervals.has(0) && intervals.has(4) && intervals.has(7);
  if (baseQuality === 'm7') return intervals.has(3) && intervals.has(10) && !intervals.has(11);
  if (baseQuality === 'm') return intervals.has(0) && intervals.has(3) && intervals.has(7);
  if (baseQuality === 'm6') return intervals.has(3) && intervals.has(9);
  if (baseQuality === 'm7(b5)') return intervals.has(3) && intervals.has(6) && intervals.has(10) && !intervals.has(11);
  if (baseQuality === '6') return intervals.has(4) && intervals.has(9);
  return false;
}

function detectedUstDictionaryCandidate(notes, pcs, rootPC, intervals, baseQuality) {
  if (!detectedUstHasShellContext(intervals, baseQuality)) return null;
  var rules = DETECTED_UST_RULES[baseQuality];
  if (!rules) return null;
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (rule.forbid && rule.forbid.some(function(iv) { return intervals.has(iv); })) continue;
    var quality = DETECTED_UST_QUALITIES[rule.quality];
    var available = quality && quality.quartal
      ? detectedUstQuartalAvailable(notes, rootPC, rule.offset)
      : detectedUstTriadAvailable(pcs, rootPC, rule.offset, rule.quality);
    if (available) {
      if (detectedUstTensionLabels(rule.offset, quality, baseQuality).length < 1) continue;
      return {
        triadRoot: (rootPC + rule.offset) % 12,
        quality: quality,
        offset: rule.offset
      };
    }
  }
  return null;
}

function detectedUstTensionLabels(offset, quality, baseQuality) {
  var intervals = quality.intervals.map(function(iv) { return (offset + iv) % 12; });
  var degreeNames = {
    0: '1',
    1: 'b9',
    2: '9',
    3: baseQuality === 'm' || baseQuality === 'm7' || baseQuality === 'm6' || baseQuality === 'm7(b5)' ? 'm3' : '#9',
    4: '3',
    5: '11',
    6: '#11',
    7: '5',
    9: baseQuality === '6' ? '6' : '13',
    10: 'b7',
    11: '7'
  };
  degreeNames[8] = baseQuality === '\u25B37' ? '#5' : 'b13';
  var seen = {};
  var labels = [];
  intervals.forEach(function(iv) {
    var label = degreeNames[iv];
    if (label && !seen[label]) {
      seen[label] = true;
      labels.push(label);
    }
  });
  return labels;
}

function detectedUstQuartalName(offset) {
  var names = ['Q1', 'Qb2', 'Q2', 'Qb3', 'Q3', 'Q4', 'Qb5', 'Q5', 'Qb6', 'Q6', 'Qb7', 'Q7'];
  return names[((offset % 12) + 12) % 12] || 'Q';
}

function detectedUstBaseQualitySuffix(baseQuality) {
  if (baseQuality === 'major') return '';
  if (baseQuality === 'm') return 'm';
  return baseQuality;
}

function formatDetectedUstUpperName(rootPC, chordName, candidate, baseQuality) {
  var offset = candidate.offset !== undefined ? candidate.offset : ((candidate.triadRoot - rootPC + 12) % 12);
  var name = candidate.quality.quartal
    ? detectedUstQuartalName(offset)
    : detectedUstTriadRootName(rootPC, candidate.triadRoot, chordName) + candidate.quality.suffix;
  var labels = detectedUstTensionLabels(offset, candidate.quality, baseQuality);
  return labels.length ? name + ' [' + labels.join(',') + ']' : name;
}

function formatDetectedUstText(notes, rootPC, chordName) {
  if (rootPC === null || rootPC === undefined || !notes || notes.length < 4) return '';
  var pcs = new Set(notes.map(function(n) { return ((n % 12) + 12) % 12; }));
  var baseQuality = detectedUstBaseQuality(chordName);
  if (!baseQuality) return '';
  var intervals = new Set(notes.map(function(n) { return (((n % 12) - rootPC) + 12) % 12; }));
  var dictionary = detectedUstDictionaryCandidate(notes, pcs, rootPC, intervals, baseQuality);
  if (dictionary) {
    var dictionaryBase = (chordRootDisplayName(chordName) || NOTE_NAMES_SHARP[rootPC]) + detectedUstBaseQualitySuffix(baseQuality);
    return 'UST: ' + formatDetectedUstUpperName(rootPC, chordName, dictionary, baseQuality) + ' / ' + dictionaryBase;
  }
  if (DETECTED_UST_RULES[baseQuality]) return '';
  var hasThird = intervals.has(3) || intervals.has(4);
  var hasSeventh = intervals.has(10) || intervals.has(11);
  if (!hasThird) return '';
  var qualities = [
    { suffix: '\u25B3', intervals: [0, 4, 7] },
    { suffix: 'm', intervals: [0, 3, 7] }
  ];
  if (!hasSeventh) return '';
  var fallbackPriority = { 2: 10, 3: 9, 8: 8, 9: 7, 10: 6, 5: 5, 1: 4, 6: 3, 7: 2, 11: 1 };
  var best = null;
  for (var offset = 1; offset < 12; offset++) {
    var triadRoot = (rootPC + offset) % 12;
    if (triadRoot === rootPC) continue;
    for (var q = 0; q < qualities.length; q++) {
      var quality = qualities[q];
      var ok = quality.intervals.every(function(iv) {
        return pcs.has((triadRoot + iv) % 12);
      });
      if (ok) {
        var triadOffsets = quality.intervals.map(function(iv) { return (offset + iv) % 12; });
        var tensionCount = triadOffsets.filter(function(iv) {
          return iv === 1 || iv === 2 || iv === 3 || iv === 5 || iv === 6 || iv === 8 || iv === 9;
        }).length;
        var chordToneCount = triadOffsets.filter(function(iv) {
          return iv === 0 || iv === 4 || iv === 7 || iv === 10 || iv === 11;
        }).length;
        if (tensionCount < 2) continue;
        var score = tensionCount * 100 - chordToneCount * 10 + (fallbackPriority[offset] || 0);
        var candidate = { score: score, triadRoot: triadRoot, quality: quality, offset: offset };
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
  }
  if (best) {
    var bestOffset = best.offset !== undefined ? best.offset : ((best.triadRoot - rootPC + 12) % 12);
    var bestThirdOffset = (bestOffset + (best.quality.suffix === '\u25B3' ? 4 : 3)) % 12;
    var majorThirdAsFlatNine = best.quality.suffix === '\u25B3' && ((bestOffset + 4) % 12) === 1;
    var sameRootMinorAvailable = pcs.has(best.triadRoot)
      && pcs.has((best.triadRoot + 3) % 12)
      && pcs.has((best.triadRoot + 7) % 12);
    if (baseQuality !== '7' && majorThirdAsFlatNine && sameRootMinorAvailable) best.quality = qualities[1];
    var base = (chordRootDisplayName(chordName) || NOTE_NAMES_SHARP[rootPC]) + baseQuality;
    return 'UST: ' + formatDetectedUstUpperName(rootPC, chordName, best, baseQuality) + ' / ' + base;
  }
  return '';
}

function formatDetectedUstFractionHtml(ustText) {
  if (!ustText) return '';
  var text = ustText.replace(/^UST:\s*/, '');
  var parts = text.split(' / ');
  if (parts.length !== 2) return '<span style="color:#d7ba7d;">' + ustText + '</span>';
  return '<span style="display:inline-flex;align-items:center;gap:4px;vertical-align:middle;color:#d7ba7d;margin-left:6px;">'
    + '<span style="font-size:0.68em;letter-spacing:0.04em;">UST</span>'
    + '<span style="display:inline-flex;flex-direction:column;align-items:center;line-height:1;">'
    + '<span style="font-size:0.82em;padding:0 3px 1px;border-bottom:1px solid currentColor;">' + parts[0] + '</span>'
    + '<span style="font-size:0.82em;padding-top:1px;">' + parts[1] + '</span>'
    + '</span></span>';
}

function formatDetectedUstInlineHtml(notes, rootPC, chordName) {
  return formatDetectedUstFractionHtml(formatDetectedUstText(notes, rootPC, chordName));
}

function midiNote(row, col) { return baseMidi() + row * ROW_INTERVAL + col * COL_INTERVAL; }
function pitchClass(midi) { return padPitchClass(midi); }
function noteName(midi) { return pcName(pitchClass(midi)) + (Math.floor(midi / 12) - 2); }

// ======== TENSION APPLICATION — Adapter to pad-core ========
function applyTension(basePCS, mods) {
  return padApplyTension(basePCS, mods);
}

// ======== GET ACTIVE PCS FOR CHORD BUILDER ========
function getBuilderPCS() {
  if (BuilderState.root === null || !BuilderState.quality) return null;
  let pcs = [...BuilderState.quality.pcs];
  if (BuilderState.tension) pcs = applyTension(pcs, BuilderState.tension.mods);
  return pcs;
}

function _chordContextKey() {
  return padChordContextKey(BuilderState.root, AppState.scaleIdx, AppState.key);
}

function getBuilderChordName() {
  return padGetBuilderChordName(BuilderState.root, BuilderState.quality, BuilderState.tension, BuilderState.bass, AppState.scaleIdx, AppState.key);
}

// ======== DRAW BOUNDING BOXES HELPER ========
function drawVoicingBoxes(svg, vpArray, strokeColor, badgeColor, dupSet, cycleableSet) {
  const hasSelection = VoicingState.selectedBoxIdx !== null;
  vpArray.forEach((vp, idx) => {
    const sel = VoicingState.selectedBoxIdx === idx;
    // Hide non-selected boxes when one is selected
    if (hasSelection && !sel) return;
    const isCycleable = cycleableSet && cycleableSet.has(idx);
    // Dashed bounding frame removed (too noisy; #13 position-preservation becomes moot).
    // Each voicing is marked only by its A/B/C/D badge on the bass pad; selection is shown by
    // the inverted (white) badge + the pads staying lit while non-selected pads dim.
    // Badge
    const bassPos = vp.positions[0];
    const bsz = isCycleable ? 28 : 20;
    const bX = MARGIN + bassPos.col * (PAD_SIZE + PAD_GAP);
    const bY = MARGIN + (ROWS - 1 - bassPos.row) * (PAD_SIZE + PAD_GAP);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.style.cursor = 'pointer';
    g.addEventListener('click', () => selectVoicingBox(idx));
    const br = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    br.setAttribute('x', bX); br.setAttribute('y', bY);
    br.setAttribute('width', bsz); br.setAttribute('height', bsz);
    br.setAttribute('rx', 4);
    br.setAttribute('fill', sel ? '#fff' : 'rgba(0,0,0,0.72)');
    br.setAttribute('stroke', 'rgba(255,255,255,0.75)');
    br.setAttribute('stroke-width', 1);
    br.setAttribute('opacity', '0.9');
    g.appendChild(br);
    const bt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    bt.setAttribute('x', bX + bsz / 2); bt.setAttribute('y', bY + bsz / 2 + 1);
    bt.setAttribute('text-anchor', 'middle'); bt.setAttribute('dominant-baseline', 'middle');
    bt.setAttribute('fill', sel ? '#000' : '#fff');
    bt.setAttribute('font-weight', '800');
    const boxLetter = String.fromCharCode(65 + idx); // A, B, C, ...
    if (isCycleable && sel) {
      const box = VoicingState.lastBoxes[idx];
      bt.setAttribute('font-size', '11px');
      bt.textContent = boxLetter + (box.currentAlt + 1) + '/' + box.alternatives.length;
    } else {
      bt.setAttribute('font-size', '14px');
      bt.textContent = boxLetter;
    }
    g.appendChild(bt);
    svg.appendChild(g);
  });
}

// ========================================
// DIATONIC CHORD BAR
// ========================================

// T/SD/D harmonic function mapping per scale family
// 'T'=tonic, 'SD'=subdominant, 'D'=dominant
// Source: urinami-san's harmonic function classification (2026-03-22)
var HARMONIC_FN_BASES = {
  major: ['T','SD','T','SD','D','T','D'],   // I=T ii=SD iii=T(代理) IV=SD V=D vi=T(代理) vii=D(代理)
  nm:    ['T','SD','T','SD','D','SD','SD'],  // i=T ii=SD(代理) ♭III=T(代理) iv=SD v=D ♭VI=SD(代理) ♭VII=SD(代理)
  hm:    ['T','SD','T','SD','D','SD','D'],   // i=T ii=SD(代理) ♭III=T(代理) iv=SD V=D ♭VI=SD(代理) vii=D(代理)
  mm:    ['T','SD','T','SD','D','T','D'],    // i=T ii=SD(代理) ♭III=T(代理) IV=SD V=D vi=T(代理) vii=D(代理)
};

function getHarmonicFunction(scaleIdx, degreeIdx) {
  if (degreeIdx < 0 || degreeIdx >= 7) return null;
  var scale = SCALES[scaleIdx];
  if (!scale || scale.pcs.length !== 7) return null;
  var cat = scale.cat;
  var num = scale.num; // 1-based mode number within family
  var base, offset;
  if (cat === '○') {
    // Major family — NM (Aeolian, idx 5) overrides with its own TSD
    if (scaleIdx === 5) { base = HARMONIC_FN_BASES.nm; offset = 0; }
    else { base = HARMONIC_FN_BASES.major; offset = num - 1; }
  } else if (cat === '■') {
    base = HARMONIC_FN_BASES.hm; offset = num - 1;
  } else if (cat === '◆') {
    base = HARMONIC_FN_BASES.mm; offset = num - 1;
  } else {
    return null; // Non-diatonic scales (pentatonic, blues, etc.)
  }
  return base[(degreeIdx + offset) % 7];
}

function noteNameForKey(pc, key) {
  return padNoteNameForKey(pc, key);
}

function getDiatonicTetrads(scalePCS, key, noteCount) {
  return padGetDiatonicTetrads(scalePCS, key, noteCount);
}

function toggleDiatonicMode() {
  AppState.diatonicMode = AppState.diatonicMode === 'tetrad' ? 'triad' : 'tetrad';
  renderDiatonicBar();
  saveAppSettings();
}

function renderDiatonicBar() {
  const bar = document.getElementById('diatonic-bar');
  if (!bar) return;
  var extTogglesEl = document.getElementById('diatonic-ext-toggles');
  var extContainerEl = document.getElementById('diatonic-ext');
  var keyDisplayOff = false;
  try {
    var sectionState = JSON.parse(localStorage.getItem('64pad-sections') || '{}');
    keyDisplayOff = AppState.mode === 'chord' && sectionState.key === false;
  } catch(_) {}
  if (keyDisplayOff) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    if (extTogglesEl) extTogglesEl.style.display = 'none';
    if (extContainerEl) {
      extContainerEl.innerHTML = '';
      extContainerEl.style.display = 'none';
    }
    return;
  }
  if (AppState.mode === 'input') {
    bar.style.display = 'none';
    bar.innerHTML = '';
    if (extTogglesEl) extTogglesEl.style.display = 'none';
    if (extContainerEl) {
      extContainerEl.innerHTML = '';
      extContainerEl.style.display = 'none';
    }
    return;
  }
  // Diatonic bar stays visible in chord mode for quick chord switching
  const scale = SCALES[AppState.scaleIdx];
  if (scale.pcs.length !== 7) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    if (extTogglesEl) extTogglesEl.style.display = 'none';
    if (extContainerEl) {
      extContainerEl.innerHTML = '';
      extContainerEl.style.display = 'none';
    }
    return;
  }
  bar.style.display = 'flex';
  const noteCount = AppState.diatonicMode === 'triad' ? 3 : 4;
  const tetrads = getDiatonicTetrads(scale.pcs, AppState.key, noteCount);
  bar.innerHTML = '';
  // Segment toggle (3 | 4)
  const wrap = document.createElement('div');
  wrap.className = 'diatonic-toggle-wrap';
  [3, 4].forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'diatonic-toggle-btn' + (noteCount === n ? ' active' : '');
    btn.textContent = n;
    btn.onclick = () => { AppState.diatonicMode = n === 3 ? 'triad' : 'tetrad'; renderDiatonicBar(); saveAppSettings(); };
    wrap.appendChild(btn);
  });
  bar.appendChild(wrap);
  tetrads.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'diatonic-btn';
    // Highlight if current chord matches this diatonic chord
    if (AppState.mode === 'chord' && BuilderState.root === t.rootPC && BuilderState.quality &&
        BuilderState.quality.name === t.quality.name && !BuilderState.tension) {
      btn.classList.add('active');
    }
    // T/SD/D harmonic function coloring
    if (AppState.showHarmonicFn) {
      var fn = getHarmonicFunction(AppState.scaleIdx, i);
      if (fn === 'T') btn.classList.add('fn-tonic');
      else if (fn === 'SD') btn.classList.add('fn-subdominant');
      else if (fn === 'D') btn.classList.add('fn-dominant');
    }
    btn.innerHTML = '<span class="dia-num">' + (i + 1) + '</span><div>' + t.chordName + '</div><div class="degree">' + t.degree + '</div>';
    btn.onclick = () => onDiatonicClick(t, i);
    bar.appendChild(btn);
  });

  // Extension toggles + bars
  var extToggles = document.getElementById('diatonic-ext-toggles');
  var extContainer = document.getElementById('diatonic-ext');
  if (!extToggles || !extContainer) return;
  extContainer.innerHTML = '';
  extContainer.style.display = 'block';

  // Determine if current scale is one of the 3 minor types
  var isMinorVariant = [5, 7, 14].indexOf(AppState.scaleIdx) !== -1;
  var isMajorDiatonic = AppState.scaleIdx === 0; // Ionian (Major)

  // Show/hide toggles (always show for 7-note scales)
  extToggles.style.display = 'flex';

  // Show/hide minor-specific toggle (also visible for major key → relative minor 3 types)
  var minorBtn = document.getElementById('ext-minor-btn');
  if (minorBtn) {
    minorBtn.style.display = (isMinorVariant || isMajorDiatonic) ? '' : 'none';
    minorBtn.textContent = isMajorDiatonic ? t('diatonic.relative') : t('diatonic.harm_mel');
  }

  // Update toggle button states
  if (minorBtn) minorBtn.classList.toggle('active', AppState.showMinorVariants);
  var secdomBtn = document.getElementById('ext-secdom-btn');
  if (secdomBtn) secdomBtn.classList.toggle('active', AppState.showSecDom);
  var parallelBtn = document.getElementById('ext-parallel-btn');
  if (parallelBtn) parallelBtn.classList.toggle('active', AppState.showParallelKey);
  var fnBtn = document.getElementById('ext-fn-btn');
  if (fnBtn) fnBtn.classList.toggle('active', AppState.showHarmonicFn);

  // Render extension bars
  if (AppState.showMinorVariants && (isMinorVariant || isMajorDiatonic)) {
    _renderMinorVariants(extContainer, noteCount, isMajorDiatonic);
  }
  if (AppState.showParallelKey) {
    _renderParallelKey(extContainer, noteCount);
  }
  if (AppState.showSecDom) {
    _renderSecondaryDominants(extContainer, tetrads);
  }
}

function toggleBadges(on) {
  AppState.showBadges = typeof on === 'boolean' ? on : !AppState.showBadges;
  document.body.classList.toggle('hide-badges', !AppState.showBadges);
  var toggles = document.querySelectorAll('[data-view-setup-badges]');
  toggles.forEach(function(input) { input.checked = AppState.showBadges !== false; });
  saveAppSettings();
}

function toggleMinorVariants() {
  AppState.showMinorVariants = !AppState.showMinorVariants;
  renderDiatonicBar();
  saveAppSettings();
}
function toggleSecDom() {
  AppState.showSecDom = !AppState.showSecDom;
  renderDiatonicBar();
  saveAppSettings();
}
function toggleParallelKey() {
  AppState.showParallelKey = !AppState.showParallelKey;
  renderDiatonicBar();
  saveAppSettings();
}
function toggleHarmonicFn() {
  AppState.showHarmonicFn = !AppState.showHarmonicFn;
  renderDiatonicBar();
  saveAppSettings();
}

// --- Extension bar helpers ---

function _createExtBar(container, label, tetrads, isCurrent, scaleIdx) {
  var row = document.createElement('div');
  row.className = 'diatonic-ext-bar' + (isCurrent ? ' current' : '');
  var lbl = document.createElement('div');
  lbl.className = 'ext-label';
  lbl.textContent = label;
  row.appendChild(lbl);
  tetrads.forEach(function(t, i) {
    var btn = document.createElement('button');
    btn.className = 'diatonic-btn';
    if (AppState.showHarmonicFn && scaleIdx !== undefined) {
      var fn = getHarmonicFunction(scaleIdx, i);
      if (fn === 'T') btn.classList.add('fn-tonic');
      else if (fn === 'SD') btn.classList.add('fn-subdominant');
      else if (fn === 'D') btn.classList.add('fn-dominant');
    }
    btn.innerHTML = '<span class="dia-num">' + (i + 1) + '</span><div>' + t.chordName + '</div><div class="degree">' + t.degree + '</div>';
    btn.onclick = function() { onDiatonicClick(t, i); };
    row.appendChild(btn);
  });
  container.appendChild(row);
}

function _renderMinorVariants(container, noteCount, fromMajor) {
  // From major key: show relative minor (平行調) 3 types — e.g., C Major → Am NM/HM/MM
  // From minor key: NM is already in main bar — only show HM and MM at same root
  if (fromMajor) {
    var relMinorRoot = (AppState.key + 9) % 12; // relative minor root (平行調)
    var minorScales = [
      { idx: 5, label: 'NM' },
      { idx: 7, label: 'HM' },
      { idx: 14, label: 'MM' },
    ];
    minorScales.forEach(function(s) {
      var tetrads = getDiatonicTetrads(SCALES[s.idx].pcs, relMinorRoot, noteCount);
      _createExtBar(container, s.label, tetrads, false, s.idx);
    });
  } else {
    var minorScales = [
      { idx: 7, label: 'HM' },
      { idx: 14, label: 'MM' },
    ];
    minorScales.forEach(function(s) {
      var tetrads = getDiatonicTetrads(SCALES[s.idx].pcs, AppState.key, noteCount);
      _createExtBar(container, s.label, tetrads, AppState.scaleIdx === s.idx, s.idx);
    });
  }
}

function _renderSecondaryDominants(container, mainTetrads) {
  var row = document.createElement('div');
  row.className = 'diatonic-ext-bar';
  var lbl = document.createElement('div');
  lbl.className = 'ext-label';
  lbl.textContent = 'V7/';
  row.appendChild(lbl);

  // Find dominant 7th quality from BUILDER_QUALITIES
  var dom7quality = null;
  for (var r = 0; r < BUILDER_QUALITIES.length; r++) {
    for (var c = 0; c < BUILDER_QUALITIES[r].length; c++) {
      var q = BUILDER_QUALITIES[r][c];
      if (q && q.name === '7') { dom7quality = q; break; }
    }
    if (dom7quality) break;
  }
  if (!dom7quality) return;

  var parentKey = padGetParentMajorKey(0, AppState.key);

  // Build scale PCS set for checking if secdom root is diatonic
  var scalePCS = SCALES[AppState.scaleIdx].pcs;
  var scaleAbsSet = {};
  for (var si = 0; si < scalePCS.length; si++) {
    scaleAbsSet[(scalePCS[si] + AppState.key) % 12] = true;
  }
  var isMinorScale = [5, 7, 14].indexOf(AppState.scaleIdx) !== -1;

  mainTetrads.forEach(function(t, i) {
    var btn = document.createElement('button');
    btn.className = 'diatonic-btn';
    var secDomRoot = (t.rootPC + 7) % 12;

    // Skip conditions:
    // 1. Tonic (i=0): V7→I is the primary dominant, not secondary
    // 2. SecDom root must be on the diatonic scale (definition requirement)
    var skip = (i === 0) ||
               !scaleAbsSet[secDomRoot];      // root not in diatonic scale

    if (skip) {
      btn.classList.add('secdom-empty');
      btn.innerHTML = '<div>—</div>';
    } else {
      var chordName = KEY_SPELLINGS[parentKey][secDomRoot] + '7';
      // Compute degree: interval from key root
      var interval = ((secDomRoot - AppState.key) + 12) % 12;
      var MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
      var ROMAN = ['I','II','III','IV','V','VI','VII'];
      var degreeIdx2 = MAJOR_INTERVALS.indexOf(interval);
      var degree;
      if (degreeIdx2 !== -1) {
        degree = ROMAN[degreeIdx2] + '7';
      } else {
        // Flatted degree
        var sharpIdx = MAJOR_INTERVALS.indexOf(interval + 1);
        if (sharpIdx !== -1) {
          degree = 'b' + ROMAN[sharpIdx] + '7';
        } else {
          degree = '?7';
        }
      }
      var targetQuality = t.quality; // resolution target quality
      btn.innerHTML = '<div>' + chordName + '</div><div class="degree">' + degree + '</div>';
      btn.onclick = function() {
        // Set flags BEFORE onDiatonicClick (which calls render → renderParentScales)
        BuilderState._fromSecDom = true;
        BuilderState._secDomTargetIsMajor = targetQuality.name.indexOf('m') !== 0;
        AppState.psSortMode = 'practical';
        AppState.showParentScales = true;
        var psBtn = document.getElementById('ps-toggle');
        if (psBtn) psBtn.classList.add('active');
        onDiatonicClick({ rootPC: secDomRoot, pcs: dom7quality.pcs, quality: dom7quality, chordName: chordName, degree: degree }, i);
        // onDiatonicClick sets _fromDiatonic=true, override after
        BuilderState._fromDiatonic = false;
      };
    }
    row.appendChild(btn);
  });
  container.appendChild(row);
}

function _renderParallelKey(container, noteCount) {
  var isMinor = [5, 7, 14].indexOf(AppState.scaleIdx) !== -1;
  // Also treat all ○ modes as major-side, ■/◆ as minor-side
  if (!isMinor && AppState.scaleIdx >= 0 && AppState.scaleIdx <= 6) {
    // Major side → show natural minor
    var tetrads = getDiatonicTetrads(SCALES[5].pcs, AppState.key, noteCount);
    var keyName = KEY_SPELLINGS[padGetParentMajorKey(0, AppState.key)][AppState.key];
    _createExtBar(container, keyName + 'm', tetrads, false, 5);
  } else if (isMinor) {
    // Minor side → show major
    var tetrads = getDiatonicTetrads(SCALES[0].pcs, AppState.key, noteCount);
    var keyName = KEY_SPELLINGS[padGetParentMajorKey(0, AppState.key)][AppState.key];
    _createExtBar(container, keyName, tetrads, false, 0);
  }
}

// ========================================
// PARENT SCALE REVERSE LOOKUP
// ========================================

function fifthsDistance(key1, key2) {
  return padFifthsDistance(key1, key2);
}

// DIATONIC_CHORD_DB, psKeyName, getParentScaleAbsPCS, psDegreeLabel — from pad-core

function findParentScales(rootPC, chordIntervals, currentKey) {
  return padFindParentScales(rootPC, chordIntervals, currentKey);
}

function onDiatonicClick(tetrad, degreeIdx) {
  // Switch to Chord mode (direct manipulation to preserve builder state)
  AppState.mode = 'chord';
  document.getElementById('mode-scale').classList.toggle('active', false);
  document.getElementById('mode-chord').classList.toggle('active', true);
  document.getElementById('mode-input').classList.toggle('active', false);
  document.getElementById('scale-panel').style.display = 'none';
  document.getElementById('chord-panel').style.display = '';
  document.getElementById('input-panel').style.display = 'none';

  if (typeof disableTasty === 'function') disableTasty(true);
  if (typeof disableStock === 'function') disableStock();
  if (typeof disableGuitarEngine === 'function') disableGuitarEngine({ render: false });

  // Set builder state (preserve _fromSecDom if already set)
  if (!BuilderState._fromSecDom) {
    BuilderState._fromDiatonic = true;
  }
  BuilderState._diatonicScaleIdx = degreeIdx; // 0=Ionian, 1=Dorian, 2=Phrygian...
  BuilderState.root = tetrad.rootPC;
  BuilderState.quality = tetrad.quality;
  BuilderState.tension = null;
  BuilderState.bass = null;
  resetVoicingSelection();

  // Update builder UI
  updateKeyButtons();
  updateRootButtons();
  highlightQuality(tetrad.quality);
  clearTensionSelection();
  updateControlsForQuality(tetrad.quality);
  setBuilderStep(2);
  render();
  updateTastyUI();
  // Play the selected chord so picking from the diatonic bar previews its sound
  // (same as inversion/tension/voicing changes). うりなみさん 2026-05-29.
  if (typeof playCurrentChord === 'function') playCurrentChord();
}


// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  baseMidi, setOctaveShift, shiftOctave, shiftSemitone, updateOctaveLabel,
  pitchClass, noteName, midiNote,
  calcVoicingOffsets, getBassCase, applyOnChordBass,
  calcAllVoicingPositions, calcVoicingPositions,
  getShellIntervals, applyTension, getBuilderPCS,
  chordDegreeName, detectedChordQualityFlags, detectedNoteDegreeName,
  pcNameForDetectedDegree, pcNameForChordDegree,
  formatDetectedNoteDegreeSummary, formatDetectedNoteDegreeText,
  formatDetectedUstText, formatDetectedUstFractionHtml, formatDetectedUstInlineHtml,
  getDiatonicTetrads, getBuilderChordName,
  findParentScales, fifthsDistance, noteNameForKey,
};
