// ========================================
// DOUBLE STOP OVERLAY — Scale-mode two-note vocabulary
// ========================================

const DOUBLE_STOP_INTERVALS = [
  { id: 'third', label: '3rd', degreeSteps: 2 },
  { id: 'fourth', label: '4th', degreeSteps: 3 },
  { id: 'sixth', label: '6th', degreeSteps: 5 },
  { id: 'tritone', label: 'Tritone', semitones: [6] },
];

const DOUBLE_STOP_SCALE_SETS = [
  { id: 'major', label: 'Major / Ionian', pcs: [0, 2, 4, 5, 7, 9, 11], sources: [0, 21] },
  { id: 'mixolydian', label: 'Mixolydian', pcs: [0, 2, 4, 5, 7, 9, 10], sources: [4] },
  { id: 'dorian', label: 'Dorian', pcs: [0, 2, 3, 5, 7, 9, 10], sources: [1, 22, 23] },
  { id: 'melodic-minor', label: 'Melodic Minor', pcs: [0, 2, 3, 5, 7, 9, 11], sources: [24, 1] },
];

function doubleStopAvailableSets() {
  if (typeof AppState === 'undefined') return [];
  if (!doubleStopHpsUnlocked()) return [];
  return DOUBLE_STOP_SCALE_SETS.slice();
}

function doubleStopIsAvailable() {
  return doubleStopAvailableSets().length > 0;
}

function doubleStopHpsUnlocked() {
  if (typeof TastyState !== 'undefined' && TastyState.hpsUnlocked) return true;
  if (typeof StockState !== 'undefined' && StockState.hpsUnlocked) return true;
  try {
    return typeof window !== 'undefined'
      && window.location
      && new URLSearchParams(window.location.search).has('hps');
  } catch (_) {
    return false;
  }
}

function doubleStopPreferredSetIndexForScale(scaleIdx) {
  var sets = doubleStopAvailableSets();
  if (!sets.length) return 0;
  var exact = {
    0: 'major',
    1: 'dorian',
    4: 'mixolydian',
    24: 'melodic-minor',
  };
  var targetId = exact[scaleIdx];
  if (targetId) {
    var exactIdx = sets.findIndex(function(set) { return set.id === targetId; });
    if (exactIdx >= 0) return exactIdx;
  }
  var sourceIdx = sets.findIndex(function(set) {
    return set.sources && set.sources.indexOf(scaleIdx) !== -1;
  });
  if (sourceIdx >= 0) return sourceIdx;
  return sets.findIndex(function(set) { return set.id === 'major'; }) >= 0
    ? sets.findIndex(function(set) { return set.id === 'major'; })
    : 0;
}

function doubleStopResetToPreferredSet() {
  if (typeof DoubleStopState === 'undefined') return;
  DoubleStopState.scaleSetIndex = doubleStopPreferredSetIndexForScale(
    typeof AppState !== 'undefined' ? AppState.scaleIdx : 0
  );
  DoubleStopState.degreeIndex = 0;
  DoubleStopState.posIndex = 0;
}

function doubleStopActive() {
  return !!(typeof AppState !== 'undefined'
    && AppState.mode === 'scale'
    && typeof DoubleStopState !== 'undefined'
    && DoubleStopState.enabled
    && doubleStopIsAvailable());
}

function doubleStopCurrentSet() {
  var sets = doubleStopAvailableSets();
  if (!sets.length) return null;
  if (DoubleStopState.scaleSetIndex >= sets.length) DoubleStopState.scaleSetIndex = 0;
  return sets[DoubleStopState.scaleSetIndex] || sets[0];
}

function doubleStopCurrentInterval() {
  if (DoubleStopState.intervalIndex >= DOUBLE_STOP_INTERVALS.length) DoubleStopState.intervalIndex = 0;
  if (!doubleStopIntervalAvailable(DoubleStopState.intervalIndex)) {
    var available = doubleStopAvailableIntervalIndices();
    DoubleStopState.intervalIndex = available.length ? available[0] : 0;
  }
  return DOUBLE_STOP_INTERVALS[DoubleStopState.intervalIndex] || DOUBLE_STOP_INTERVALS[0];
}

function doubleStopDegreeCount() {
  var set = doubleStopCurrentSet();
  var interval = DOUBLE_STOP_INTERVALS[DoubleStopState.intervalIndex] || DOUBLE_STOP_INTERVALS[0];
  return doubleStopCandidatePairs(set, interval).length;
}

