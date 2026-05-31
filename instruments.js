// ========================================
// GUITAR DIAGRAM
// ========================================
const DIAGRAM_WIDTH = 564;              // shared width for pad, guitar & piano (matches pad grid)
let showGuitar = false;
let showPiano = false;
let showStaff = false;
let showBass = false;
let showCircle = true;
let showSound = true;
let soundExpanded = true;
let guitarLabelMode = 'name'; // 'name' or 'degree'
let memoryViewMode = 'memory'; // 'memory' or 'perform'
let linkMode = false; // Link mode: pads momentary, all instruments sync live

function toggleLinkMode() {
  linkMode = !linkMode;
  var btn = document.getElementById('inst-toggle-link');
  if (btn) btn.classList.toggle('active', linkMode);
  if (linkMode) {
    applyLinkDim();
  } else {
    removeLinkDim();
    midiActiveNotes.clear();
    updateMidiDisplay();
  }
}

function applyLinkDim() {
  var NS = 'http://www.w3.org/2000/svg';
  ['pad-grid', 'piano-display', 'guitar-diagram', 'bass-diagram'].forEach(function(id) {
    var svg = document.getElementById(id);
    if (!svg || svg.querySelector('.link-dim')) return;
    var vb = svg.getAttribute('viewBox');
    if (!vb) return;
    var p = vb.split(' ');
    var dim = document.createElementNS(NS, 'rect');
    dim.setAttribute('x', p[0]); dim.setAttribute('y', p[1]);
    dim.setAttribute('width', p[2]); dim.setAttribute('height', p[3]);
    dim.setAttribute('fill', 'rgba(0,0,0,0.55)');
    dim.setAttribute('class', 'link-dim');
    dim.setAttribute('pointer-events', 'none');
    svg.appendChild(dim);
  });
}

function removeLinkDim() {
  document.querySelectorAll('.link-dim').forEach(function(el) { el.remove(); });
  document.querySelectorAll('.link-highlight').forEach(function(el) { el.remove(); });
}

function toggleSoundExpand() {
  soundExpanded = !soundExpanded;
  document.getElementById('sound-details').style.display = soundExpanded ? '' : 'none';
  document.getElementById('sound-expand-btn').innerHTML = soundExpanded ? '&#x25B2;' : '&#x25BC;';
}

function toggleMemoryView(mode) {
  memoryViewMode = mode;
  // Single Perform toggle: lit in Perform (play-only) view, off in Memory (edit) view.
  var tgl = document.getElementById('mem-perform-toggle');
  if (tgl) tgl.classList.toggle('active', mode === 'perform');
  // Clear perform active pad when switching away
  if (mode === 'memory') {
    PerformState.activePad = null;
  }
  updateMemorySlotUI();
}

// Single Perform toggle switch (replaces the old Memory|Perform two-button pair).
// OFF = Memory/edit view (tap selects+plays a slot; semitone/octave edits & re-saves it);
// ON  = Perform view (tap plays only — saved slots are never overwritten).
function togglePerformMode() {
  toggleMemoryView(memoryViewMode === 'perform' ? 'memory' : 'perform');
}

function toggleInstrument(which) {
  if (which === 'guitar') showGuitar = !showGuitar;
  if (which === 'bass') showBass = !showBass;
  if (which === 'piano') showPiano = !showPiano;
  if (which === 'sound') showSound = !showSound;
  document.getElementById('inst-toggle-guitar').classList.toggle('active', showGuitar);
  document.getElementById('inst-toggle-bass').classList.toggle('active', showBass);
  document.getElementById('inst-toggle-piano').classList.toggle('active', showPiano);
  document.getElementById('inst-toggle-sound').classList.toggle('active', showSound);
  document.getElementById('guitar-wrap').style.display = showGuitar ? '' : 'none';
  document.getElementById('bass-wrap').style.display = showBass ? '' : 'none';
  document.getElementById('piano-wrap-display').style.display = showPiano ? '' : 'none';
  document.getElementById('sound-controls').style.display = showSound ? '' : 'none';
  document.getElementById('guitar-label-btn').style.display = (showGuitar || showBass) ? '' : 'none';
  render();
  saveAppSettings();
}

function ensureInstrumentVisible(which) {
  if (which === 'guitar') showGuitar = true;
  if (which === 'bass') showBass = true;
  if (which === 'piano') showPiano = true;
  var guitarBtn = document.getElementById('inst-toggle-guitar');
  var bassBtn = document.getElementById('inst-toggle-bass');
  var pianoBtn = document.getElementById('inst-toggle-piano');
  var guitarWrap = document.getElementById('guitar-wrap');
  var bassWrap = document.getElementById('bass-wrap');
  var pianoWrap = document.getElementById('piano-wrap-display');
  var labelBtn = document.getElementById('guitar-label-btn');
  if (guitarBtn) guitarBtn.classList.toggle('active', showGuitar);
  if (bassBtn) bassBtn.classList.toggle('active', showBass);
  if (pianoBtn) pianoBtn.classList.toggle('active', showPiano);
  if (guitarWrap) guitarWrap.style.display = showGuitar ? '' : 'none';
  if (bassWrap) bassWrap.style.display = showBass ? '' : 'none';
  if (pianoWrap) pianoWrap.style.display = showPiano ? '' : 'none';
  if (labelBtn) labelBtn.style.display = (showGuitar || showBass) ? '' : 'none';
}

// Staff / Circle exclusive toggle (theory view — right panel)
function toggleTheoryView(which) {
  if (which === 'staff') {
    showStaff = !showStaff;
    if (showStaff) showCircle = false; // exclusive
  } else if (which === 'circle') {
    showCircle = !showCircle;
    if (showCircle) showStaff = false; // exclusive
  }
  document.getElementById('inst-toggle-staff').classList.toggle('active', showStaff);
  document.getElementById('inst-toggle-circle').classList.toggle('active', showCircle);
  document.getElementById('staff-area').style.display = showStaff ? '' : 'none';
  document.getElementById('circle-wrap').style.display = showCircle ? 'flex' : 'none';
  render();
  saveAppSettings();
}

function toggleGuitarLabelMode() {
  guitarLabelMode = guitarLabelMode === 'name' ? 'degree' : 'name';
  document.getElementById('guitar-label-btn').textContent = guitarLabelMode === 'name' ? t('label.note_name') : t('label.degree');
  render();
  saveAppSettings();
}

