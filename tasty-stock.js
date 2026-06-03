// ========================================
// TASTY VOICING ENGINE — degree → MIDI conversion
// ========================================

// Tensions (9th, 11th, 13th) use COMPOUND intervals (octave + simple)
// so voicings spread properly as open voicings, not close position.
// Chord tones (1, b3, 3, b5, 5, #5, 6, bb7, b7, 7) stay simple.
var TASTY_DEGREE_MAP = {
  '1':0, 'b9':13, '9':14, '#9':15, 'b3':3, '3':4,
  // '4' = SIMPLE perfect 4th (+5), '#4' = SIMPLE aug 4th (+6)。'11'/'#11' は複合
  // (+17/+18) でオープンボイシング用だが、4度堆積 (So What / Lydian) を下からタイトに
  // 積む形には単純 4 度が要る (4度堆積=調性外の積み方)。'#4' は Lydian の特性音 (b5 と
  // 同音だが Lydian 文脈の綴りとして #4 を出す)。
  '4':5, '#4':6,
  '11':17, '#11':18, 'b5':6, '5':7, '#5':8, 'b13':20,
  '6':9, '13':21, 'bb7':9, 'b7':10, '7':11
};

// Build MIDI note array from degree array (bottom to top, each note above previous)
function buildTastyVoicing(rootMidi, degrees) {
  var result = [];
  var first = TASTY_DEGREE_MAP[degrees[0]];
  if (first === undefined) return result;
  result.push(rootMidi + first);
  for (var i = 1; i < degrees.length; i++) {
    var semitone = TASTY_DEGREE_MAP[degrees[i]];
    if (semitone === undefined) continue;
    var prev = result[result.length - 1];
    var note = rootMidi + semitone;
    while (note <= prev) note += 12;
    result.push(note);
  }
  return result;
}

function buildTastyVoicingItems(rootMidi, degrees, hand) {
  var midiNotes = buildTastyVoicing(rootMidi, degrees || []);
  var items = [];
  for (var i = 0; i < midiNotes.length; i++) {
    items.push({ midi: midiNotes[i], degree: degrees[i], hand: hand || null, originalIndex: i });
  }
  return items;
}

// Last-resort low-interval-limit guard.
//
// Important: curated TASTY/STOCK voicings are meaningful as voicings. Their
// normal path preserves the original shape and uses whole-octave playback/range
// movement first. This helper is kept for exceptional/generated cases where a
// local octave escape is musically less damaging than leaving an unusably muddy
// low clash.
var LOW_INTERVAL_LIMITS = {
  1: 60,  // b9 / minor 2nd
  2: 55,  // 9 / major 2nd
  3: 48,  // b3
  4: 46,  // 3
  5: 43,  // sus4 / 11
  6: 42,  // #11 / b5
  7: 36,  // 5
  8: 40,  // #5 / b13
  9: 40,  // 6 / 13
  10: 36, // b7
  11: 36  // major 7
};

function lowIntervalLimitForPair(lowerMidi, upperMidi) {
  var interval = upperMidi - lowerMidi;
  if (interval <= 0 || interval >= 12) return null;
  var simple = ((interval % 12) + 12) % 12;
  return LOW_INTERVAL_LIMITS[simple] || null;
}