function doubleStopCurrentDegreeIndex() {
  var count = doubleStopDegreeCount();
  if (!count) return 0;
  if (DoubleStopState.degreeIndex >= count) DoubleStopState.degreeIndex = 0;
  if (DoubleStopState.degreeIndex < 0) DoubleStopState.degreeIndex = count - 1;
  return DoubleStopState.degreeIndex || 0;
}

function doubleStopDegreePc(index) {
  var set = doubleStopCurrentSet();
  var interval = DOUBLE_STOP_INTERVALS[DoubleStopState.intervalIndex] || DOUBLE_STOP_INTERVALS[0];
  var candidates = doubleStopCandidatePairs(set, interval);
  var pair = candidates[index || 0] || candidates[0];
  return pair ? ((pair.lower % 12) + 12) % 12 : AppState.key;
}

function doubleStopDegreeLabel(index) {
  var set = doubleStopCurrentSet();
  var interval = DOUBLE_STOP_INTERVALS[DoubleStopState.intervalIndex] || DOUBLE_STOP_INTERVALS[0];
  var candidates = doubleStopCandidatePairs(set, interval);
  var pair = candidates[index || 0] || candidates[0];
  if (!pair) return 'Root';
  return doubleStopMidiLabel(pair.lower) + '-' + doubleStopMidiLabel(pair.upper);
}

function doubleStopMidiLabel(midi) {
  var pc = ((midi % 12) + 12) % 12;
  var octave = Math.floor(midi / 12) - 1;
  return pcName(pc, AppState.key) + octave;
}

function doubleStopGridPositions(midi) {
  var bm = baseMidi();
  var out = [];
  for (var row = 0; row < ROWS; row++) {
    var col = midi - bm - row * ROW_INTERVAL;
    if (col >= 0 && col < COLS) out.push({ row: row, col: col });
  }
  return out;
}

function doubleStopGridPosition(midi) {
  var positions = doubleStopGridPositions(midi);
  return positions.length ? positions[0] : null;
}

function doubleStopIntervalAllowedBySet(set, interval) {
  if (!set || !interval) return false;
  if (interval.id === 'sixth') {
    return set.pcs.length > interval.degreeSteps && (set.pcs.indexOf(9) !== -1 || set.pcs.indexOf(8) !== -1);
  }
  if (interval.id === 'tritone') {
    return set.pcs.indexOf(6) !== -1;
  }
  if (interval.degreeSteps !== undefined) {
    return set.pcs.length > interval.degreeSteps;
  }
  return true;
}

function doubleStopMidiToScaleStep(set, midi) {
  if (!set || !set.pcs || !set.pcs.length) return null;
  var rel = midi - (AppState.key || 0);
  var pc = ((rel % 12) + 12) % 12;
  var degree = set.pcs.indexOf(pc);
  if (degree === -1) return null;
  var octave = Math.floor((rel - pc) / 12);
  return octave * set.pcs.length + degree;
}

function doubleStopScaleStepToMidi(set, step) {
  var len = set.pcs.length;
  var degree = ((step % len) + len) % len;
  var octave = Math.floor(step / len);
  return (AppState.key || 0) + set.pcs[degree] + octave * 12;
}

function doubleStopUpperMidiForStep(set, interval, step, lower) {
  if (interval.degreeSteps !== undefined) {
    return doubleStopScaleStepToMidi(set, step + interval.degreeSteps);
  }
  if (interval.semitones && interval.semitones.length) return lower + interval.semitones[0];
  return null;
}

function doubleStopCandidatePairs(set, interval) {
  if (!set || !interval || !doubleStopIntervalAllowedBySet(set, interval)) return [];
  var lo = baseMidi();
  var hi = lo + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  var byNotes = {};
  for (var midi = lo; midi <= hi; midi++) {
    var step = doubleStopMidiToScaleStep(set, midi);
    if (step === null) continue;
    var upper = doubleStopUpperMidiForStep(set, interval, step, midi);
    if (upper === null || upper > hi) continue;
    var lowerPositions = doubleStopGridPositions(midi);
    var upperPositions = doubleStopGridPositions(upper);
    if (!lowerPositions.length || !upperPositions.length) continue;
    var key = midi + ':' + upper;
    if (!byNotes[key]) {
      byNotes[key] = {
        step: step,
        lower: midi,
        upper: upper,
        lowerPositions: lowerPositions,
        upperPositions: upperPositions,
      };
    }
  }
  return Object.keys(byNotes).map(function(k) { return byNotes[k]; })
    .sort(function(a, b) { return a.step - b.step || a.lower - b.lower; });
}