function renderGuitarDiagram(rootPC, pcsSet, bassPC, overlayPCS, overlayCharPCS, extraState) {
  const svg = document.getElementById('guitar-diagram');
  if (!pcsSet) pcsSet = new Set();
  const ivPcsSet = pcsSet.size > 0
    ? new Set([...pcsSet].map(pc => ((pc - rootPC) % 12 + 12) % 12))
    : null;
  const st = extraState || lastRenderState || {};
  const padLo = baseMidi();
  const padHi = padLo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);

  // Build ghost forms from guitar position groups
  let ghostForms = null;
  let curFretSet = null;
  if (GuitarPositionState.enabled && GuitarPositionState.groups.length > 0 &&
      !(typeof isGuitarEngineActive === 'function' && isGuitarEngineActive())) {
    const gGroup = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
    if (gGroup && gGroup.forms.length > 1) {
      curFretSet = new Set();
      for (let gs = 0; gs < 6; gs++) {
        if (guitarSelectedFrets[gs] !== null) curFretSet.add(gs * 100 + guitarSelectedFrets[gs]);
      }
      ghostForms = gGroup.forms.filter((_, fi) => fi !== GuitarPositionState.currentAltInGroup);
    }
  }

  // Label function: maps global state to pure function call
  const labelFn = function(pc, iv) {
    if (guitarLabelMode === 'degree') {
      return (AppState.mode === 'chord' && BuilderState.quality)
        ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet)
        : SCALE_DEGREE_NAMES[iv];
    }
    return pcName(pc);
  };

  padRenderFretboard(svg, {
    tuning: PAD_GUITAR_TUNING,
    stringNames: PAD_GUITAR_NAMES,
    rootPC: rootPC,
    pcsSet: pcsSet,
    bassPC: bassPC,
    overlayPCS: overlayPCS,
    overlayCharPCS: overlayCharPCS,
    renderState: st,
    positionState: GuitarPositionState,
    selectedFrets: guitarSelectedFrets,
    labelFn: labelFn,
    chordMode: AppState.mode === 'chord',
    solo: showGuitar && !showPiano,
    width: DIAGRAM_WIDTH,
    isMobile: _isMobile,
    isLandscape: _isLandscape,
    padRange: { lo: padLo, hi: padHi },
    onFretClick: toggleGuitarFret,
    ghostForms: ghostForms,
    currentFretSet: curFretSet,
    colorOff: AppState.colorOff,
  });
}

// ========================================
// BASS DIAGRAM
// ========================================
let bassSelectedFrets = [null, null, null, null];

function renderBassDiagram(rootPC, pcsSet, bassPC, overlayPCS, overlayCharPCS, extraState) {
  const svg = document.getElementById('bass-diagram');
  if (!svg) return;
  if (!pcsSet) pcsSet = new Set();
  const ivPcsSet = pcsSet.size > 0
    ? new Set([...pcsSet].map(pc => ((pc - rootPC) % 12 + 12) % 12))
    : null;
  const bSt = extraState || lastRenderState || {};
  const bPadLo = baseMidi();
  const bPadHi = bPadLo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);

  const labelFn = function(pc, iv) {
    if (guitarLabelMode === 'degree') {
      return (AppState.mode === 'chord' && BuilderState.quality)
        ? chordDegreeName(iv, BuilderState.quality.pcs, ivPcsSet)
        : SCALE_DEGREE_NAMES[iv];
    }
    return pcName(pc);
  };

  padRenderFretboard(svg, {
    tuning: PAD_BASS_TUNING,
    stringNames: PAD_BASS_NAMES,
    rootPC: rootPC,
    pcsSet: pcsSet,
    bassPC: bassPC,
    overlayPCS: overlayPCS,
    overlayCharPCS: overlayCharPCS,
    renderState: bSt,
    positionState: BassPositionState,
    selectedFrets: bassSelectedFrets,
    labelFn: labelFn,
    chordMode: AppState.mode === 'chord',
    solo: showBass && !showGuitar && !showPiano,
    width: DIAGRAM_WIDTH,
    isMobile: _isMobile,
    isLandscape: _isLandscape,
    padRange: { lo: bPadLo, hi: bPadHi },
    onFretClick: toggleBassFret,
    colorOff: AppState.colorOff,
  });
}

function toggleBassFret(stringIdx, fret) {
  if (AppState.mode !== 'input' && typeof setMode === 'function') setMode('input');
  if (bassSelectedFrets[stringIdx] === fret) {
    bassSelectedFrets[stringIdx] = null;
  } else {
    bassSelectedFrets[stringIdx] = fret;
  }
  BassPositionState.enabled = false;
  BassPositionState._lastKey = null;
  updatePositionBar('bass');
  updateInstrumentInput();
}