function applyLowIntervalLimitToItems(items) {
  if (!items || items.length < 2) return (items || []).slice();
  var out = items.map(function(item, idx) {
    return {
      midi: item.midi,
      degree: item.degree,
      hand: item.hand || null,
      originalIndex: item.originalIndex !== undefined ? item.originalIndex : idx
    };
  });

  for (var guard = 0; guard < 24; guard++) {
    out.sort(function(a, b) { return a.midi - b.midi || a.originalIndex - b.originalIndex; });
    var changed = false;
    for (var i = 0; i < out.length - 1; i++) {
      for (var j = i + 1; j < out.length; j++) {
        var limit = lowIntervalLimitForPair(out[i].midi, out[j].midi);
        if (limit !== null && out[i].midi < limit) {
          out[j].midi += 12;
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
    if (!changed) break;
  }
  out.sort(function(a, b) { return a.midi - b.midi || a.originalIndex - b.originalIndex; });
  return out;
}

function voicingItemsToMidi(items) {
  return (items || []).map(function(item) { return item.midi; });
}

function voicingItemsToDegrees(items) {
  return (items || []).map(function(item) { return item.degree; });
}

function buildDegreeMapFromItems(items) {
  var map = {};
  (items || []).forEach(function(item) {
    map[item.midi] = item.degree;
  });
  return map;
}

function makeVoicingItemsFromMidiDegrees(midiNotes, degrees) {
  var items = [];
  for (var i = 0; i < midiNotes.length; i++) {
    items.push({ midi: midiNotes[i], degree: degrees[i], originalIndex: i });
  }
  return items;
}

// Detect Rootless / Omit3 / Omit5 from degree array
function getTastyLabels(degrees) {
  var labels = [];
  var has1 = false, has3 = false, has5 = false;
  for (var i = 0; i < degrees.length; i++) {
    if (degrees[i] === '1') has1 = true;
    if (degrees[i] === '3' || degrees[i] === 'b3') has3 = true;
    if (degrees[i] === '5') has5 = true;
  }
  if (!has1) labels.push('Rootless');
  if (!has3) labels.push('Omit3');
  if (!has5) labels.push('Omit5');
  return labels;
}

// Build degree map: MIDI note → recipe degree string (e.g. {36:"1", 39:"b3"})
function buildTastyDegreeMap(midiNotes, degrees) {
  var map = {};
  var idx = 0;
  for (var i = 0; i < degrees.length; i++) {
    if (TASTY_DEGREE_MAP[degrees[i]] === undefined) continue;
    if (idx < midiNotes.length) {
      map[midiNotes[idx]] = degrees[i];
      idx++;
    }
  }
  return map;
}

function isDominantVoicingContext(opts) {
  opts = opts || {};
  if (opts.dominant) return true;
  var qualityPCS = opts.qualityPCS;
  if (!qualityPCS) return false;
  var has = function(pc) {
    if (typeof qualityPCS.has === 'function') return qualityPCS.has(pc);
    return Array.isArray(qualityPCS) && qualityPCS.indexOf(pc) >= 0;
  };
  return has(4) && has(10);
}

function displayDegreeLabel(deg, opts) {
  // Diminished 7th is written as 6 in practical chord charts to reduce reading load.
  if (deg === 'bb7') return '6';
  // In dominant context, #5 is usually read as the altered tension b13.
  if (deg === '#5' && isDominantVoicingContext(opts)) return 'b13';
  return deg === 'b3' ? 'm3' : deg;
}

function formatVoicingNoteName(midi, degree, rootName, opts) {
  var degreeName = displayDegreeLabel(degree, opts);
  return pcNameForChordDegree(midi % 12, rootName, degreeName);
}

function formatVoicingNoteDegreeText(midiNotes, degrees, rootName, opts) {
  var parts = formatVoicingNoteDegreeParts(midiNotes, degrees, rootName, opts);
  var text = parts.noteText ? 'Note: ' + parts.noteText : '';
  if (parts.degreeText) text += (text ? '  ' : '') + 'Degree: ' + parts.degreeText;
  return text;
}

function formatVoicingNoteDegreeParts(midiNotes, degrees, rootName, opts) {
  var noteNames = [];
  var degreeNames = [];
  var len = Math.min(midiNotes.length, degrees.length);
  for (var i = 0; i < len; i++) {
    var degreeName = displayDegreeLabel(degrees[i], opts);
    noteNames.push(formatVoicingNoteName(midiNotes[i], degrees[i], rootName, opts));
    degreeNames.push(degreeName);
  }
  return {
    noteText: noteNames.join(' '),
    degreeText: degreeNames.join(' ')
  };
}

function formatVoicingTopText(midiNotes, degreeMap, rootName, opts) {
  if (!midiNotes || midiNotes.length === 0 || !degreeMap) return '';
  var topNote = Math.max.apply(null, midiNotes);
  var topDegreeRaw = degreeMap[topNote];
  if (!topDegreeRaw) return '';
  var topDegree = displayDegreeLabel(topDegreeRaw, opts);
  return 'Top: ' + topDegree + '(' + formatVoicingNoteName(topNote, topDegreeRaw, rootName, opts) + ')';
}

function formatActiveVoicingSummary(summary) {
  if (!summary) return '';
  var parts = [];
  var engine = summary.kind ? String(summary.kind).toUpperCase() : '';
  var header = engine;
  if (summary.count) header += (header ? ' ' : '') + summary.count;
  if (summary.sourceName) header += (header ? ' · ' : '') + summary.sourceName;
  if (header) parts.push(header);
  if (summary.noteText) parts.push('Note: ' + summary.noteText);
  if (summary.degreeText) parts.push('Degree: ' + summary.degreeText);
  return parts.join('\n');
}

function getPracticalVoicingAudioNotes(midiNotes, opts) {
  if (!midiNotes || midiNotes.length === 0) return [];
  opts = opts || {};
  var low = opts.low !== undefined ? opts.low : 43; // MIDI note floor; octave names vary by Ableton/scientific notation.
  var min = Math.min.apply(null, midiNotes);
  var shift = 0;
  while (min + shift < low) shift += 12;
  if (!shift) return midiNotes.slice();
  return midiNotes.map(function(n) { return n + shift; });
}

function getTastyPlaybackNotes(midiNotes) {
  return getPracticalVoicingAudioNotes(midiNotes, { low: 48 });
}

function getStockPlaybackNotes(midiNotes) {
  return getPracticalVoicingAudioNotes(midiNotes, { low: 48 });
}

// Split MIDI notes into pad-range and out-of-range
function splitByPadRange(midiNotes) {
  var lo = baseMidi();
  var hi = lo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  var inRange = [], outOfRange = [];
  for (var i = 0; i < midiNotes.length; i++) {
    if (midiNotes[i] >= lo && midiNotes[i] <= hi) {
      inRange.push(midiNotes[i]);
    } else {
      outOfRange.push(midiNotes[i]);
    }
  }
  return { inRange: inRange, outOfRange: outOfRange };
}

function getVoicingFitOctaveShift(midiNotes) {
  if (!midiNotes || midiNotes.length === 0) return AppState.octaveShift;
  var min = Math.min.apply(null, midiNotes);
  var max = Math.max.apply(null, midiNotes);
  var range = (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  var current = Math.max(-1, Math.min(3, AppState.octaveShift));
  var containingBest = null;
  var containingBestGap = Infinity;
  for (var exact = -1; exact <= 3; exact++) {
    var exactLo = BASE_MIDI + exact * 12 + AppState.semitoneShift;
    var exactHi = exactLo + range;
    if (exactLo <= min && max <= exactHi) {
      var gap = min - exactLo;
      if (gap < containingBestGap) {
        containingBestGap = gap;
        containingBest = exact;
      }
    }
  }
  if (containingBest !== null) return containingBest;

  var best = current;
  var bestScore = Infinity;
  var voicingCenter = (min + max) / 2;
  for (var s = -1; s <= 3; s++) {
    var lo = BASE_MIDI + s * 12 + AppState.semitoneShift;
    var hi = lo + range;
    var below = Math.max(0, lo - min);
    var above = Math.max(0, max - hi);
    var outside = below + above;
    var gridCenter = (lo + hi) / 2;
    var score = outside * 1000 + Math.abs(voicingCenter - gridCenter) + Math.abs(s - current) * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function getTastyFitOctaveShift(midiNotes) {
  return getVoicingFitOctaveShift(midiNotes);
}

function fitTastyVoicingToPad(midiNotes) {
  var next = getTastyFitOctaveShift(midiNotes);
  if (next === AppState.octaveShift) return false;
  AppState.octaveShift = next;
  updateOctaveLabel();
  return true;
}

function getStockFitOctaveShift(midiNotes) {
  return getVoicingFitOctaveShift(midiNotes);
}

function fitStockVoicingToPad(midiNotes) {
  var next = getStockFitOctaveShift(midiNotes);
  if (next === AppState.octaveShift) return false;
  AppState.octaveShift = next;
  updateOctaveLabel();
  return true;
}

// ========================================
// TASTY MODE — Chord Cookbook Cycling
// ========================================

function getTastyCategory(quality) {
  if (!quality) return null;
  var pcs = quality.pcs || [];
  var has = function(pc) { return pcs.indexOf(pc) >= 0; };
  // TASTY is grouped by the three functional seventh families: Maj7 / m7 / 7.
  if (pcs.length < 4) return null;
  // Dominant: major 3rd + minor 7th.
  if (has(4) && has(10)) return 'dominant';
  // Major 7th: major 3rd + major 7th. 6 chords are intentionally not included.
  if (has(4) && has(11)) return 'major';
  // Minor 7th: minor 3rd + minor 7th. Exclude half-diminished from the m7 family.
  if (has(3) && has(10) && !has(6)) return 'minor';
  return null;
}

function getTastyFunctionQualityName(quality) {
  var cat = getTastyCategory(quality);
  if (cat === 'major') return 'Maj7';
  if (cat === 'minor') return 'm7';
  if (cat === 'dominant') return '7';
  return quality && quality.name ? quality.name : '';
}

function getTastyFunctionChordName() {
  var rootName = BuilderState.root !== null ? pcName(BuilderState.root) : '';
  var qualName = getTastyFunctionQualityName(TastyState.originalQuality || BuilderState.quality);
  if (!rootName || !qualName) return getBuilderChordName() || '';
  return rootName + qualName;
}

function findQualityByName(name) {
  for (var r = 0; r < BUILDER_QUALITIES.length; r++) {
    for (var c = 0; c < BUILDER_QUALITIES[r].length; c++) {
      var q = BUILDER_QUALITIES[r][c];
      if (q && q.name === name) return q;
    }
  }
  return null;
}

function updateTastyMatches() {
  var cat = getTastyCategory(TastyState.originalQuality);
  TastyState.currentCategory = cat;
  // Use voicings JSON (129 degree-based recipes) when available
  if (TastyState.voicings && cat) {
    var matches = TastyState.voicings.filter(function(v) {
      return v.cat === cat;
    });
    // Apply top-note filter if set
    if (TastyState.topFilter) {
      matches = matches.filter(function(v) { return v.top === TastyState.topFilter; });
    }
    TastyState.currentMatches = matches;
  } else {
    TastyState.currentMatches = [];
  }
  TastyState.currentIndex = -1;
}

function findTensionLabel(mods, quality) {
  // When quality has a 7th, skip "6"-prefixed labels (e.g. "6", "6(9)", "6(9,#11)")
  // because PC 9 = 13th (not 6th) in 7th-chord context
  var has7th = quality && (
    quality.pcs.includes(10) || quality.pcs.includes(11) ||
    (quality.pcs.includes(9) && quality.pcs.includes(6))
  );
  // Search TENSION_ROWS for matching mods
  for (var r = 0; r < TENSION_ROWS.length; r++) {
    for (var c = 0; c < (TENSION_ROWS[r] ? TENSION_ROWS[r].length : 0); c++) {
      var t = TENSION_ROWS[r][c];
      if (!t) continue;
      // Skip 6-prefixed labels for 7th chords (6→13, 6(9)→9+13, etc.)
      if (has7th && /^6/.test(t.label)) continue;
      // Skip add9 label for 7th chords (add9 is for triads, 9 is for 7th)
      if (has7th && t.label === 'add9') continue;
      var tm = t.mods;
      // Compare mods
      var match = true;
      var addA = (mods.add || []).slice().sort().join(',');
      var addB = (tm.add || []).slice().sort().join(',');
      if (addA !== addB) match = false;
      if ((mods.replace3 || null) !== (tm.replace3 || null)) match = false;
      if ((mods.sharp5 || false) !== (tm.sharp5 || false)) match = false;
      if ((mods.flat5 || false) !== (tm.flat5 || false)) match = false;
      if ((mods.omit3 || false) !== (tm.omit3 || false)) match = false;
      if ((mods.omit5 || false) !== (tm.omit5 || false)) match = false;
      if (match) return t.label;
    }
  }
  // Build label from mods
  var parts = [];
  if (mods.replace3 === 5) parts.push('sus4');
  else if (mods.replace3 === 2) parts.push('sus2');
  if (mods.sharp5) parts.push('aug');
  if (mods.flat5) parts.push('b5');
  if (mods.omit3) parts.push('omit3');
  if (mods.omit5) parts.push('omit5');
  if (mods.add) {
    mods.add.forEach(function(pc) {
      var name = PC_TO_TENSION_NAME[pc];
      if (name) parts.push(name);
    });
  }
  return parts.length > 0 ? '(' + parts.join(',') + ')' : '';
}

function cycleTasty(reverse) {
  if (!TastyState.enabled || TastyState.currentMatches.length === 0) return;
  var len = TastyState.currentMatches.length;
  TastyState.currentIndex = reverse
    ? (TastyState.currentIndex - 1 + len) % len
    : (TastyState.currentIndex + 1) % len;
  var recipe = TastyState.currentMatches[TastyState.currentIndex];

  // Build voicing from degree array → MIDI notes
  // Voicing is SSOT: fixed MIDI 48 + root register; pad range is secondary.
  // 範囲外の音は pad に出ないが、 voicing 自体は変えない (うりなみさん 2026-05-20)。
  var rootPC = BuilderState.root;
  var rootMidi = 48 + rootPC;
  var rawVoicingItems = buildTastyVoicingItems(rootMidi, recipe.v);
  TastyState.rawMidiNotes = voicingItemsToMidi(rawVoicingItems);
  TastyState.rawDegrees = voicingItemsToDegrees(rawVoicingItems);
  var voicingItems = rawVoicingItems;
  var midiNotes = voicingItemsToMidi(voicingItems);
  var midiDegrees = voicingItemsToDegrees(voicingItems);

  fitTastyVoicingToPad(midiNotes);

  // Split by pad range
  var split = splitByPadRange(midiNotes);
  TastyState.midiNotes = midiNotes;
  TastyState.midiDegrees = midiDegrees;
  TastyState.outOfRange = split.outOfRange;
  TastyState.degreeMap = buildDegreeMapFromItems(voicingItems);
  TastyState.topNote = midiNotes.length > 0 ? Math.max.apply(null, midiNotes) : null;
  TastyState.padPositions = padFindCompactPositions(midiNotes, ROWS, COLS, baseMidi(), ROW_INTERVAL, TastyState.degreeMap);

  updateTastyUI();
  render();
  playMidiNotes(getTastyPlaybackNotes(midiNotes));
}

// Transpose current TASTY voicing by delta semitones (called on ArrowLeft/Right)
// Uses direct MIDI offset to preserve voicing shape across transpose
function refreshTastyVoicing(delta) {
  if (!TastyState.enabled || TastyState.currentIndex < 0) return;
  var recipe = TastyState.currentMatches[TastyState.currentIndex];
  if (!recipe) return;
  var sourceDegrees = TastyState.midiDegrees && TastyState.midiDegrees.length === TastyState.midiNotes.length
    ? TastyState.midiDegrees : recipe.v;
  var rawVoicingItems = makeVoicingItemsFromMidiDegrees(
    TastyState.midiNotes.map(function(n) { return n + delta; }),
    sourceDegrees
  );
  TastyState.rawMidiNotes = voicingItemsToMidi(rawVoicingItems);
  TastyState.rawDegrees = voicingItemsToDegrees(rawVoicingItems);
  var voicingItems = rawVoicingItems;
  var midiNotes = voicingItemsToMidi(voicingItems);
  var midiDegrees = voicingItemsToDegrees(voicingItems);
  fitTastyVoicingToPad(midiNotes);
  var split = splitByPadRange(midiNotes);
  TastyState.midiNotes = midiNotes;
  TastyState.midiDegrees = midiDegrees;
  TastyState.outOfRange = split.outOfRange;
  TastyState.degreeMap = buildDegreeMapFromItems(voicingItems);
  TastyState.topNote = midiNotes.length > 0 ? Math.max.apply(null, midiNotes) : null;
  TastyState.padPositions = padFindCompactPositions(midiNotes, ROWS, COLS, baseMidi(), ROW_INTERVAL, TastyState.degreeMap);
  updateTastyUI();
}

function refreshTastyPadLayout() {
  refreshTastyVoicing(0);
}

function toggleTasty() {
  if (!TastyState.hpsUnlocked || !TastyState.voicings) return;
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) return;

  if (TastyState.enabled) {
    disableTasty();
  } else {
    // Disable STOCK if active (mutually exclusive)
    if (StockState.enabled) disableStock();
    if (typeof disableGuitarEngine === 'function') disableGuitarEngine({ render: false });
    // Clear stale state before enable (defensive: prior chord's voicing must not leak)
    TastyState.currentIndex = -1;
    TastyState.rawMidiNotes = [];
    TastyState.rawDegrees = [];
    TastyState.midiNotes = [];
    TastyState.midiDegrees = [];
    TastyState.outOfRange = [];
    TastyState.degreeMap = {};
    TastyState.topNote = null;
    TastyState.padPositions = [];
    // Enable: save original, find matches, apply first voicing
    TastyState.originalQuality = BuilderState.quality;
    TastyState.originalTension = BuilderState.tension;
    TastyState.enabled = true;
    updateTastyMatches();
    if (TastyState.currentMatches.length > 0) {
      cycleTasty();
    } else {
      TastyState.enabled = false;
      updateTastyUI();
    }
  }
}

function disableTasty(silent) {
  if (!TastyState.enabled) return;
  TastyState.enabled = false;
  TastyState.currentIndex = -1;
  TastyState.rawMidiNotes = [];
  TastyState.rawDegrees = [];
  TastyState.midiNotes = [];
  TastyState.midiDegrees = [];
  TastyState.outOfRange = [];
  TastyState.degreeMap = {};
  TastyState.topNote = null;
  TastyState.topFilter = null;
  TastyState.padPositions = [];

  updateTastyUI();
  render();
  // silent=true: caller (e.g. pad-input exit path in midi.js) suppresses
  // the builder chord re-trigger to avoid double-sounding with the pad note.
  if (!silent) playCurrentChord();
}

function setTastyTopFilter(top) {
  TastyState.topFilter = top;
  updateTastyMatches();
  if (TastyState.currentMatches.length > 0) {
    TastyState.currentIndex = -1;
    cycleTasty();
  } else {
    TastyState.currentIndex = -1;
    TastyState.rawMidiNotes = [];
    TastyState.rawDegrees = [];
    TastyState.midiNotes = [];
    TastyState.midiDegrees = [];
    TastyState.outOfRange = [];
    TastyState.degreeMap = {};
    TastyState.topNote = null;
    TastyState.padPositions = [];
    updateTastyUI();
    render();
  }
}

// Base chord tones for each quality (used to determine added tensions)
var QUALITY_BASE_DEGREES = {
  '': ['1','3','5'],
  'm': ['1','b3','5'],
  '7': ['1','3','5','b7'],
  'm7': ['1','b3','5','b7'],
  '\u25B37': ['1','3','5','7'],
  'm\u25B37': ['1','b3','5','7'],
  'dim': ['1','b3','b5'],
  'dim7': ['1','b3','b5','6'],
  'aug': ['1','3','#5'],
  '6': ['1','3','5','6'],
  'm6': ['1','b3','5','6'],
  'm7(b5)': ['1','b3','b5','b7']
};

function getTastyChordDisplayName() {
  if (!TastyState.enabled || TastyState.currentIndex < 0) return getBuilderChordName() || '';
  return getTastyFunctionChordName();
}

function getBuilderVoicingDisplayContext() {
  return {
    dominant: !!(BuilderState.quality && BuilderState.quality.pcs &&
      BuilderState.quality.pcs.indexOf(4) >= 0 && BuilderState.quality.pcs.indexOf(10) >= 0)
  };
}

function getTastyDiffText() {
  if (!TastyState.enabled || TastyState.currentIndex < 0) return '';
  var recipe = TastyState.currentMatches[TastyState.currentIndex];
  if (!recipe) return '';
  var rootName = BuilderState.root !== null ? pcName(BuilderState.root) : '';

  // TASTY keeps the functional chord type fixed (Maj7 / m7 / 7).
  // Added/omitted tones are shown in Note/Degree/Top instead of changing the chord name.
  var chordName = getTastyFunctionChordName();

  // Voicing notes/degrees: bottom to top (the actual voicing structure)
  var displayContext = getBuilderVoicingDisplayContext();
  var displayDegrees = TastyState.midiDegrees && TastyState.midiDegrees.length === TastyState.midiNotes.length
    ? TastyState.midiDegrees : recipe.v;
  var voicingStr = formatVoicingNoteDegreeText(TastyState.midiNotes, displayDegrees, rootName, displayContext);

  // Top note info
  var topStr = '';
  if (TastyState.topNote !== null && TastyState.degreeMap[TastyState.topNote]) {
    var topPC = TastyState.topNote % 12;
    var topDegree = displayDegreeLabel(TastyState.degreeMap[TastyState.topNote], displayContext);
    topStr = 'Top: ' + topDegree + '(' + formatVoicingNoteName(TastyState.topNote, TastyState.degreeMap[TastyState.topNote], rootName, displayContext) + ')';
  }

  // Labels (Rootless, Omit3, Omit5)
  var labels = getTastyLabels(recipe.v);
  var labelStr = labels.length > 0 ? ' [' + labels.join(', ') + ']' : '';

  var text = chordName + '  ' + voicingStr + '  ' + topStr + labelStr;

  // Out-of-range notes
  if (TastyState.outOfRange.length > 0) {
    var names = TastyState.outOfRange.map(function(m) { return noteName(m); });
    text += ' (+' + names.join(',') + ': パッド外)';
  }

  return text;
}

function getTastyDetailText() {
  if (!TastyState.enabled || TastyState.currentIndex < 0) return '';
  var recipe = TastyState.currentMatches[TastyState.currentIndex];
  if (!recipe) return '';
  var parts = [];
  var rootName = BuilderState.root !== null ? pcName(BuilderState.root) : '';
  var topText = formatVoicingTopText(TastyState.midiNotes, TastyState.degreeMap, rootName, getBuilderVoicingDisplayContext());
  var labels = getTastyLabels(recipe.v);
  if (topText) parts.push(topText);
  if (labels.length > 0) parts.push(labels.join(', '));
  if (TastyState.outOfRange.length > 0) {
    var names = TastyState.outOfRange.map(function(m) { return noteName(m); });
    parts.push('+' + names.join(',') + ': パッド外');
  }
  return parts.join(' · ');
}

function getTastyActiveSummary() {
  if (!TastyState.enabled || TastyState.currentIndex < 0) return null;
  var recipe = TastyState.currentMatches[TastyState.currentIndex];
  if (!recipe) return null;
  var rootName = BuilderState.root !== null ? pcName(BuilderState.root) : '';
  var displayContext = getBuilderVoicingDisplayContext();
  var displayDegrees = TastyState.midiDegrees && TastyState.midiDegrees.length === TastyState.midiNotes.length
    ? TastyState.midiDegrees : recipe.v;
  var parts = formatVoicingNoteDegreeParts(TastyState.midiNotes, displayDegrees, rootName, displayContext);
  return {
    kind: 'Tasty',
    count: (TastyState.currentIndex + 1) + '/' + TastyState.currentMatches.length,
    sourceName: recipe.name || '',
    chordName: getTastyChordDisplayName(),
    noteText: parts.noteText,
    degreeText: parts.degreeText,
    topText: formatVoicingTopText(TastyState.midiNotes, TastyState.degreeMap, rootName, displayContext)
  };
}

// Degree → color category (matches pad colors)
function getTastyDegreeCategory(deg, opts) {
  var label = displayDegreeLabel(deg, opts);
  if (deg === '1') return 'root';
  if (deg === '3' || deg === 'b3') return 'guide3';
  if (deg === '7' || deg === 'b7') return 'guide7';
  if (label === 'b13') return 'tension';
  if (deg === '5' || deg === 'b5' || deg === '#5') return 'chord';
  if (deg === '6') return 'guide7'; // 6th = guide role in 6 chords
  return 'tension'; // 9, b9, #9, 11, #11, 13, b13
}

// Render TASTY degree badges (near TASTY bar — proximity principle)
function renderTastyDegreeBadges() {
  var el = document.getElementById('tasty-degrees-row');
  if (!el) return;
  if (!TastyState.enabled || TastyState.currentIndex < 0) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }
  var recipe = TastyState.currentMatches[TastyState.currentIndex];
  if (!recipe) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';

  var rootPC = BuilderState.root;
  var outSet = {};
  for (var o = 0; o < TastyState.outOfRange.length; o++) {
    outSet[TastyState.outOfRange[o]] = true;
  }

  var html = '<div class="tasty-degrees">';
  html += '<span class="tasty-degrees-label">' + recipe.name + '</span>';
  var displayContext = getBuilderVoicingDisplayContext();
  var rootName = rootPC !== null ? pcName(rootPC) : '';

  var displayDegrees = TastyState.midiDegrees && TastyState.midiDegrees.length === TastyState.midiNotes.length
    ? TastyState.midiDegrees : recipe.v;
  var noteIdx = 0;
  for (var i = 0; i < displayDegrees.length; i++) {
    var deg = displayDegrees[i];
    if (TASTY_DEGREE_MAP[deg] === undefined) continue;
    var semitone = TASTY_DEGREE_MAP[deg];
    var cat = getTastyDegreeCategory(deg, displayContext);
    var displayDeg = displayDegreeLabel(deg, displayContext);
    var isTop = (noteIdx < TastyState.midiNotes.length && TastyState.midiNotes[noteIdx] === TastyState.topNote);
    var isOut = (noteIdx < TastyState.midiNotes.length && outSet[TastyState.midiNotes[noteIdx]]);
    var cls = 'tasty-degree tasty-degree--' + cat;
    if (isTop) cls += ' tasty-degree--top';
    if (isOut) cls += ' tasty-degree--out';

    html += '<span class="' + cls + '">';
    html += displayDeg;
    html += '<span class="tasty-degree-note">' + formatVoicingNoteName(rootPC + semitone, deg, rootName, displayContext) + '</span>';
    if (isTop) html += '<span class="tasty-degree-top">TOP</span>';
    html += '</span>';
    noteIdx++;
  }
  html += '</div>';
  el.innerHTML = html;
}

function updateTastyUI() {
  var bar = document.getElementById('tasty-bar');
  if (!bar) return;
  bar.style.display = TastyState.hpsUnlocked ? '' : 'none';

  var btn = document.getElementById('btn-tasty');
  var canUseTasty = getTastyCategory(BuilderState.quality) !== null;
  if (btn) {
    btn.style.display = 'none';
    btn.classList.toggle('active', TastyState.enabled);
    btn.classList.toggle('tasty-ready', canUseTasty && !TastyState.enabled);
    btn.disabled = !canUseTasty;
    btn.style.opacity = canUseTasty ? '' : '0.3';
  }

  var counter = document.getElementById('tasty-counter');
  var info = document.getElementById('tasty-info');

  var prevBtn = document.getElementById('btn-tasty-prev');
  var nextBtn = document.getElementById('btn-tasty-next');

  var active = TastyState.enabled && TastyState.currentIndex >= 0;
  if (active) {
    if (info) info.textContent = getTastyDiffText();
  } else {
    if (info) info.textContent = '';
  }
  bar.style.display = 'none';
  if (prevBtn) prevBtn.style.display = 'none';
  if (nextBtn) nextBtn.style.display = 'none';
  if (counter) counter.style.display = 'none';
  if (info) info.style.visibility = active ? '' : 'hidden';
  if (typeof updateChordDisplay === 'function') updateChordDisplay();
  else updateChordEngineDetail();
  if (typeof updateOctaveLabel === 'function') updateOctaveLabel();

  // Top-note filter buttons
  var degRow = document.getElementById('tasty-degrees-row');
  if (degRow) {
    degRow.innerHTML = '';
    degRow.style.display = 'none';
  }
}

// ========================================
// STOCK VOICING ENGINE
// ========================================

function getStockMappingName(quality, tension) {
  if (!quality) return null;
  if (!tension) return quality.name;
  if (typeof padGetBuilderChordName === 'function') {
    var chordName = padGetBuilderChordName(0, quality, tension, null, AppState.scaleIdx, AppState.key);
    return chordName.replace(/^[A-G](?:#|b)?/, '');
  }
  return quality.name;
}

// Map builder quality/tension → stock JSON category + subtype
function getStockMapping(quality, tension) {
  var n = getStockMappingName(quality, tension);
  if (!n) return null;
  // Major family
  if (n === '' || n === 'Maj') return { cat: 'major', sub: 'Maj7' };
  if (n === 'Maj7' || n === '\u25B37') return { cat: 'major', sub: 'Maj7' };
  if (n === 'Maj7(9)') return { cat: 'major', sub: 'Maj9' };
  if (n === 'Maj7(13)' || n === 'Maj7(9,13)' || n === 'Maj7(9,#11)') return { cat: 'major', sub: 'Maj13' };
  if (n === '6') return { cat: 'major', sub: 'Maj6' };
  if (n === '6/9' || n === '6/9(#11)' || n === '6.9' || n === '6.9(#11)' ||
      n === '6(9)' || n === '6(9,#11)') return { cat: 'major', sub: '6/9' };
  // Minor family
  if (n === 'm') return { cat: 'minor', sub: 'Min7' };
  if (n === 'm7') return { cat: 'minor', sub: 'Min7' };
  if (n === 'm7(9)') return { cat: 'minor', sub: 'Min9' };
  if (n === 'm7(11)' || n === 'm7(9,11)' || n === 'm7(9,13)' || n === 'm7(13)') return { cat: 'minor', sub: 'Min11' };
  if (n === 'mMaj7' || n === 'm\u25B37') return { cat: 'minor', sub: 'MinMaj7' };
  if (n === 'm6') return { cat: 'minor', sub: 'Min6' };
  if (n === 'm6/9' || n === 'm6(9)') return { cat: 'minor', sub: 'Min6' };
  // Dominant family
  if (n === '7' || /^7\(/.test(n)) return { cat: 'dominant', sub: 'Dom7' };
  if (n.indexOf('7sus4') === 0) return { cat: 'suspended', sub: 'Sus4' };
  // Half-diminished
  if (n === 'm7(b5)') return { cat: 'halfDiminished', sub: 'Min7b5' };
  if (n === 'm7(b5,11)' || n === 'm7(b5,9,11)' ||
      n === 'm7(b5)(11)' || n === 'm7(b5)(9,11)') return { cat: 'halfDiminished', sub: 'Min11b5' };
  // Diminished
  if (n === 'dim' || n === 'dim7') return { cat: 'diminished', sub: 'Dim7' };
  // Aug
  if (n === 'aug') return { cat: 'dominant', sub: 'Aug7' };
  return null;
}

function updateChordEngineTabs() {
  var tabs = document.getElementById('chord-engine-tabs');
  if (!tabs) return;
  var tastyBtn = document.getElementById('chord-engine-tasty');
  var stockBtn = document.getElementById('chord-engine-stock');
  var guitarBtn = document.getElementById('chord-engine-guitar');
  var nav = document.getElementById('chord-engine-nav');
  var counter = document.getElementById('chord-engine-counter');
  var chordDisplay = tabs.closest('.chord-display');
  var chordReady = AppState.mode === 'chord' && BuilderState.root !== null && BuilderState.quality;
  var canUseTasty = !!(chordReady && TastyState.hpsUnlocked && getTastyCategory(BuilderState.quality) !== null);
  var canUseStock = !!(chordReady && StockState.hpsUnlocked && getStockMapping(BuilderState.quality, BuilderState.tension));
  var showGuitar = !!(chordReady && typeof isGuitarEngineVisible === 'function' && isGuitarEngineVisible());
  var canUseGuitar = !!(chordReady && typeof isGuitarEngineAvailable === 'function' && isGuitarEngineAvailable());
  var tastyActive = !!(TastyState.enabled && TastyState.currentIndex >= 0);
  var stockActive = !!(StockState.enabled && StockState.currentIndex >= 0);
  var guitarActive = !!(typeof isGuitarEngineActive === 'function' && isGuitarEngineActive());
  var showTabs = canUseTasty || canUseStock || showGuitar;
  tabs.style.display = showTabs ? 'flex' : 'none';
  if (chordDisplay) chordDisplay.classList.toggle('has-engine-tabs', !!showTabs);
  if (chordDisplay) chordDisplay.classList.toggle('engine-guitar-active', guitarActive);
  if (tastyBtn) {
    tastyBtn.disabled = !canUseTasty;
    tastyBtn.classList.toggle('active', tastyActive);
  }
  if (stockBtn) {
    stockBtn.disabled = !canUseStock;
    stockBtn.classList.toggle('active', stockActive);
  }
  if (guitarBtn) {
    guitarBtn.style.display = showGuitar ? '' : 'none';
    guitarBtn.disabled = !showGuitar;
    guitarBtn.classList.toggle('is-unavailable', showGuitar && !canUseGuitar);
    guitarBtn.classList.toggle('active', guitarActive);
  }
  if (nav) nav.style.display = (tastyActive || stockActive) ? 'flex' : 'none';
  if (counter) {
    if (tastyActive) counter.textContent = (TastyState.currentIndex + 1) + '/' + TastyState.currentMatches.length;
    else if (stockActive) counter.textContent = (StockState.currentIndex + 1) + '/' + StockState.currentMatches.length;
    else if (guitarActive && typeof getGuitarEngineCounter === 'function') counter.textContent = getGuitarEngineCounter();
    else counter.textContent = '';
  }
  updateChordEngineDetail();
}

function cycleActiveVoicing(reverse) {
  if (TastyState.enabled && TastyState.currentIndex >= 0) {
    cycleTasty(!!reverse);
    return;
  }
  if (StockState.enabled && StockState.currentIndex >= 0) {
    cycleStock(!!reverse);
    return;
  }
  if (typeof isGuitarEngineActive === 'function' && isGuitarEngineActive() &&
      typeof cycleGuitarEngine === 'function') {
    cycleGuitarEngine(!!reverse);
  }
}

function renderTopFilterButtons(topSet, activeTop, onClickName, allCount) {
  var tops = Object.keys(topSet || {});
  var DEG_SEMI = {'1':0,'b9':1,'9':2,'#9':3,'b3':3,'3':4,'11':5,'#11':6,'b5':6,'5':7,'#5':8,'b13':8,'13':9,'6':9,'b7':10,'7':11};
  tops.sort(function(a, b) { return (DEG_SEMI[a] || 0) - (DEG_SEMI[b] || 0); });
  var html = '<button type="button" class="' + (activeTop === null ? 'active' : '') + '" onclick="' + onClickName + '(null)">ALL(' + allCount + ')</button>';
  tops.forEach(function(t) {
    html += '<button type="button" class="' + (activeTop === t ? 'active' : '') + '" onclick="' + onClickName + '(\'' + t + '\')">Top:' + t + '(' + topSet[t] + ')</button>';
  });
  return html;
}

function updateChordEngineDetail() {
  var detail = document.getElementById('chord-engine-detail');
  var textEl = document.getElementById('chord-engine-detail-text');
  var filterEl = document.getElementById('chord-engine-filter-row');
  if (!detail || !textEl || !filterEl) return;
  var tastyActive = TastyState.enabled && TastyState.currentIndex >= 0;
  var stockActive = StockState.enabled && StockState.currentIndex >= 0;
  var guitarActive = typeof isGuitarEngineActive === 'function' && isGuitarEngineActive();
  if (!tastyActive && !stockActive && !guitarActive) {
    detail.style.display = 'none';
    textEl.textContent = '';
    filterEl.innerHTML = '';
    return;
  }
  detail.style.display = '';
  if (tastyActive) {
    textEl.textContent = getTastyDetailText();
    if (TastyState.currentCategory && TastyState.voicings) {
      var allCat = TastyState.voicings.filter(function(v) { return v.cat === TastyState.currentCategory; });
      var topSet = {};
      allCat.forEach(function(v) { topSet[v.top] = (topSet[v.top] || 0) + 1; });
      filterEl.innerHTML = renderTopFilterButtons(topSet, TastyState.topFilter, 'setTastyTopFilter', allCat.length);
    } else {
      filterEl.innerHTML = '';
    }
  } else {
    textEl.textContent = stockActive ? getStockDetailText() :
      (typeof getGuitarEngineDetailText === 'function' ? getGuitarEngineDetailText() : '');
    if (guitarActive && typeof renderGuitarEngineControls === 'function') {
      renderGuitarEngineControls(filterEl);
    } else {
      filterEl.innerHTML = '';
    }
  }
  textEl.style.display = textEl.textContent ? '' : 'none';
}

function updateStockMatches() {
  if (!StockState.data || !BuilderState.quality) {
    StockState.currentMatches = [];
    StockState.currentIndex = -1;
    return;
  }
  var mapping = getStockMapping(BuilderState.quality, BuilderState.tension);
  if (!mapping) {
    StockState.currentMatches = [];
    StockState.currentIndex = -1;
    return;
  }
  StockState.currentCategory = mapping.cat;
  StockState.currentSubtype = mapping.sub;
  var catData = StockState.data[mapping.cat];
  if (!catData) { StockState.currentMatches = []; StockState.currentIndex = -1; return; }

  // Collect all voicings from matching subtype
  var matches = [];
  // Primary subtype
  if (catData[mapping.sub]) {
    matches = matches.concat(catData[mapping.sub]);
  }
  // Also check tension-extended subtypes (e.g. Min9, Min11 for Min7)
  var keys = Object.keys(catData);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] !== mapping.sub && catData[keys[i]]) {
      matches = matches.concat(catData[keys[i]]);
    }
  }
  // Also add rootless and spread voicings if they have applicable entries
  if (mapping.cat === 'major' || mapping.cat === 'minor' || mapping.cat === 'dominant') {
    var rootless = StockState.data.rootless;
    var spread = StockState.data.spread;
    if (rootless) {
      var typeA = rootless.TypeA || [];
      var typeB = rootless.TypeB || [];
      var all = typeA.concat(typeB);
      for (var j = 0; j < all.length; j++) {
        // Match by category keyword in name
        var nm = all[j].name.toLowerCase();
        if (mapping.cat === 'minor' && nm.indexOf('min') >= 0) matches.push(all[j]);
        else if (mapping.cat === 'dominant' && nm.indexOf('dom') >= 0) matches.push(all[j]);
        else if (mapping.cat === 'major' && nm.indexOf('maj') >= 0) matches.push(all[j]);
      }
    }
  }
  // Filter out note-only entries (empty LH+RH)
  StockState.currentMatches = matches.filter(function(v) {
    return (v.LH && v.LH.length > 0) || (v.RH && v.RH.length > 0);
  });
  StockState.currentIndex = -1;
}

function stockDegreesToMidi(rootMidi, degrees) {
  // Convert degree array to MIDI notes, each note above previous (same as buildTastyVoicing)
  return buildTastyVoicing(rootMidi, degrees);
}

function cycleStock(reverse) {
  if (!StockState.enabled || StockState.currentMatches.length === 0) return;
  var len = StockState.currentMatches.length;
  StockState.currentIndex = reverse
    ? (StockState.currentIndex - 1 + len) % len
    : (StockState.currentIndex + 1) % len;
  var entry = StockState.currentMatches[StockState.currentIndex];

  // Convert LH/RH degrees to MIDI notes
  // LH starts from root MIDI 36, RH from root MIDI 48 — avoid low interval limit violations.
  var rootPC = BuilderState.root;
  var lhRoot = 36 + rootPC;
  var rhRoot = 48 + rootPC;
  var rawStockItems = [];
  if (entry.LH && entry.LH.length > 0) rawStockItems = rawStockItems.concat(buildTastyVoicingItems(lhRoot, entry.LH, 'lh'));
  if (entry.RH && entry.RH.length > 0) rawStockItems = rawStockItems.concat(buildTastyVoicingItems(rhRoot, entry.RH, 'rh'));
  var rawLhItems = rawStockItems.filter(function(item) { return item.hand === 'lh'; });
  var rawRhItems = rawStockItems.filter(function(item) { return item.hand === 'rh'; });
  StockState.rawLhMidi = voicingItemsToMidi(rawLhItems);
  StockState.rawRhMidi = voicingItemsToMidi(rawRhItems);
  StockState.rawLhDegrees = voicingItemsToDegrees(rawLhItems);
  StockState.rawRhDegrees = voicingItemsToDegrees(rawRhItems);
  var stockItems = rawStockItems;
  var lhItems = stockItems.filter(function(item) { return item.hand === 'lh'; });
  var rhItems = stockItems.filter(function(item) { return item.hand === 'rh'; });
  StockState.lhMidi = voicingItemsToMidi(lhItems);
  StockState.rhMidi = voicingItemsToMidi(rhItems);
  StockState.lhDegrees = voicingItemsToDegrees(lhItems);
  StockState.rhDegrees = voicingItemsToDegrees(rhItems);

  // Build degree map for all notes
  StockState.degreeMap = buildDegreeMapFromItems(stockItems);
  var allNotes = StockState.lhMidi.concat(StockState.rhMidi);
  fitStockVoicingToPad(allNotes);
  StockState.padPositions = padFindCompactPositions(allNotes, ROWS, COLS, baseMidi(), ROW_INTERVAL, StockState.degreeMap);

  updateStockUI();
  render();
  // Play all notes
  playMidiNotes(getStockPlaybackNotes(allNotes));
}

// Transpose current STOCK voicing by delta semitones (called on ArrowLeft/Right)
// Uses direct MIDI offset to preserve pad position shape
function refreshStockVoicing(delta) {
  if (!StockState.enabled || StockState.currentIndex < 0) return;
  var entry = StockState.currentMatches[StockState.currentIndex];
  if (!entry) return;
  var stockItems = [];
  var lhDegrees = StockState.lhDegrees && StockState.lhDegrees.length === StockState.lhMidi.length ? StockState.lhDegrees : (entry.LH || []);
  var rhDegrees = StockState.rhDegrees && StockState.rhDegrees.length === StockState.rhMidi.length ? StockState.rhDegrees : (entry.RH || []);
  for (var i = 0; i < StockState.lhMidi.length; i++) {
    stockItems.push({ midi: StockState.lhMidi[i] + delta, degree: lhDegrees[i], hand: 'lh', originalIndex: i });
  }
  for (var j = 0; j < StockState.rhMidi.length; j++) {
    stockItems.push({ midi: StockState.rhMidi[j] + delta, degree: rhDegrees[j], hand: 'rh', originalIndex: StockState.lhMidi.length + j });
  }
  var rawStockItems = stockItems;
  var rawLhItems = rawStockItems.filter(function(item) { return item.hand === 'lh'; });
  var rawRhItems = rawStockItems.filter(function(item) { return item.hand === 'rh'; });
  StockState.rawLhMidi = voicingItemsToMidi(rawLhItems);
  StockState.rawRhMidi = voicingItemsToMidi(rawRhItems);
  StockState.rawLhDegrees = voicingItemsToDegrees(rawLhItems);
  StockState.rawRhDegrees = voicingItemsToDegrees(rawRhItems);
  stockItems = rawStockItems;
  var lhItems = stockItems.filter(function(item) { return item.hand === 'lh'; });
  var rhItems = stockItems.filter(function(item) { return item.hand === 'rh'; });
  StockState.lhMidi = voicingItemsToMidi(lhItems);
  StockState.rhMidi = voicingItemsToMidi(rhItems);
  StockState.lhDegrees = voicingItemsToDegrees(lhItems);
  StockState.rhDegrees = voicingItemsToDegrees(rhItems);
  StockState.degreeMap = buildDegreeMapFromItems(stockItems);
  var allNotes = StockState.lhMidi.concat(StockState.rhMidi);
  fitStockVoicingToPad(allNotes);
  StockState.padPositions = padFindCompactPositions(allNotes, ROWS, COLS, baseMidi(), ROW_INTERVAL, StockState.degreeMap);
  updateStockUI();
}

function refreshStockPadLayout() {
  refreshStockVoicing(0);
}

function refreshActiveVoicingPadLayout() {
  if (TastyState.enabled) refreshTastyPadLayout();
  if (StockState.enabled) refreshStockPadLayout();
}

function toggleStock() {
  if (!StockState.hpsUnlocked || !StockState.data) return;
  if (AppState.mode !== 'chord' || BuilderState.root === null || !BuilderState.quality) return;

  if (StockState.enabled) {
    disableStock();
  } else {
    // Disable TASTY if active (mutually exclusive)
    if (TastyState.enabled) disableTasty();
    if (typeof disableGuitarEngine === 'function') disableGuitarEngine({ render: false });
    // Clear stale state before enable (defensive: prior chord's voicing must not leak)
    StockState.currentIndex = -1;
    StockState.rawLhMidi = [];
    StockState.rawRhMidi = [];
    StockState.rawLhDegrees = [];
    StockState.rawRhDegrees = [];
    StockState.lhMidi = [];
    StockState.rhMidi = [];
    StockState.lhDegrees = [];
    StockState.rhDegrees = [];
    StockState.degreeMap = {};
    StockState.padPositions = [];
    StockState.enabled = true;
    updateStockMatches();
    if (StockState.currentMatches.length > 0) {
      cycleStock();
    } else {
      StockState.enabled = false;
      updateStockUI();
    }
  }
}

function disableStock() {
  if (!StockState.enabled) return;
  StockState.enabled = false;
  StockState.currentIndex = -1;
  StockState.rawLhMidi = [];
  StockState.rawRhMidi = [];
  StockState.rawLhDegrees = [];
  StockState.rawRhDegrees = [];
  StockState.lhMidi = [];
  StockState.rhMidi = [];
  StockState.lhDegrees = [];
  StockState.rhDegrees = [];
  StockState.degreeMap = {};
  StockState.padPositions = [];
  // Clean up Stock reflect
  if (typeof _stockReflectMode !== 'undefined' && _stockReflectMode) {
    _stockReflectMode = false;
    _voicingAltMode = 0;
    _instrumentMidiSet = null;
    _instrumentPadSet = null;
    _voicingLayoutCount = 1;
  }
  updateStockUI();
  render();
}

function stockEntryNameToDisplay(root, name) {
  if (!root || !name) return '';
  var n = String(name).trim();
  if (!n) return '';
  if (/^Cmaj/i.test(n)) return root + 'Maj' + n.slice(4);
  if (/^Cm/i.test(n)) return root + 'm' + n.slice(2);
  if (/^Cdim/i.test(n)) return root + 'dim' + n.slice(4);
  if (/^Caug/i.test(n)) return root + 'aug' + n.slice(4);
  if (/^C(?=\d|sus|\(|$)/.test(n)) return root + n.slice(1);

  if (/^Maj6/.test(n)) return root + '6' + n.slice(4);
  if (/^Maj7/.test(n)) return root + 'Maj7' + n.slice(4);
  if (/^Maj9/.test(n)) return root + 'Maj9' + n.slice(4);
  if (/^Maj13/.test(n)) return root + 'Maj13' + n.slice(5);
  if (/^MinMaj7/.test(n)) return root + 'mMaj7' + n.slice(7);
  if (/^Min11b5/.test(n)) return root + 'm11(b5)' + n.slice(8);
  if (/^Min7b5/.test(n)) return root + 'm7(b5)' + n.slice(7);
  if (/^Min11/.test(n)) return root + 'm11' + n.slice(5);
  if (/^Min9/.test(n)) return root + 'm9' + n.slice(4);
  if (/^Min7/.test(n)) return root + 'm7' + n.slice(4);
  if (/^Min6/.test(n)) return root + 'm6' + n.slice(4);
  if (/^Dom/.test(n)) return root + n.slice(3);
  if (/^Dim7/.test(n)) return root + 'dim7' + n.slice(4);
  if (/^Aug7/.test(n)) return root + 'aug7' + n.slice(4);
  return root + n;
}

function stockDominantDisplayNameFromDegrees(root, entry) {
  if (!root || !entry) return '';
  var degrees = (entry.LH || []).concat(entry.RH || []);
  var has = function(d) { return degrees.indexOf(d) >= 0; };
  if (!has('b7')) return '';

  var tokens = [];
  var add = function(label) {
    if (tokens.indexOf(label) < 0) tokens.push(label);
  };

  if (has('b9')) add('b9');
  if (has('#9')) add('#9');
  if (has('9')) add('9');
  if (has('11')) add('11');
  if (has('b5')) add('b5');
  if (has('#11')) add('#11');
  if (has('#5') || has('b13')) add('b13');
  if (has('13')) add('13');

  return root + '7' + (tokens.length ? '(' + tokens.join(',') + ')' : '');
}

function normalizeStockChordTypeName(name) {
  if (!name) return '';
  var n = String(name).trim();
  n = n.replace(/\s*\(Type\s+[AB]\)\s*$/i, '');
  if (/^Cmaj/i.test(n)) return 'Maj' + n.slice(4);
  if (/^Cm(?!aj)/i.test(n)) return 'm' + n.slice(2);
  if (/^Cdim/i.test(n)) return 'dim' + n.slice(4);
  if (/^Caug/i.test(n)) return 'aug' + n.slice(4);
  if (/^C(?=\d|sus|\(|$)/i.test(n)) return n.slice(1);
  if (/^MinMaj/i.test(n)) return 'mMaj' + n.slice(6);
  if (/^Min/i.test(n)) return 'm' + n.slice(3);
  if (/^Dom/i.test(n)) return n.slice(3);
  return n;
}

function addStockTensionToken(mods, token) {
  if (!token) return;
  var t = String(token).trim();
  if (!t) return;
  if (t === 'sus4') { mods.replace3 = 5; return; }
  if (t === 'sus2') { mods.replace3 = 2; return; }
  if (t === 'b5') { mods.flat5 = true; return; }
  if (t === '#5' || t === 'aug') { mods.sharp5 = true; return; }
  var pc = TENSION_NAME_TO_PC ? TENSION_NAME_TO_PC[t] : undefined;
  if (pc === undefined) return;
  if (!mods.add) mods.add = [];
  if (mods.add.indexOf(pc) < 0) mods.add.push(pc);
}

function normalizeStockTensionLabel(label) {
  return String(label || '').replace(/\s+/g, '');
}

function stockTensionLabelExists(label) {
  if (!label) return true;
  var target = normalizeStockTensionLabel(label);
  for (var r = 0; r < TENSION_ROWS.length; r++) {
    for (var c = 0; c < (TENSION_ROWS[r] ? TENSION_ROWS[r].length : 0); c++) {
      var t = TENSION_ROWS[r][c];
      if (t && normalizeStockTensionLabel(t.label) === target) return true;
    }
  }
  return false;
}

function getStockBuilderSelectionFromName(name) {
  var n = normalizeStockChordTypeName(name);
  if (!n) return null;
  var qName = null;
  var mods = {};
  var parenMatch = n.match(/\(([^)]*)\)/);
  var base = n.replace(/\s*\([^)]*\)\s*/g, '');

  if (/^mMaj7/i.test(base)) qName = 'mMaj7';
  else if (/^m(?:7)?(?:b5|\-5)|^m11b5/i.test(base) || /m7\s*\(\s*b5/i.test(n) || /m11\s*\(\s*b5/i.test(n)) qName = 'm7(b5)';
  else if (/^m6/i.test(base)) qName = 'm6';
  else if (/^m(?:7|9|11|13)/i.test(base)) qName = 'm7';
  else if (/^(?:Maj)?6(?:\/|\.)9/i.test(base) || /^6$/i.test(base)) qName = '6';
  else if (/^Maj6/i.test(base)) qName = '6';
  else if (/^Maj(?:7|9|13)/i.test(base)) qName = 'Maj7';
  else if (/^7sus4/i.test(base)) { qName = '7'; mods.replace3 = 5; }
  else if (/^(?:13|11|9|7)/i.test(base)) qName = '7';
  else if (/^aug7/i.test(base)) { qName = '7'; mods.sharp5 = true; }
  else if (/^aug/i.test(base)) qName = 'aug';
  else if (/^dim7/i.test(base)) qName = 'dim7';
  else if (/^dim/i.test(base)) qName = 'dim';

  if (/^(?:Maj)?6(?:\/|\.)9/i.test(base)) addStockTensionToken(mods, '9');
  if (/^Maj9/i.test(base)) addStockTensionToken(mods, '9');
  if (/^Maj13/i.test(base)) addStockTensionToken(mods, '13');
  if (/^m9/i.test(base)) addStockTensionToken(mods, '9');
  if (/^m11/i.test(base)) { addStockTensionToken(mods, '9'); addStockTensionToken(mods, '11'); }
  if (/^m13/i.test(base)) addStockTensionToken(mods, '13');
  if (/^9/i.test(base)) addStockTensionToken(mods, '9');
  if (/^11/i.test(base)) { addStockTensionToken(mods, '9'); addStockTensionToken(mods, '11'); }
  if (/^13/i.test(base)) { addStockTensionToken(mods, '9'); addStockTensionToken(mods, '13'); }

  if (parenMatch) {
    parenMatch[1].split(',').forEach(function(token) {
      addStockTensionToken(mods, token);
    });
  }

  if (qName === '7' && mods.sharp5) {
    delete mods.sharp5;
    addStockTensionToken(mods, 'b13');
  }

  var quality = qName ? findQualityByName(qName) : null;
  if (!quality) return null;
  if (mods.add) {
    mods.add = mods.add.filter(function(pc) {
      return quality.pcs.indexOf(((pc % 12) + 12) % 12) < 0;
    });
    if (mods.add.length === 0) delete mods.add;
  }
  if (mods.flat5 && quality.pcs.indexOf(6) >= 0) delete mods.flat5;
  if (mods.sharp5 && quality.pcs.indexOf(8) >= 0) delete mods.sharp5;
  return {
    quality: quality,
    tensionLabel: (mods.add || mods.replace3 || mods.sharp5 || mods.flat5) ? findTensionLabel(mods, quality) : ''
  };
}

function getStockBuilderSelectionFromDegrees(entry, preferredQuality) {
  if (!entry) return null;
  var degrees = (entry.LH || []).concat(entry.RH || []);
  var pcSet = { 0: true };
  degrees.forEach(function(deg) {
    var iv = TASTY_DEGREE_MAP[deg];
    if (iv !== undefined) pcSet[((iv % 12) + 12) % 12] = true;
  });
  var pcs = Object.keys(pcSet).map(function(k) { return parseInt(k, 10); });
  var bestQuality = preferredQuality || null;
  if (!bestQuality) {
    var bestLen = 0;
    for (var r = 0; r < BUILDER_QUALITIES.length; r++) {
      for (var c = 0; c < BUILDER_QUALITIES[r].length; c++) {
        var q = BUILDER_QUALITIES[r][c];
        if (!q) continue;
        var ok = q.pcs.every(function(pc) { return pcSet[((pc % 12) + 12) % 12]; });
        if (ok && q.pcs.length > bestLen) {
          bestQuality = q;
          bestLen = q.pcs.length;
        }
      }
    }
  }
  if (!bestQuality) return null;
  var qSet = {};
  bestQuality.pcs.forEach(function(pc) { qSet[((pc % 12) + 12) % 12] = true; });
  var extras = pcs.filter(function(pc) { return pc !== 0 && !qSet[pc]; });
  return {
    quality: bestQuality,
    tensionLabel: extras.length ? findTensionLabel({ add: extras }, bestQuality) : ''
  };
}

function getStockBuilderSelection(entry) {
  var parsed = getStockBuilderSelectionFromName(entry && entry.name);
  if (parsed && stockTensionLabelExists(parsed.tensionLabel)) return parsed;
  var fromDegrees = getStockBuilderSelectionFromDegrees(entry, parsed && parsed.quality);
  if (fromDegrees && stockTensionLabelExists(fromDegrees.tensionLabel)) return fromDegrees;
  return parsed || fromDegrees;
}

function syncStockBuilderSelectionUI() {
  if (!StockState.enabled || StockState.currentIndex < 0) return;
  if (typeof refreshBuilderControlSelection !== 'function') return;
  var entry = StockState.currentMatches[StockState.currentIndex];
  var selection = getStockBuilderSelection(entry);
  if (selection) refreshBuilderControlSelection(selection);
}

function getStockChordDisplayName() {
  if (!StockState.enabled || StockState.currentIndex < 0) return getBuilderChordName() || '';
  var entry = StockState.currentMatches[StockState.currentIndex];
  if (!entry) return getBuilderChordName() || '';
  var root = BuilderState.root !== null ? pcName(BuilderState.root) : '';
  var dominantName = StockState.currentCategory === 'dominant' ? stockDominantDisplayNameFromDegrees(root, entry) : '';
  if (dominantName) return dominantName;
  var stockName = stockEntryNameToDisplay(root, entry.name);
  if (stockName) return stockName;
  var degrees = (entry.LH || []).concat(entry.RH || []);
  var has = function(d) { return degrees.indexOf(d) >= 0; };
  if (has('b3') && has('6') && has('9') && !has('b7')) return root + 'm6(9)';
  if (has('b3') && has('6') && !has('b7')) return root + 'm6';
  if (has('b3') && has('b7') && has('9')) return root + 'm9';
  if (has('b3') && has('b7')) return root + 'm7';
  if (has('3') && has('6') && has('9') && !has('b7') && !has('△7')) return root + '6(9)';
  if (has('3') && has('6') && !has('b7') && !has('△7')) return root + '6';
  return getBuilderChordName() || root;
}

function getStockInfoText() {
  if (!StockState.enabled || StockState.currentIndex < 0) return '';
  var entry = StockState.currentMatches[StockState.currentIndex];
  if (!entry) return '';
  // Chord name from actual STOCK degrees + all degrees (bottom to top, LH then RH merged)
  var chord = getStockChordDisplayName();
  var rootName = BuilderState.root !== null ? pcName(BuilderState.root) : '';
  var allDegrees = (StockState.lhDegrees || []).concat(StockState.rhDegrees || []);
  var allNotes = (StockState.lhMidi || []).concat(StockState.rhMidi || []);
  return allDegrees.length > 0 ? chord + ' ' + formatVoicingNoteDegreeText(allNotes, allDegrees, rootName, getBuilderVoicingDisplayContext()) : chord;
}

function getStockDetailText() {
  var summary = getStockActiveSummary();
  if (!summary) return '';
  return summary.topText || '';
}

function getStockActiveSummary() {
  if (!StockState.enabled || StockState.currentIndex < 0) return null;
  var entry = StockState.currentMatches[StockState.currentIndex];
  if (!entry) return null;
  var allDegrees = (StockState.lhDegrees || []).concat(StockState.rhDegrees || []);
  var allNotes = (StockState.lhMidi || []).concat(StockState.rhMidi || []);
  var rootName = BuilderState.root !== null ? pcName(BuilderState.root) : '';
  var displayContext = getBuilderVoicingDisplayContext();
  var parts = formatVoicingNoteDegreeParts(allNotes, allDegrees, rootName, displayContext);
  return {
    kind: 'Stock',
    count: (StockState.currentIndex + 1) + '/' + StockState.currentMatches.length,
    sourceName: entry.label || '',
    chordName: getStockChordDisplayName(),
    noteText: parts.noteText,
    degreeText: parts.degreeText,
    topText: formatVoicingTopText(allNotes, StockState.degreeMap, rootName, displayContext)
  };
}

function updateStockUI() {
  var bar = document.getElementById('stock-bar');
  if (!bar) return;
  bar.style.display = StockState.hpsUnlocked ? '' : 'none';

  var btn = document.getElementById('btn-stock');
  if (btn) {
    btn.style.display = 'none';
    btn.classList.toggle('active', StockState.enabled);
  }

  var counter = document.getElementById('stock-counter');
  var info = document.getElementById('stock-info');
  var prevBtn = document.getElementById('btn-stock-prev');
  var nextBtn = document.getElementById('btn-stock-next');

  var reflectBtn = document.getElementById('stock-reflect-btn');
  if (reflectBtn) reflectBtn.style.display = 'none';
  var active = StockState.enabled && StockState.currentIndex >= 0;
  if (active) {
    if (info) info.textContent = getStockInfoText();
    syncStockBuilderSelectionUI();
  } else {
    if (info) info.textContent = '';
    if (typeof refreshBuilderControlSelection === 'function') refreshBuilderControlSelection();
  }
  bar.style.display = 'none';
  if (prevBtn) prevBtn.style.display = 'none';
  if (nextBtn) nextBtn.style.display = 'none';
  if (counter) counter.style.display = 'none';
  if (info) info.style.visibility = active ? '' : 'hidden';
  if (typeof updateChordDisplay === 'function') updateChordDisplay();
  else updateChordEngineDetail();
}

// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  // TASTY
  TASTY_DEGREE_MAP, QUALITY_BASE_DEGREES,
  buildTastyVoicing, buildTastyVoicingItems, applyLowIntervalLimitToItems,
  voicingItemsToMidi, voicingItemsToDegrees, buildDegreeMapFromItems, makeVoicingItemsFromMidiDegrees,
  getTastyLabels, buildTastyDegreeMap,
  formatVoicingNoteName, formatVoicingNoteDegreeText, formatVoicingNoteDegreeParts, formatVoicingTopText, formatActiveVoicingSummary,
  getPracticalVoicingAudioNotes, getTastyPlaybackNotes, getStockPlaybackNotes,
  splitByPadRange, getTastyFitOctaveShift, fitTastyVoicingToPad,
  getVoicingFitOctaveShift, getStockFitOctaveShift, fitStockVoicingToPad,
  getTastyCategory, findQualityByName, updateTastyMatches, findTensionLabel,
  cycleTasty, refreshTastyVoicing, refreshTastyPadLayout, refreshActiveVoicingPadLayout,
  toggleTasty, disableTasty, setTastyTopFilter,
  getTastyFunctionQualityName, getTastyFunctionChordName,
  getTastyChordDisplayName, getTastyDiffText, getTastyActiveSummary, getTastyDegreeCategory, renderTastyDegreeBadges, updateTastyUI,
  // STOCK
  getStockMapping, updateChordEngineTabs, cycleActiveVoicing, updateChordEngineDetail, updateStockMatches, stockDegreesToMidi,
  cycleStock, refreshStockVoicing, refreshStockPadLayout, toggleStock, disableStock,
  stockEntryNameToDisplay, stockDominantDisplayNameFromDegrees, normalizeStockChordTypeName, stockTensionLabelExists, getStockBuilderSelectionFromName, getStockBuilderSelectionFromDegrees, getStockBuilderSelection,
  getStockChordDisplayName, getStockInfoText, getStockActiveSummary, updateStockUI,
};