function doubleStopBuildLayout(set, interval, posIndex) {
  if (!set || !interval) return { pairs: [], allPadIdxs: new Set(), playMap: {}, altCount: 0, badgePositions: null };
  if (!doubleStopIntervalAllowedBySet(set, interval)) return { pairs: [], allPadIdxs: new Set(), playMap: {}, altCount: 0, badgePositions: null };
  var candidates = doubleStopCandidatePairs(set, interval);
  if (!candidates.length) return { pairs: [], allPadIdxs: new Set(), playMap: {}, altCount: 0, badgePositions: null };
  if (DoubleStopState.degreeIndex >= candidates.length) DoubleStopState.degreeIndex = 0;
  if (DoubleStopState.degreeIndex < 0) DoubleStopState.degreeIndex = candidates.length - 1;
  var target = candidates[DoubleStopState.degreeIndex || 0];
  var arrangements = [];
  target.lowerPositions.forEach(function(lp) {
    target.upperPositions.forEach(function(up) {
      if (lp.row === up.row && lp.col === up.col) return;
      arrangements.push({
        notes: [target.lower, target.upper],
        positions: [lp, up],
        semitone: target.upper - target.lower,
      });
    });
  });
  if (!arrangements.length) return { pairs: [], allPadIdxs: new Set(), playMap: {}, altCount: 0, badgePositions: null };
  arrangements.sort(doubleStopCompareArrangements);
  var pairs = [];
  var allPadIdxs = new Set();
  var playMap = {};
  var altCount = arrangements.length;
  var normalizedPos = ((posIndex || 0) % arrangements.length + arrangements.length) % arrangements.length;
  DoubleStopState.posIndex = normalizedPos;
  var chosen = arrangements[normalizedPos];
  pairs.push(chosen);
  chosen.positions.forEach(function(p) {
    var idx = p.row * COLS + p.col;
    allPadIdxs.add(idx);
    playMap[idx] = chosen.notes.slice();
  });
  if (altCount <= 1) DoubleStopState.posIndex = 0;
  return {
    pairs: pairs,
    allPadIdxs: allPadIdxs,
    playMap: playMap,
    altCount: altCount,
    badgePositions: pairs.length ? pairs[0].positions : null,
  };
}

function doubleStopArrangementScore(arr) {
  if (!arr || !arr.positions || arr.positions.length < 2) return 9999;
  var a = arr.positions[0];
  var b = arr.positions[1];
  var rowDist = Math.abs(a.row - b.row);
  var colDist = Math.abs(a.col - b.col);
  var sameRowPenalty = rowDist === 0 ? 1000 : 0;
  var rowPenalty = rowDist <= 2 ? rowDist : rowDist * 10;
  var stretchPenalty = Math.max(0, colDist - 3) * 20;
  return sameRowPenalty + colDist * 12 + stretchPenalty + rowPenalty;
}

function doubleStopCompareArrangements(a, b) {
  return doubleStopArrangementScore(a) - doubleStopArrangementScore(b)
    || Math.abs(a.positions[0].row - a.positions[1].row) - Math.abs(b.positions[0].row - b.positions[1].row)
    || Math.abs(a.positions[0].col - a.positions[1].col) - Math.abs(b.positions[0].col - b.positions[1].col)
    || a.positions[0].row - b.positions[0].row
    || a.positions[0].col - b.positions[0].col;
}

function doubleStopComputeLayout() {
  var set = doubleStopCurrentSet();
  var interval = doubleStopCurrentInterval();
  return doubleStopBuildLayout(set, interval, DoubleStopState.posIndex || 0);
}

function doubleStopCurrentNotes() {
  if (!doubleStopActive()) return [];
  var layout = doubleStopComputeLayout();
  if (!layout.pairs || !layout.pairs.length || !layout.pairs[0].notes) return [];
  return layout.pairs[0].notes.slice();
}

function doubleStopPreferredStringPairs(intervalId, stringCount) {
  var pairs = [];
  var step = intervalId === 'sixth' ? 2 : 1;
  for (var s = 0; s + step < stringCount; s++) pairs.push([s, s + step]);
  return pairs;
}