// ========================================
// PIANO DISPLAY
// ========================================
function renderPianoDisplay(stateOrRootPC, pcsSetOpt) {
  // Handle both new state object format and legacy 2-arg format (rootPC, pcsSet)
  var state;
  if (stateOrRootPC !== null && typeof stateOrRootPC === 'object') {
    state = stateOrRootPC;
  } else {
    state = { rootPC: stateOrRootPC != null ? stateOrRootPC : -1, activePCS: pcsSetOpt || new Set() };
  }
  const svg = document.getElementById('piano-display');
  var pcsSet = state ? state.activePCS : new Set();
  if (!pcsSet) pcsSet = new Set();
  var rootPC = state ? state.rootPC : -1;
  var bassPC = state ? state.bassPC : null;
  var activeMidiSet = null;

  const stockPinned = StockState.enabled && StockState.currentIndex >= 0 && StockState.lhMidi && StockState.rhMidi;
  const selectedVoicingBox = !stockPinned
    && AppState.mode === 'chord'
    && VoicingState.selectedBoxIdx !== null
    && VoicingState.lastBoxes
    && VoicingState.lastBoxes[VoicingState.selectedBoxIdx];
  if (selectedVoicingBox && selectedVoicingBox.midiNotes) {
    activeMidiSet = new Set(selectedVoicingBox.midiNotes);
  }
  const pianoBaseMidi = baseMidi();
  const pianoMidiBase = stockPinned ? 36 : (Math.floor(pianoBaseMidi / 12) - 2 + 2) * 12;

  // Stock mode: build keyColorFn override
  var stockMidiSet = null;
  var keyColorFn = null;
  if (stockPinned) {
    stockMidiSet = new Set(StockState.lhMidi.concat(StockState.rhMidi));
    keyColorFn = function(pc, isWhite, midi) {
      var baseOff = isWhite ? '#eee' : '#222';
      if (!stockMidiSet.has(midi)) return { fill: baseOff, textColor: null, opacity: 1, showLabel: false };
      var deg = StockState.degreeMap[midi];
      var fill, textColor;
      if (AppState.colorOff) {
        fill = isWhite ? PAD_INST_COLORS.pianoChordWhite : PAD_INST_COLORS.pianoChordBlack;
        textColor = isWhite ? '#333' : '#fff';
      } else if (deg === '1')                                { fill = PAD_INST_COLORS.root; textColor = '#fff'; }
      else if (deg === '3' || deg === 'b3')                  { fill = PAD_INST_COLORS.guide3; textColor = '#fff'; }
      else if (deg === '7' || deg === 'b7' || deg === 'bb7') { fill = PAD_INST_COLORS.guide7; textColor = '#fff'; }
      else if (deg === '5' || deg === 'b5' || deg === '#5')  { fill = isWhite ? PAD_INST_COLORS.pianoChordWhite : PAD_INST_COLORS.pianoChordBlack; textColor = isWhite ? '#333' : '#fff'; }
      else                                                    { fill = PAD_INST_COLORS.tension; textColor = '#fff'; }
      return { fill: fill, textColor: textColor, opacity: 1, showLabel: true };
    };
  }

  // Label function: maps global state
  var pianoIvPcsSet = rootPC >= 0 && AppState.mode === 'chord' && pcsSet.size > 0
    ? new Set([...pcsSet].map(function(p) { return ((p - rootPC) % 12 + 12) % 12; }))
    : null;
  const labelFn = function(pc, midi) {
    if (stockPinned && stockMidiSet && stockMidiSet.has(midi)) {
      return StockState.degreeMap[midi] || pcName(pc);
    }
    if (rootPC < 0) return pcName(pc);
    var iv = ((pc - rootPC) % 12 + 12) % 12;
    if (AppState.mode === 'chord' && BuilderState.quality) {
      return chordDegreeName(iv, BuilderState.quality.pcs, pianoIvPcsSet);
    }
    return SCALE_DEGREE_NAMES[iv];
  };

  padRenderPiano(svg, {
    rootPC: rootPC,
    pcsSet: pcsSet,
    bassPC: bassPC,
    renderState: state || {},
    activeMidiSet: activeMidiSet,
    overlayPCS: state ? state.overlayPCS : null,
    overlayCharPCS: state ? state.overlayCharPCS : null,
    chordMode: AppState.mode === 'chord',
    numOctaves: stockPinned ? 5 : 4,
    startMidi: pianoMidiBase,
    selectedNotes: pianoSelectedNotes,
    solo: showPiano && !showGuitar,
    width: DIAGRAM_WIDTH,
    isMobile: _isMobile,
    isLandscape: _isLandscape,
    labelFn: labelFn,
    keyColorFn: keyColorFn,
    onKeyClick: togglePianoNote,
    colorOff: AppState.colorOff,
  });
}


// ========================================
// INSTRUMENT INPUT
// ========================================
const GUITAR_OPEN_MIDI = [64, 59, 55, 50, 45, 40]; // E4, B3, G3, D3, A2, E2
let guitarSelectedFrets = [null, null, null, null, null, null];
let pianoSelectedNotes = new Set(); // MIDI note numbers
let instrumentInputActive = false;
var _instrumentMidiSet = null; // When non-null, renderPads only colors these specific MIDI notes
var _voicingReflectMode = false; // Toggle: auto-positioned guitar voicing → pad MIDI filter
var _stockReflectMode = false;   // Toggle: Stock voicing → pad MIDI filter
var _instrumentPadSet = null;    // Set of (row * COLS + col) — deduped pad positions for voicing reflect
var _voicingAltMode = 0;         // 0 = most compact layout, 1+ = alternates sorted by column spread
var _voicingDualCount = 0;       // Number of MIDI notes with 2 pad positions
var _voicingLayoutCount = 1;     // Total distinct layouts available

// Compute deduped pad positions: 1 pad per MIDI note (WYSIWYG)
// Two layout strategies offered:
//   1. Guitar-like: 1 note per row (= 1 string), diagonal shape
//   2. Compact: minimize bounding box, easiest to play on pad
function _computeVoicingPadPositions(midiSet) {
  var bm = baseMidi();
  var byMidi = {};
  midiSet.forEach(function(midi) {
    byMidi[midi] = [];
    for (var row = 0; row < ROWS; row++) {
      var col = midi - bm - row * ROW_INTERVAL;
      if (col >= 0 && col < COLS) {
        byMidi[midi].push({row: row, col: col});
      }
    }
  });
  var fixed = [], duals = [];
  Object.keys(byMidi).forEach(function(k) {
    var poses = byMidi[k];
    if (poses.length === 1) fixed.push(poses[0]);
    else if (poses.length >= 2) duals.push(poses);
  });
  if (duals.length === 0) {
    var padSet = new Set();
    fixed.forEach(function(p) { padSet.add(p.row * COLS + p.col); });
    return { padSet: padSet, dualCount: 0, layoutCount: 1 };
  }
  // Enumerate all dual combinations (2^n, typically n≤3)
  var combos = 1 << duals.length;
  var allCombos = [];
  for (var mask = 0; mask < combos; mask++) {
    var chosen = [];
    for (var d = 0; d < duals.length; d++) {
      var idx = (mask >> d) & 1;
      chosen.push(duals[d][Math.min(idx, duals[d].length - 1)]);
    }
    var allPos = fixed.concat(chosen);
    // Row conflicts (guitar: 1 string = 1 note)
    var rowUsed = {};
    var rowConflicts = 0;
    var rows = [], cols = [];
    allPos.forEach(function(p) {
      rowUsed[p.row] = (rowUsed[p.row] || 0) + 1;
      if (rowUsed[p.row] === 2) rowConflicts++;
      rows.push(p.row); cols.push(p.col);
    });
    var colSpread = Math.max.apply(null, cols) - Math.min.apply(null, cols);
    var rowSpread = Math.max.apply(null, rows) - Math.min.apply(null, rows);
    allCombos.push({ chosen: chosen, rowConflicts: rowConflicts, colSpread: colSpread, rowSpread: rowSpread });
  }
  // Helper: make padSet key for dedup
  function comboKey(c) {
    return c.chosen.map(function(p) { return p.row * COLS + p.col; }).sort().join(',');
  }
  // 1. Guitar-like best: min row conflicts, then min col spread
  var guitarSorted = allCombos.slice().sort(function(a, b) {
    if (a.rowConflicts !== b.rowConflicts) return a.rowConflicts - b.rowConflicts;
    return a.colSpread - b.colSpread;
  });
  // 2. Compact best: min (rowSpread + colSpread) bounding box, then min row conflicts
  var compactSorted = allCombos.slice().sort(function(a, b) {
    var aBox = a.rowSpread + a.colSpread;
    var bBox = b.rowSpread + b.colSpread;
    if (aBox !== bBox) return aBox - bBox;
    return a.rowConflicts - b.rowConflicts;
  });
  // Build unique list: guitar-like first, then compact (if different)
  var unique = [];
  var seen = {};
  function addIfNew(combo) {
    var key = comboKey(combo);
    if (!seen[key]) { seen[key] = true; unique.push(combo); return true; }
    return false;
  }
  addIfNew(guitarSorted[0]);
  addIfNew(compactSorted[0]);
  // Add a few more guitar-like alternatives (within best row conflicts + small spread)
  var bestRC = guitarSorted[0].rowConflicts;
  var bestCS = guitarSorted[0].colSpread;
  for (var gi = 1; gi < guitarSorted.length && unique.length < 4; gi++) {
    var g = guitarSorted[gi];
    if (g.rowConflicts > bestRC) break;
    if (g.colSpread > bestCS + 1) break;
    addIfNew(g);
  }
  var pick = unique[Math.min(_voicingAltMode, unique.length - 1)];
  var padSet = new Set();
  fixed.forEach(function(p) { padSet.add(p.row * COLS + p.col); });
  pick.chosen.forEach(function(p) { padSet.add(p.row * COLS + p.col); });
  return { padSet: padSet, dualCount: duals.length, layoutCount: unique.length };
}

// Guitar engine is educational: pad / Push display should match the real guitar register.
// Form search and emitted/displayed MIDI stay in the same register so one visible position maps
// to the actual fretboard shape.
var GUITAR_ENGINE_OCTAVE_OFFSET = 0;
function getGuitarEngineMidiNotes() {
  var notes = [];
  for (var s = 0; s < 6; s++) {
    if (guitarSelectedFrets[s] !== null) notes.push(GUITAR_OPEN_MIDI[s] + guitarSelectedFrets[s] + GUITAR_ENGINE_OCTAVE_OFFSET);
  }
  return notes.sort(function(a, b) { return a - b; });
}

function centerPadOnMidiNotes(notes) {
  if (!notes || notes.length < 2) return;
  var sorted = notes.slice().sort(function(a, b) { return a - b; });
  var mid = Math.round((sorted[0] + sorted[sorted.length - 1]) / 2);
  var gridRange = (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  var padMid = BASE_MIDI + gridRange / 2;
  setOctaveShift(Math.round((mid - padMid) / 12));
}

function isGuitarEngineVisible() {
  var hpsUnlocked = !!((typeof TastyState !== 'undefined' && TastyState.hpsUnlocked) ||
    (typeof StockState !== 'undefined' && StockState.hpsUnlocked));
  if (!hpsUnlocked) return false;
  return AppState.mode === 'chord' && BuilderState.root !== null && !!BuilderState.quality;
}

function refreshGuitarEnginePositionsForBuilder(applyCurrent) {
  if (!isGuitarEngineVisible()) return false;
  if (typeof getBuilderPCS !== 'function' || typeof padEnumGuitarChordForms !== 'function') return false;
  var pcs = getBuilderPCS();
  if (!pcs) return false;

  var key = 'engine:' + BuilderState.root + ':' + pcs.join(',');
  if (key !== GuitarPositionState._engineKey || GuitarPositionState.alternatives.length === 0 || !GuitarPositionState.enabled) {
    GuitarPositionState._engineKey = key;
    GuitarPositionState.alternatives = padEnumGuitarChordForms(pcs, BuilderState.root, GUITAR_OPEN_MIDI, 21, 4, {
      maxResults: (typeof GUITAR_ENGINE_POSITION_MAX_RESULTS !== 'undefined' ? GUITAR_ENGINE_POSITION_MAX_RESULTS : INSTRUMENT_POSITION_MAX_RESULTS),
      weights: typeof _presetWeights !== 'undefined' ? _presetWeights : null,
      noOpen: typeof _presetNoOpen !== 'undefined' ? _presetNoOpen : false,
      genre: typeof _presetGenre !== 'undefined' ? _presetGenre : '',
    });
    GuitarPositionState.groups = groupGuitarForms(GuitarPositionState.alternatives, GUITAR_OPEN_MIDI, BuilderState.root);
    _resetPositionState(GuitarPositionState);
    GuitarPositionState.enabled = GuitarPositionState.alternatives.length > 0;
  }
  if (GuitarPositionState.enabled && applyCurrent) {
    applyGuitarEngineAlt(GuitarPositionState.currentAlt || 0);
  }
  return !!(GuitarPositionState.enabled && GuitarPositionState.alternatives.length > 0);
}

function isGuitarEngineAvailable() {
  return refreshGuitarEnginePositionsForBuilder(false);
}

function isGuitarEngineActive() {
  return !!(_voicingReflectMode && GuitarPositionState.enabled && _guitarSyncSource === 'position');
}

function resetGuitarEngineFilters() {
  _voicingReflectMode = false;
  _voicingAltMode = 0;
  _instrumentMidiSet = null;
  _instrumentPadSet = null;
  _voicingDualCount = 0;
  _voicingLayoutCount = 1;
  var btn = document.getElementById('voicing-reflect-btn');
  if (btn) {
    btn.style.background = 'var(--surface)';
    btn.style.color = 'var(--text)';
    btn.innerHTML = '<span class="kbd-hint">V</span>' + t('pos.to_pad');
    btn.style.borderColor = 'var(--accent, #f80)';
    btn.style.display = 'none';
  }
}

function enableGuitarEngine() {
  if (!isGuitarEngineAvailable()) return;
  if (TastyState.enabled && typeof disableTasty === 'function') disableTasty(true);
  if (StockState.enabled && typeof disableStock === 'function') disableStock();
  if (_stockReflectMode) {
    _stockReflectMode = false;
    syncStockReflectButtons(false);
  }
  _voicingReflectMode = true;
  _voicingAltMode = 0;
  refreshGuitarEnginePositionsForBuilder(true);
  ensureInstrumentVisible('guitar');
  centerPadOnMidiNotes(getGuitarEngineMidiNotes());
  render();
  if (typeof updateChordDisplay === 'function') updateChordDisplay();
  if (typeof updateInstrumentInput === 'function') updateInstrumentInput();
}

function disableGuitarEngine(options) {
  options = options || {};
  var wasActive = _voicingReflectMode;
  resetGuitarEngineFilters();
  if (wasActive && options.render !== false) {
    render();
    if (typeof updateChordDisplay === 'function') updateChordDisplay();
  } else if (typeof updateChordEngineTabs === 'function') {
    updateChordEngineTabs();
  }
}

function toggleGuitarEngine() {
  if (isGuitarEngineActive()) disableGuitarEngine();
  else enableGuitarEngine();
}

function applyGuitarEngineAlt(index) {
  if (!GuitarPositionState.enabled || GuitarPositionState.alternatives.length === 0) return false;
  var len = GuitarPositionState.alternatives.length;
  GuitarPositionState.currentAlt = (index + len) % len;
  var form = GuitarPositionState.alternatives[GuitarPositionState.currentAlt];
  var activeGroup = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
  var activeLocalIdx = activeGroup ? activeGroup.forms.indexOf(form) : -1;
  if (activeLocalIdx >= 0) {
    GuitarPositionState.currentAltInGroup = activeLocalIdx;
  } else {
    for (var gi = 0; gi < GuitarPositionState.groups.length; gi++) {
      var localIdx = GuitarPositionState.groups[gi].forms.indexOf(form);
      if (localIdx >= 0) {
        GuitarPositionState.currentGroupIdx = gi;
        GuitarPositionState.currentAltInGroup = localIdx;
        break;
      }
    }
  }
  applyGuitarForm(form);
  updatePositionBar('guitar');
  return true;
}

function cycleGuitarEngine(reverse) {
  if (!isGuitarEngineActive()) return;
  cycleGuitarEngineInGroup(reverse ? -1 : 1);
}

function getGuitarEngineCounter() {
  if (!GuitarPositionState.enabled || GuitarPositionState.alternatives.length === 0) return '';
  var group = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
  if (group && group.forms.length > 0) {
    return (GuitarPositionState.currentAltInGroup + 1) + '/' + group.forms.length;
  }
  return (GuitarPositionState.currentAlt + 1) + '/' + GuitarPositionState.alternatives.length;
}

function getGuitarEngineDegreeParts() {
  var notes = getGuitarEngineMidiNotes();
  var finalPCS = typeof getBuilderPCS === 'function' ? getBuilderPCS() : null;
  var finalSet = finalPCS ? new Set(finalPCS.map(function(iv) { return ((iv % 12) + 12) % 12; })) : null;
  var qualityPCS = BuilderState.quality ? BuilderState.quality.pcs : null;
  var noteNames = [];
  var degreeNames = [];
  notes.forEach(function(n) {
    var pc = n % 12;
    var degreeName = '';
    if (BuilderState.root !== null && typeof chordDegreeName === 'function') {
      degreeName = chordDegreeName(((pc - BuilderState.root) + 12) % 12, qualityPCS, finalSet);
    }
    noteNames.push(NOTE_NAMES_SHARP[pc]);
    degreeNames.push(degreeName || NOTE_NAMES_SHARP[pc]);
  });
  return { noteText: noteNames.join(' '), degreeText: degreeNames.join(' ') };
}

function getGuitarEngineDetailText() {
  return '';
}

function _afterGuitarEngineControlChange(play) {
  if (!isGuitarEngineActive()) return;
  centerPadOnMidiNotes(getGuitarEngineMidiNotes());
  render();
  if (typeof updateChordDisplay === 'function') updateChordDisplay();
  if (typeof updateInstrumentInput === 'function') updateInstrumentInput();
  var notes = getGuitarEngineMidiNotes();
  if (play && notes.length > 0 && typeof playMidiNotes === 'function') playMidiNotes(notes, 1.0);
}

function setGuitarEngineGroup(index) {
  if (!isGuitarEngineActive() || !GuitarPositionState.groups[index]) return;
  GuitarPositionState.currentGroupIdx = index;
  GuitarPositionState.currentAltInGroup = 0;
  var group = GuitarPositionState.groups[index];
  GuitarPositionState.currentAlt = GuitarPositionState.alternatives.indexOf(group.forms[0]);
  applyGuitarForm(group.forms[0]);
  updatePositionBar('guitar');
  _afterGuitarEngineControlChange(false);
}

function cycleGuitarEngineInGroup(delta) {
  if (!isGuitarEngineActive() || !GuitarPositionState.groups.length) return;
  var group = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
  if (!group || !group.forms.length) return;
  var len = group.forms.length;
  GuitarPositionState.currentAltInGroup = (GuitarPositionState.currentAltInGroup + delta + len) % len;
  var form = group.forms[GuitarPositionState.currentAltInGroup];
  GuitarPositionState.currentAlt = GuitarPositionState.alternatives.indexOf(form);
  applyGuitarForm(form);
  updatePositionBar('guitar');
  _afterGuitarEngineControlChange(true);
}

function renderGuitarEngineControls(filterEl) {
  if (!filterEl) return;
  filterEl.innerHTML = '';
  if (!isGuitarEngineActive() || !GuitarPositionState.enabled || GuitarPositionState.alternatives.length === 0) return;

  var controls = document.createElement('div');
  controls.className = 'guitar-engine-controls';

  if (GuitarPositionState.groups.length > 1) {
    var groupRow = document.createElement('div');
    groupRow.className = 'guitar-engine-group-row';
    GuitarPositionState.groups.forEach(function(group, idx) {
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'pos-group-tab' + (idx === GuitarPositionState.currentGroupIdx ? ' active' : '');
      tab.textContent = t(group.labelKey);
      tab.onclick = function() { setGuitarEngineGroup(idx); };
      groupRow.appendChild(tab);
    });
    controls.appendChild(groupRow);
  }

  var navRow = document.createElement('div');
  navRow.className = 'guitar-engine-nav-row';

  var hpsUnlocked = !!((typeof TastyState !== 'undefined' && TastyState.hpsUnlocked) ||
    (typeof StockState !== 'undefined' && StockState.hpsUnlocked));
  if (hpsUnlocked) {
    var select = document.createElement('select');
    select.className = 'guitar-engine-preset';
    select.setAttribute('data-info', 'info.genre_preset');
    [
      ['', t('pos.genre_default')],
      ['folk', t('pos.genre_folk')],
      ['jazz', t('pos.genre_jazz')],
      ['bossa', t('pos.genre_bossa')],
      ['funk', t('pos.genre_funk')],
      ['neoSoul', t('pos.genre_neo_soul')]
    ].forEach(function(item) {
      var opt = document.createElement('option');
      opt.value = item[0];
      opt.textContent = item[1];
      select.appendChild(opt);
    });
    select.value = _presetGenre || '';
    select.onchange = function() { setGenrePreset(this.value); };
    navRow.appendChild(select);
  }

  var prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'pos-nav-btn';
  prev.innerHTML = '<span class="kbd-hint">,</span>&#9664;';
  prev.onclick = function() { cycleGuitarEngineInGroup(-1); };
  navRow.appendChild(prev);

  var label = document.createElement('span');
  label.className = 'guitar-engine-group-label';
  var currentGroup = GuitarPositionState.groups[GuitarPositionState.currentGroupIdx];
  var groupCount = currentGroup && currentGroup.forms ? currentGroup.forms.length : GuitarPositionState.alternatives.length;
  label.textContent = (GuitarPositionState.currentAltInGroup + 1) + '/' + groupCount;
  navRow.appendChild(label);

  var next = document.createElement('button');
  next.type = 'button';
  next.className = 'pos-nav-btn';
  next.innerHTML = '&#9654;<span class="kbd-hint">.</span>';
  next.onclick = function() { cycleGuitarEngineInGroup(1); };
  navRow.appendChild(next);

  controls.appendChild(navRow);
  filterEl.appendChild(controls);
}

function getGuitarActiveSummary() {
  if (!isGuitarEngineActive()) return null;
  var parts = getGuitarEngineDegreeParts();
  return {
    kind: 'Guitar',
    count: getGuitarEngineCounter(),
    chordName: getBuilderChordName(),
    noteText: parts.noteText,
    degreeText: parts.degreeText,
    topText: ''
  };
}

function toggleVoicingReflect() {
  toggleGuitarEngine();
}

function syncStockReflectButtons(active) {
  var ids = ['stock-reflect-btn', 'chord-engine-to-pad'];
  ids.forEach(function(id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.style.background = active ? 'var(--accent, #f80)' : 'var(--surface)';
    btn.style.color = active ? '#000' : 'var(--text)';
    btn.style.borderColor = 'var(--accent, #f80)';
    btn.classList.toggle('active', !!active);
  });
}

function toggleStockReflect() {
  if (_stockReflectMode) {
    // Cycle layout or turn off
    if (_voicingLayoutCount > 1 && _voicingAltMode < _voicingLayoutCount - 1) {
      _voicingAltMode++;
    } else {
      _stockReflectMode = false;
      _voicingAltMode = 0;
      _instrumentMidiSet = null;
      _instrumentPadSet = null;
      _voicingLayoutCount = 1;
      syncStockReflectButtons(false);
      render();
      return;
    }
  } else {
    // Turn on — disable guitar reflect if active
    if (_voicingReflectMode) {
      _voicingReflectMode = false;
      var vrBtn = document.getElementById('voicing-reflect-btn');
      if (vrBtn) { vrBtn.style.background = 'var(--surface)'; vrBtn.style.color = 'var(--text)'; vrBtn.style.borderColor = 'var(--accent, #f80)'; }
    }
    _stockReflectMode = true;
    _voicingAltMode = 0;
    // Center pad on Stock voicing
    var notes = StockState.lhMidi.concat(StockState.rhMidi);
    if (notes.length >= 2) {
      notes.sort(function(a, b) { return a - b; });
      var mid = Math.round((notes[0] + notes[notes.length - 1]) / 2);
      var gridRange = (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
      var padMid = BASE_MIDI + gridRange / 2;
      setOctaveShift(Math.round((mid - padMid) / 12));
    }
    syncStockReflectButtons(true);
  }
  render();
}

let padExtNotes = new Set(); // Chord mode: MIDI notes toggled on 64-pad for PS extension
let lastDetectedNotes = []; // Last detection input notes (for click-to-transfer, V2.10)
let lastDetectedCandidates = []; // Last detection candidates (for click-to-transfer, V2.10)
let _guitarSyncSource = null; // null | 'manual' | 'pad' — tracks who set guitarSelectedFrets

// Map MIDI notes to guitar fret positions (greedy: low notes → low strings, prefer low frets)
function syncGuitarFromNotes(midiNotes) {
  if (!showGuitar || !midiNotes || midiNotes.length === 0) return;
  if (_guitarSyncSource === 'manual' || _guitarSyncSource === 'position') return;
  const sorted = [...midiNotes].sort((a, b) => a - b);
  const newFrets = [null, null, null, null, null, null];
  const usedStrings = new Set();
  for (const midi of sorted) {
    let bestS = -1, bestF = Infinity;
    for (let s = 5; s >= 0; s--) { // low E(5) → high E(0)
      if (usedStrings.has(s)) continue;
      const f = midi - GUITAR_OPEN_MIDI[s];
      if (f >= 0 && f <= 21 && f < bestF) { bestS = s; bestF = f; }
    }
    if (bestS !== -1) { newFrets[bestS] = bestF; usedStrings.add(bestS); }
  }
  guitarSelectedFrets = newFrets;
  instrumentInputActive = newFrets.some(f => f !== null);
  _guitarSyncSource = 'pad';
}

function getAllInputMidiNotes() {
  const notes = [];
  for (let s = 0; s < 6; s++) {
    if (guitarSelectedFrets[s] !== null) {
      notes.push(GUITAR_OPEN_MIDI[s] + guitarSelectedFrets[s]);
    }
  }
  for (let s = 0; s < 4; s++) {
    if (bassSelectedFrets[s] !== null) {
      const m = PAD_BASS_TUNING[s] + bassSelectedFrets[s];
      if (!notes.includes(m)) notes.push(m);
    }
  }
  pianoSelectedNotes.forEach(n => {
    if (!notes.includes(n)) notes.push(n);
  });
  return notes.sort((a, b) => a - b);
}

function toggleGuitarFret(stringIdx, fret) {
  if (AppState.mode !== 'input' && typeof setMode === 'function') setMode('input');
  if (guitarSelectedFrets[stringIdx] === fret) {
    guitarSelectedFrets[stringIdx] = null;
  } else {
    guitarSelectedFrets[stringIdx] = fret;
  }
  _guitarSyncSource = 'manual';
  GuitarPositionState.enabled = false;
  GuitarPositionState._lastKey = null;
  // Clear auto-positioned bass to prevent phantom notes in getAllInputMidiNotes()
  if (BassPositionState._lastKey !== null) {
    bassSelectedFrets = [null, null, null, null];
    BassPositionState.enabled = false;
    BassPositionState._lastKey = null;
    updatePositionBar('bass');
  }
  updatePositionBar('guitar');
  updateInstrumentInput();
}

function togglePianoNote(midi) {
  if (AppState.mode !== 'input' && typeof setMode === 'function') setMode('input');
  if (pianoSelectedNotes.has(midi)) {
    pianoSelectedNotes.delete(midi);
  } else {
    pianoSelectedNotes.add(midi);
  }
  updateInstrumentInput();
}

function updateInstrumentInput() {
  const instrNotes = getAllInputMidiNotes();
  instrumentInputActive = instrNotes.length > 0;
  const ctrlEl = document.getElementById('instrument-controls');
  if (ctrlEl) ctrlEl.style.display = 'none';
  // Pre-warm audio on first note selection so Play button works instantly
  if (instrumentInputActive) ensureAudioResumed();
  if (instrNotes.length === 0) {
    _instrumentMidiSet = null; // Clear MIDI filter — show full PCS again
    document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
    if (AppState.mode === 'input') {
      updatePlainDisplay(); // Plain mode: unified display handles #midi-detect
    } else {
      const detectEl = document.getElementById('midi-detect');
      detectEl.innerHTML = '';
    }
    // detectEl always visible (no layout shift)
    render(); // Re-render pads without MIDI filter
    renderGuitarDiagram(lastRenderRootPC, lastRenderActivePCS);
    renderBassDiagram(lastRenderRootPC, lastRenderActivePCS);
    renderPianoDisplay(lastRenderRootPC, lastRenderActivePCS);
    renderParentScales();
    return;
  }

  // Plain mode: delegate #midi-detect to updatePlainDisplay() for unified display
  if (AppState.mode === 'input') {
    const inputPCS = new Set(instrNotes.map(n => n % 12));
    const candidates = detectChord(instrNotes);
    if (candidates.length > 0) {
      renderGuitarDiagram(candidates[0].rootPC, inputPCS);
      renderBassDiagram(candidates[0].rootPC, inputPCS);
      renderPianoDisplay(candidates[0].rootPC, inputPCS);
    } else {
      renderGuitarDiagram(null, inputPCS);
      renderBassDiagram(null, inputPCS);
      renderPianoDisplay(null, inputPCS);
    }
    highlightInstrumentPads(instrNotes);
    updatePlainDisplay(); // single source of truth for #midi-detect + plain panel
    renderParentScales();
    return;
  }

  const guitarEngineActive = !!(typeof isGuitarEngineActive === 'function' && isGuitarEngineActive());

  // === Guitar/Bass/Piano → Builder direct update (Chord mode) ===
  // Guitar engine is already driven by BuilderState. Feeding it back into the
  // builder mixes the selected form with builder notes and corrupts Note/Degree.
  if (!guitarEngineActive && AppState.mode === 'chord' && instrNotes.length >= 2) {
    const directCandidates = detectChord(instrNotes);
    if (directCandidates.length > 0) {
      const detectEl = document.getElementById('midi-detect');
      const noteNames = instrNotes.map(n => NOTE_NAMES_SHARP[n % 12]);
      lastDetectedNotes = instrNotes;
      lastDetectedCandidates = directCandidates;
      const best = directCandidates[0];
      const ustInline = (typeof formatDetectedUstInlineHtml === 'function') ? formatDetectedUstInlineHtml(instrNotes, best.rootPC, best.name) : '';
      let html = '<span class="detect-candidate-best" onclick="transferDetectedCandidate(0,this)">' + best.name + ustInline + '</span>';
      if (directCandidates.length > 1) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">';
        directCandidates.slice(1).forEach((c, i) => {
          html += '<span class="detect-candidate" onclick="transferDetectedCandidate(' + (i + 1) + ',this)">' + c.name + '</span>';
        });
        html += '</div>';
      }
      html += '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">' + t('input.notes_label') + noteNames.join(' ') + '</div>';
      detectEl.innerHTML = html;

      padExtNotes.clear();
      applyNotesToBuilder(instrNotes, best.rootPC);

      // Restrict pad display to only these specific MIDI notes
      _instrumentMidiSet = new Set(instrNotes);

      // Auto-adjust octave so instrument notes are visible on the pad grid
      const loNote = instrNotes[0]; // already sorted
      const hiNote = instrNotes[instrNotes.length - 1];
      const bm = baseMidi();
      const padHi = bm + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
      if (loNote < bm || hiNote > padHi) {
        // Center the instrument notes on the pad grid
        const mid = Math.round((loNote + hiNote) / 2);
        const padMid = BASE_MIDI + (ROWS - 1) * ROW_INTERVAL / 2 + (COLS - 1) / 2;
        setOctaveShift(Math.round((mid - padMid) / 12));
      }

      render();
      renderParentScales();
      return;
    }
  }
  // === End guitar/bass/piano → builder ===
  _instrumentMidiSet = null; // Fallthrough: no MIDI filter (1 note or detection failed)

  // Chord/Scale mode: existing logic
  const guitarEngineNotes = guitarEngineActive && typeof getGuitarEngineMidiNotes === 'function'
    ? getGuitarEngineMidiNotes()
    : null;
  let notesForDetect = guitarEngineNotes && guitarEngineNotes.length > 0 ? guitarEngineNotes : instrNotes;
  if (!guitarEngineActive && AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality) {
    if (padExtNotes.size > 0) {
      const merged = new Set([...padExtNotes, ...instrNotes]);
      notesForDetect = [...merged].sort((a, b) => a - b);
    } else {
      const builderNotes = getCurrentChordMidiNotes();
      if (builderNotes && builderNotes.length > 0) {
        const merged = new Set([...builderNotes, ...instrNotes]);
        notesForDetect = [...merged].sort((a, b) => a - b);
      }
    }
  }

  const detectEl = document.getElementById('midi-detect');
  // Hide chord detection during TASTY/Stock (voicing info is in the TASTY/Stock bar)
  if (TastyState.enabled || StockState.enabled) {
    detectEl.innerHTML = '';
    return;
  }
  const candidates = detectChord(notesForDetect);
  let noteText = candidates.length > 0
    ? formatDetectedNoteDegreeText(notesForDetect, candidates[0].rootPC, candidates[0].name)
    : 'Note: ' + notesForDetect.map(n => NOTE_NAMES_SHARP[n % 12]).join(' ');
  if (guitarEngineActive && typeof getGuitarEngineDegreeParts === 'function') {
    const guitarParts = getGuitarEngineDegreeParts();
    noteText = 'Note: ' + guitarParts.noteText;
    if (guitarParts.degreeText) noteText += '  Degree: ' + guitarParts.degreeText;
  }
  lastDetectedNotes = notesForDetect;
  lastDetectedCandidates = candidates;
  const displayInputNotes = guitarEngineActive ? notesForDetect : instrNotes;
  const inputPCS = new Set(displayInputNotes.map(n => n % 12));
  if (candidates.length > 0) {
    const best = candidates[0];
    const ustInline = (typeof formatDetectedUstInlineHtml === 'function') ? formatDetectedUstInlineHtml(notesForDetect, best.rootPC, best.name) : '';
    let html = '<span class="detect-candidate-best" onclick="transferDetectedCandidate(0,this)">' + best.name + ustInline + '</span>';
    if (candidates.length > 1) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">';
      candidates.slice(1).forEach((c, i) => {
        html += '<span class="detect-candidate" onclick="transferDetectedCandidate(' + (i + 1) + ',this)">' + c.name + '</span>';
      });
      html += '</div>';
    }
    html += '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">' + noteText + '</div>';
    detectEl.innerHTML = html;
    if (AppState.mode === 'chord') {
      const mergedPCS = new Set(lastRenderActivePCS);
      displayInputNotes.forEach(n => mergedPCS.add(n % 12));
      renderGuitarDiagram(lastRenderRootPC, mergedPCS);
      renderBassDiagram(lastRenderRootPC, mergedPCS);
      renderPianoDisplay(lastRenderRootPC, mergedPCS);
    } else {
      renderGuitarDiagram(best.rootPC, inputPCS);
      renderBassDiagram(best.rootPC, inputPCS);
      renderPianoDisplay(best.rootPC, inputPCS);
    }
  } else {
    detectEl.textContent = noteText;
    if (AppState.mode === 'chord') {
      const mergedPCS = new Set(lastRenderActivePCS);
      displayInputNotes.forEach(n => mergedPCS.add(n % 12));
      renderGuitarDiagram(lastRenderRootPC, mergedPCS);
      renderBassDiagram(lastRenderRootPC, mergedPCS);
      renderPianoDisplay(lastRenderRootPC, mergedPCS);
    } else {
      renderGuitarDiagram(null, inputPCS);
      renderBassDiagram(null, inputPCS);
      renderPianoDisplay(null, inputPCS);
    }
  }
  highlightInstrumentPads(displayInputNotes);
  renderParentScales();
}