function doubleStopGuitarForms(notes, interval, tuning, options) {
  if (!notes || notes.length < 2 || !interval || !tuning || !tuning.length) return [];
  var opts = options || {};
  var maxFret = opts.maxFret == null ? 21 : opts.maxFret;
  var maxSpan = opts.maxSpan == null ? 5 : opts.maxSpan;
  var lower = Math.min(notes[0], notes[1]);
  var upper = Math.max(notes[0], notes[1]);
  var pairs = doubleStopPreferredStringPairs(interval.id, tuning.length);
  var out = [];
  var seen = {};

  pairs.forEach(function(pair, pairIndex) {
    [
      { highStringNote: upper, lowStringNote: lower, orientationPenalty: 0 },
      { highStringNote: lower, lowStringNote: upper, orientationPenalty: 80 },
    ].forEach(function(assign) {
      var fHigh = assign.highStringNote - tuning[pair[0]];
      var fLow = assign.lowStringNote - tuning[pair[1]];
      if (fHigh < 0 || fHigh > maxFret || fLow < 0 || fLow > maxFret) return;
      var span = Math.abs(fHigh - fLow);
      if (span > maxSpan) return;
      var frets = new Array(tuning.length).fill(null);
      frets[pair[0]] = fHigh;
      frets[pair[1]] = fLow;
      var key = frets.join(',');
      if (seen[key]) return;
      seen[key] = true;
      var openPenalty = (fHigh === 0 || fLow === 0) ? 18 : 0;
      var avg = (fHigh + fLow) / 2;
      var highPositionPenalty = Math.max(0, avg - 9) * 3;
      var sameFretBonus = fHigh === fLow ? -8 : 0;
      out.push({
        frets: frets,
        stringPair: pair.slice(),
        notes: [assign.highStringNote, assign.lowStringNote],
        score: pairIndex * 8 + span * 18 + assign.orientationPenalty + openPenalty + highPositionPenalty + sameFretBonus,
      });
    });
  });

  out.sort(function(a, b) {
    return a.score - b.score
      || Math.abs(a.frets[a.stringPair[0]] - a.frets[a.stringPair[1]]) - Math.abs(b.frets[b.stringPair[0]] - b.frets[b.stringPair[1]])
      || a.stringPair[0] - b.stringPair[0]
      || (a.frets[a.stringPair[0]] + a.frets[a.stringPair[1]]) - (b.frets[b.stringPair[0]] + b.frets[b.stringPair[1]]);
  });
  return out;
}

function doubleStopIntervalAvailable(index) {
  var set = doubleStopCurrentSet();
  var interval = DOUBLE_STOP_INTERVALS[index];
  if (!set || !interval || !doubleStopIntervalAllowedBySet(set, interval)) return false;
  var prevDegree = DoubleStopState.degreeIndex;
  var prevPos = DoubleStopState.posIndex;
  var layout = doubleStopBuildLayout(set, interval, prevPos || 0);
  DoubleStopState.degreeIndex = prevDegree;
  DoubleStopState.posIndex = prevPos;
  return layout.pairs.length > 0;
}

function doubleStopAvailableIntervalIndices() {
  var out = [];
  for (var i = 0; i < DOUBLE_STOP_INTERVALS.length; i++) {
    if (doubleStopIntervalAvailable(i)) out.push(i);
  }
  return out;
}

function doubleStopPlayPad(row, col) {
  if (!doubleStopActive()) return false;
  var layout = doubleStopComputeLayout();
  var notes = layout.playMap[row * COLS + col];
  if (!notes || !notes.length) return false;
  if (typeof playMidiNotes === 'function') playMidiNotes(notes, 1.0);
  return true;
}

function doubleStopPlayCurrent() {
  if (!doubleStopActive()) return false;
  var layout = doubleStopComputeLayout();
  if (!layout.pairs || !layout.pairs.length) return false;
  var notes = layout.pairs[0].notes;
  if (!notes || !notes.length || typeof playMidiNotes !== 'function') return false;
  if (typeof ensureAudioResumed === 'function') ensureAudioResumed();
  playMidiNotes(notes, 1.0);
  return true;
}

function doubleStopSyncPush() {
  if (typeof window === 'undefined' || window._doubleStopPushSyncing) return;
  window._doubleStopPushSyncing = true;
  setTimeout(function() {
    try {
      if (typeof window._pushSyncPadPlaybackBlock === 'function') window._pushSyncPadPlaybackBlock();
      if (typeof window._pushRefreshPadLEDs === 'function') window._pushRefreshPadLEDs();
      if (typeof window._pushSyncScaleDisplay === 'function') window._pushSyncScaleDisplay();
    } finally {
      window._doubleStopPushSyncing = false;
    }
  }, 0);
}

function toggleDoubleStop(force) {
  if (!doubleStopIsAvailable()) {
    if (typeof DoubleStopState !== 'undefined') DoubleStopState.enabled = false;
    renderDoubleStopControls();
    if (typeof render === 'function') render();
    if (typeof saveAppSettings === 'function') saveAppSettings();
    return false;
  }
  DoubleStopState.enabled = force === undefined ? !DoubleStopState.enabled : force === true;
  if (DoubleStopState.enabled) DoubleStopState.degreeIndex = 0;
  DoubleStopState.posIndex = 0;
  renderDoubleStopControls();
  if (typeof render === 'function') render();
  if (typeof saveAppSettings === 'function') saveAppSettings();
  if (DoubleStopState.enabled) doubleStopPlayCurrent();
  doubleStopSyncPush();
  return true;
}

function cycleDoubleStopScaleSet(delta) {
  var sets = doubleStopAvailableSets();
  if (!sets.length) return false;
  DoubleStopState.enabled = true;
  DoubleStopState.scaleSetIndex = (DoubleStopState.scaleSetIndex + (delta < 0 ? -1 : 1) + sets.length) % sets.length;
  DoubleStopState.degreeIndex = 0;
  DoubleStopState.posIndex = 0;
  doubleStopCurrentInterval();
  renderDoubleStopControls();
  if (typeof render === 'function') render();
  if (typeof saveAppSettings === 'function') saveAppSettings();
  doubleStopPlayCurrent();
  doubleStopSyncPush();
  return true;
}

function cycleDoubleStopInterval(delta) {
  var available = doubleStopAvailableIntervalIndices();
  if (!available.length) return false;
  DoubleStopState.enabled = true;
  var current = available.indexOf(DoubleStopState.intervalIndex);
  if (current < 0) current = 0;
  DoubleStopState.intervalIndex = available[(current + (delta < 0 ? -1 : 1) + available.length) % available.length];
  DoubleStopState.posIndex = 0;
  renderDoubleStopControls();
  if (typeof render === 'function') render();
  if (typeof saveAppSettings === 'function') saveAppSettings();
  doubleStopPlayCurrent();
  doubleStopSyncPush();
  return true;
}

function cycleDoubleStopDegree(delta) {
  var count = doubleStopDegreeCount();
  if (!count) return false;
  DoubleStopState.enabled = true;
  DoubleStopState.degreeIndex = (doubleStopCurrentDegreeIndex() + (delta < 0 ? -1 : 1) + count) % count;
  DoubleStopState.posIndex = 0;
  renderDoubleStopControls();
  if (typeof render === 'function') render();
  if (typeof saveAppSettings === 'function') saveAppSettings();
  doubleStopPlayCurrent();
  doubleStopSyncPush();
  return true;
}

function cycleDoubleStopPosition() {
  if (!doubleStopActive()) return false;
  var layout = doubleStopComputeLayout();
  if (!layout.pairs || !layout.pairs.length) return false;
  if (layout.altCount > 1) {
    DoubleStopState.posIndex = ((DoubleStopState.posIndex || 0) + 1) % layout.altCount;
    if (typeof render === 'function') render();
  }
  doubleStopPlayCurrent();
  doubleStopSyncPush();
  return true;
}

function setDoubleStopScaleSet(index) {
  var sets = doubleStopAvailableSets();
  if (!sets.length) return;
  DoubleStopState.enabled = true;
  DoubleStopState.scaleSetIndex = Math.max(0, Math.min(sets.length - 1, index | 0));
  DoubleStopState.degreeIndex = 0;
  DoubleStopState.posIndex = 0;
  doubleStopCurrentInterval();
  renderDoubleStopControls();
  if (typeof render === 'function') render();
  if (typeof saveAppSettings === 'function') saveAppSettings();
  doubleStopPlayCurrent();
  doubleStopSyncPush();
}