function highlightInstrumentPads(midiNotes) {
  document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
  // Hide instrument highlights when a voicing box is selected or TASTY is active
  if (VoicingState.selectedBoxIdx !== null) return;
  if (TastyState.enabled && TastyState.midiNotes.length > 0) return;
  if (StockState.enabled && StockState.currentIndex >= 0) return;
  if (typeof isGuitarEngineActive === 'function' && isGuitarEngineActive()) return;
  // Basic-form draws its own single clean shape — never overlay the white position frames.
  if (typeof chordBasicFormActive === 'function' && chordBasicFormActive()) return;
  // All-positions view already shows every chord position in grey over the scale background;
  // the white instrument frames are redundant noise there (うりなみさん 2026-05-29).
  if (AppState.mode === 'chord' && AppState.showAllPositions) return;
  const svg = document.getElementById('pad-grid');
  const bm = baseMidi();
  const noteSet = new Set(midiNotes);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const midi = bm + row * ROW_INTERVAL + col;
      if (noteSet.has(midi)) {
        const x = MARGIN + col * (PAD_SIZE + PAD_GAP);
        const y = MARGIN + (ROWS - 1 - row) * (PAD_SIZE + PAD_GAP);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x); rect.setAttribute('y', y);
        rect.setAttribute('width', PAD_SIZE); rect.setAttribute('height', PAD_SIZE);
        rect.setAttribute('rx', 6);
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#fff'); rect.setAttribute('stroke-width', 3);
        rect.setAttribute('class', 'instrument-highlight');
        rect.setAttribute('pointer-events', 'none');
        svg.appendChild(rect);
      }
    }
  }
}

function clearInstrumentInput() {
  guitarSelectedFrets = [null, null, null, null, null, null];
  bassSelectedFrets = [null, null, null, null];
  pianoSelectedNotes.clear();
  padExtNotes.clear();
  instrumentInputActive = false;
  _instrumentMidiSet = null;
  _instrumentPadSet = null;
  _voicingReflectMode = false;
  _stockReflectMode = false;
  _voicingAltMode = 0;
  _voicingDualCount = 0;
  var vrBtn = document.getElementById('voicing-reflect-btn');
  if (vrBtn) { vrBtn.style.background = 'var(--surface)'; vrBtn.style.color = 'var(--text)'; vrBtn.innerHTML = '<span class="kbd-hint">V</span>' + t('pos.to_pad'); vrBtn.style.display = 'none'; vrBtn.style.borderColor = 'var(--accent, #f80)'; }
  var srBtn = document.getElementById('stock-reflect-btn');
  if (srBtn) { srBtn.style.background = 'var(--surface)'; srBtn.style.color = 'var(--text)'; srBtn.style.display = 'none'; srBtn.style.borderColor = 'var(--accent, #f80)'; }
  GuitarPositionState.enabled = false;
  GuitarPositionState._lastKey = null;
  BassPositionState.enabled = false;
  BassPositionState._lastKey = null;
  const ctrlEl = document.getElementById('instrument-controls');
  if (ctrlEl) ctrlEl.style.display = 'none';
  document.querySelectorAll('.instrument-highlight').forEach(el => el.remove());
  const detectEl = document.getElementById('midi-detect');
  detectEl.innerHTML = '';
  // Re-render to restore builder chord display on pads + diagrams
  // Temporarily keep 'manual' to prevent updateGuitarPositions() from
  // re-auto-positioning frets during this render() call
  _guitarSyncSource = 'manual';
  render();
  _guitarSyncSource = null;
}

function playInstrumentInput() {
  const instrNotes = getAllInputMidiNotes();
  if (padExtNotes.size > 0) {
    // Pad override: play pad notes + any guitar/bass/piano additions
    const merged = [...new Set([...padExtNotes, ...instrNotes])].sort((a, b) => a - b);
    if (merged.length > 0) playMidiNotes(merged, 1.0);
  } else if (AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality) {
    const builderNotes = getCurrentChordMidiNotes() || [];
    const merged = [...new Set([...builderNotes, ...instrNotes])].sort((a, b) => a - b);
    if (merged.length > 0) playMidiNotes(merged, 1.0);
  } else {
    if (instrNotes.length > 0) playMidiNotes(instrNotes, 1.0);
  }
}

// State for restoring diagrams when MIDI notes are released
let lastRenderRootPC = 0;
let lastRenderActivePCS = new Set();
let lastRenderState = null; // full state for instrument diagram color classification