function setDoubleStopDegree(index) {
  var count = doubleStopDegreeCount();
  if (!count) return false;
  DoubleStopState.degreeIndex = Math.max(0, Math.min(count - 1, index | 0));
  DoubleStopState.posIndex = 0;
  renderDoubleStopControls();
  if (typeof render === 'function') render();
  if (typeof saveAppSettings === 'function') saveAppSettings();
  doubleStopPlayCurrent();
  doubleStopSyncPush();
  return true;
}

function setDoubleStopInterval(index) {
  if (!doubleStopIntervalAvailable(index)) return false;
  DoubleStopState.enabled = true;
  DoubleStopState.intervalIndex = Math.max(0, Math.min(DOUBLE_STOP_INTERVALS.length - 1, index | 0));
  DoubleStopState.posIndex = 0;
  renderDoubleStopControls();
  if (typeof render === 'function') render();
  if (typeof saveAppSettings === 'function') saveAppSettings();
  doubleStopPlayCurrent();
  doubleStopSyncPush();
  return true;
}

function renderDoubleStopControls() {
  var wrap = document.getElementById('double-stop-controls');
  if (!wrap) return;
  var sets = doubleStopAvailableSets();
  var available = sets.length > 0;
  var isScaleMode = typeof AppState !== 'undefined' && AppState.mode === 'scale';
  wrap.style.display = (isScaleMode && available) ? '' : 'none';
  if (!isScaleMode) return;
  if (!available) {
    if (typeof DoubleStopState !== 'undefined') DoubleStopState.enabled = false;
    return;
  }
  wrap.classList.toggle('active', available && DoubleStopState.enabled);
  var toggleBtn = document.getElementById('double-stop-toggle');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', DoubleStopState.enabled);
    toggleBtn.disabled = false;
  }
  if (DoubleStopState.scaleSetIndex >= sets.length) DoubleStopState.scaleSetIndex = 0;
  doubleStopCurrentInterval();
  var sel = document.getElementById('double-stop-set');
  if (sel) {
    var html = sets.map(function(set, i) {
      return '<option value="' + i + '">' + set.label + '</option>';
    }).join('');
    if (sel.innerHTML !== html) sel.innerHTML = html;
    sel.value = String(DoubleStopState.scaleSetIndex);
    sel.disabled = false;
  }
  var degreeSel = document.getElementById('double-stop-degree');
  if (degreeSel) {
    var count = doubleStopDegreeCount();
    if (DoubleStopState.degreeIndex >= count) DoubleStopState.degreeIndex = 0;
    var degreeHtml = [];
    for (var d = 0; d < count; d++) {
      degreeHtml.push('<option value="' + d + '">' + doubleStopDegreeLabel(d) + '</option>');
    }
    var degreeText = degreeHtml.join('');
    if (degreeSel.innerHTML !== degreeText) degreeSel.innerHTML = degreeText;
    degreeSel.value = String(doubleStopCurrentDegreeIndex());
    degreeSel.disabled = false;
  }
  var intBtns = document.querySelectorAll('[data-double-stop-interval]');
  intBtns.forEach(function(b) {
    var idx = parseInt(b.getAttribute('data-double-stop-interval'), 10);
    var intervalOk = doubleStopIntervalAvailable(idx);
    b.style.display = intervalOk ? '' : 'none';
    b.classList.toggle('active', idx === DoubleStopState.intervalIndex);
    b.disabled = !intervalOk;
  });
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    DOUBLE_STOP_INTERVALS,
    DOUBLE_STOP_SCALE_SETS,
    doubleStopAvailableSets,
    doubleStopIsAvailable,
    doubleStopPreferredSetIndexForScale,
    doubleStopResetToPreferredSet,
    doubleStopActive,
    doubleStopHpsUnlocked,
    doubleStopCurrentSet,
    doubleStopCurrentInterval,
    doubleStopCurrentDegreeIndex,
    doubleStopDegreeLabel,
    doubleStopCandidatePairs,
    doubleStopIntervalAvailable,
    doubleStopAvailableIntervalIndices,
    doubleStopComputeLayout,
    doubleStopCurrentNotes,
    doubleStopPreferredStringPairs,
    doubleStopGuitarForms,
    doubleStopPlayPad,
    doubleStopPlayCurrent,
    doubleStopSyncPush,
    toggleDoubleStop,
    cycleDoubleStopScaleSet,
    cycleDoubleStopInterval,
    cycleDoubleStopDegree,
    cycleDoubleStopPosition,
    setDoubleStopScaleSet,
    setDoubleStopDegree,
    setDoubleStopInterval,
    renderDoubleStopControls,
  });
}
