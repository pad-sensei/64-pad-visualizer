// ========================================
// INCREMENTAL — Real-time chord name input for 64 Pad Explorer
// Ported from Master Rhythm Chart, adapted for Builder integration
// ========================================

var IncrementalState = {
  selectedIndex: 0,
  candidates: [],
  isOpen: false,
  isExtending: false,
};

// ======== INITIALIZATION ========

function initIncremental() {
  var input = document.getElementById('incremental-input');
  if (!input) return;

  input.addEventListener('input', function() {
    var candidates = generateIncrementalCandidates(input.value.trim());
    IncrementalState.candidates = candidates;
    IncrementalState.selectedIndex = 0;
    renderIncrementalDropdown(candidates);
  });

  input.addEventListener('keydown', handleIncrementalKeydown);

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.incremental-container')) {
      closeIncrementalDropdown();
    }
  });
}

// ======== CANDIDATE GENERATION ========

function generateIncrementalCandidates(input) {
  if (!input) return [];

  // Number only → memory recall
  if (/^\d+$/.test(input)) {
    var idx = parseInt(input) - 1;
    var results = [];
    for (var i = 0; i < PlainState.memory.length; i++) {
      var slotNum = String(i + 1);
      if (slotNum.indexOf(input) === 0 && PlainState.memory[i]) {
        results.push({
          type: 'memory',
          index: i,
          name: PlainState.memory[i].chordName || ('Slot ' + (i + 1)),
          label: slotNum + ': ' + (PlainState.memory[i].chordName || 'Slot ' + (i + 1)),
        });
      }
    }
    return results;
  }

  // Root extraction
  var rootMatch = input.match(/^([A-Ga-g])([#b]?)/);
  if (!rootMatch) return [];

  var rootWasLower = rootMatch[1] === rootMatch[1].toLowerCase();
  var rootStr = rootMatch[1].toUpperCase() + rootMatch[2];
  var qualityInput = input.slice(rootMatch[0].length);

  // Slash chord branch
  var slashIdx = qualityInput.indexOf('/');
  if (slashIdx >= 0) {
    var quality = qualityInput.slice(0, slashIdx);
    var bassInput = qualityInput.slice(slashIdx + 1);
    return generateIncrementalSlash(rootStr, quality, bassInput);
  }

  // QUALITY_KEYS prefix match
  var candidates = [];
  for (var k = 0; k < QUALITY_KEYS.length; k++) {
    var qKey = QUALITY_KEYS[k];
    if (qKey.indexOf(qualityInput) === 0 || qKey.toLowerCase().indexOf(qualityInput.toLowerCase()) === 0) {
      var fullName = rootStr + qKey;
      var parsed = padParseChordName(fullName);
      if (parsed) {
        candidates.push({
          type: 'chord',
          name: parsed.displayName,
          quality: qKey,
          exactMatch: qKey === qualityInput || qKey.toLowerCase() === qualityInput.toLowerCase(),
        });
      }
    }
  }

  // Sort: exact match first, then case-aware boost, then shorter quality
  var wantMinor = (rootWasLower && !qualityInput) ||
                  (qualityInput.length > 0 && qualityInput[0] === 'm');
  var wantMajor = qualityInput.length > 0 && qualityInput[0] === 'M';

  candidates.sort(function(a, b) {
    if (a.exactMatch !== b.exactMatch) return (b.exactMatch ? 1 : 0) - (a.exactMatch ? 1 : 0);
    if (wantMinor) {
      var aM = a.quality.indexOf('m') === 0 ? 1 : 0;
      var bM = b.quality.indexOf('m') === 0 ? 1 : 0;
      if (aM !== bM) return bM - aM;
    } else if (wantMajor) {
      var aJ = (a.quality.indexOf('M') === 0 || a.quality.indexOf('maj') === 0) ? 1 : 0;
      var bJ = (b.quality.indexOf('M') === 0 || b.quality.indexOf('maj') === 0) ? 1 : 0;
      if (aJ !== bJ) return bJ - aJ;
    }
    return a.quality.length - b.quality.length;
  });

  return candidates.slice(0, 12);
}

function generateIncrementalSlash(rootStr, quality, bassInput) {
  var baseCheck = rootStr + quality;
  if (quality && !padParseChordName(baseCheck)) return [];

  var results = [];
  for (var i = 0; i < NOTE_NAMES_SHARP.length; i++) {
    var note = NOTE_NAMES_SHARP[i];
    if (!bassInput || note.toLowerCase().indexOf(bassInput.toLowerCase()) === 0) {
      var fullName = rootStr + quality + '/' + note;
      var parsed = padParseChordName(fullName);
      if (parsed) {
        results.push({ type: 'chord', name: parsed.displayName });
      }
    }
  }
  return results.slice(0, 12);
}

// ======== EXTENSION CANDIDATES ========

function generateIncrementalExtensions(baseName) {
  var rootMatch = baseName.match(/^([A-G][#b]?)/);
  if (!rootMatch) return [];
  var rootStr = rootMatch[1];
  var baseQuality = baseName.slice(rootStr.length);

  var candidates = [];
  for (var k = 0; k < QUALITY_KEYS.length; k++) {
    var qKey = QUALITY_KEYS[k];
    if (qKey.length > baseQuality.length && qKey.indexOf(baseQuality) === 0) {
      var fullName = rootStr + qKey;
      var parsed = padParseChordName(fullName);
      if (parsed) {
        candidates.push({ type: 'chord', name: parsed.displayName, quality: qKey });
      }
    }
  }
  candidates.sort(function(a, b) { return a.quality.length - b.quality.length; });
  candidates.push({ type: 'action', name: baseName + '/...', label: '\u2192 On-chord' });
  return candidates.slice(0, 12);
}

// ======== DROPDOWN RENDERING ========

function renderIncrementalDropdown(candidates) {
  var dropdown = document.getElementById('incremental-dropdown');
  if (!dropdown) return;

  if (candidates.length === 0) {
    closeIncrementalDropdown();
    return;
  }

  dropdown.innerHTML = '';
  IncrementalState.isOpen = true;
  dropdown.classList.add('active');

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var div = document.createElement('div');
    div.className = 'incremental-candidate' + (i === IncrementalState.selectedIndex ? ' selected' : '');
    div.textContent = c.label || c.name;
    div.setAttribute('data-idx', i);
    div.addEventListener('mousedown', (function(candidate) {
      return function(e) {
        e.preventDefault();
        commitToBuilder(candidate);
      };
    })(c));
    div.addEventListener('mouseenter', (function(idx) {
      return function() {
        IncrementalState.selectedIndex = idx;
        updateIncrementalSelection();
      };
    })(i));
    dropdown.appendChild(div);
  }
}

function updateIncrementalSelection() {
  var dropdown = document.getElementById('incremental-dropdown');
  if (!dropdown) return;
  var items = dropdown.querySelectorAll('.incremental-candidate');
  for (var i = 0; i < items.length; i++) {
    items[i].classList.toggle('selected', i === IncrementalState.selectedIndex);
  }
}

function closeIncrementalDropdown() {
  var dropdown = document.getElementById('incremental-dropdown');
  if (dropdown) {
    dropdown.innerHTML = '';
    dropdown.classList.remove('active');
  }
  IncrementalState.isOpen = false;
  IncrementalState.isExtending = false;
  IncrementalState.candidates = [];
  IncrementalState.selectedIndex = 0;
}

// ======== COMMIT TO BUILDER ========

function commitToBuilder(candidate) {
  var input = document.getElementById('incremental-input');
  if (!input) return;

  if (candidate.type === 'action') {
    var baseName = candidate.name.replace('/...', '');
    input.value = baseName + '/';
    IncrementalState.isExtending = false;
    input.dispatchEvent(new Event('input'));
    return;
  }

  if (candidate.type === 'memory') {
    // Recall memory slot into builder
    if (PlainState.memory[candidate.index]) {
      var slot = PlainState.memory[candidate.index];
      if (typeof recallMemory === 'function') {
        recallMemory(candidate.index);
      }
    }
    input.value = '';
    closeIncrementalDropdown();
    input.focus();
    return;
  }

  // Parse the chord name and map to Builder state
  var parsed = padParseChordName(candidate.name);
  if (!parsed) return;

  // Set mode to chord if not already
  if (AppState.mode !== 'chord') {
    if (typeof setMode === 'function') setMode('chord');
  }

  // Set root
  BuilderState.root = parsed.root;

  // Match quality: find BUILDER_QUALITIES entry matching the parsed intervals
  var matchedQuality = _matchBuilderQuality(parsed.intervals);
  if (matchedQuality) {
    BuilderState.quality = matchedQuality.quality;
    BuilderState.tension = matchedQuality.tension;
  } else {
    // Fallback: construct a quality from the first 3-4 core intervals
    var coreIntervals = parsed.intervals.filter(function(iv) { return iv < 12; });
    var fallbackQ = null;
    for (var r = 0; r < BUILDER_QUALITIES.length; r++) {
      for (var c = 0; c < BUILDER_QUALITIES[r].length; c++) {
        var q = BUILDER_QUALITIES[r][c];
        if (q && _pcsMatch(q.pcs, coreIntervals)) {
          fallbackQ = q;
          break;
        }
      }
      if (fallbackQ) break;
    }
    BuilderState.quality = fallbackQ || BUILDER_QUALITIES[0][0]; // default to Maj
    BuilderState.tension = null;
  }

  // Set bass for slash chords
  BuilderState.bass = parsed.bass;
  BuilderState._fromDiatonic = false;
  resetVoicingSelection();

  // Update builder UI
  if (typeof updateKeyButtons === 'function') updateKeyButtons();
  if (typeof highlightQuality === 'function') highlightQuality(BuilderState.quality);
  if (typeof clearTensionSelection === 'function') clearTensionSelection();
  if (typeof updateControlsForQuality === 'function') updateControlsForQuality(BuilderState.quality);
  if (typeof setBuilderStep === 'function') setBuilderStep(2);
  if (typeof render === 'function') render();
  if (typeof playCurrentChord === 'function') playCurrentChord();

  input.value = '';
  closeIncrementalDropdown();
  input.focus();
}

// Match parsed intervals to BUILDER_QUALITIES + TENSION_ROWS
function _matchBuilderQuality(intervals) {
  // Separate core (< 12) from compound (>= 12)
  var core = [];
  var compound = [];
  for (var i = 0; i < intervals.length; i++) {
    if (intervals[i] < 12) core.push(intervals[i]);
    else compound.push(intervals[i] % 12);
  }

  // Try each quality
  for (var r = 0; r < BUILDER_QUALITIES.length; r++) {
    for (var c = 0; c < BUILDER_QUALITIES[r].length; c++) {
      var q = BUILDER_QUALITIES[r][c];
      if (!q) continue;

      // Check if quality PCS is a subset of the core intervals
      var qualityMatch = true;
      for (var pi = 0; pi < q.pcs.length; pi++) {
        if (core.indexOf(q.pcs[pi]) < 0) { qualityMatch = false; break; }
      }
      if (!qualityMatch) continue;

      // Check remaining core intervals match quality exactly (no extra core tones)
      var extraCore = core.filter(function(pc) { return q.pcs.indexOf(pc) < 0; });

      // If there are compound tensions or extra core tones, find a matching tension
      if (compound.length > 0 || extraCore.length > 0) {
        var tension = _findMatchingTension(q, extraCore, compound);
        if (tension) return { quality: q, tension: tension };
        // If no tension found but quality matches core exactly, still return without tension
        if (extraCore.length === 0 && compound.length === 0) return { quality: q, tension: null };
      } else {
        return { quality: q, tension: null };
      }
    }
  }
  return null;
}

function _findMatchingTension(quality, extraCore, compound) {
  for (var row = 0; row < TENSION_ROWS.length; row++) {
    for (var col = 0; col < TENSION_ROWS[row].length; col++) {
      var t = TENSION_ROWS[row][col];
      if (!t) continue;

      // Apply tension mods to quality pcs and check if result matches
      var applied = padApplyTension(quality.pcs, t.mods);
      var appliedCore = applied.filter(function(iv) { return iv < 12; });
      var appliedCompound = applied.filter(function(iv) { return iv >= 12; }).map(function(iv) { return iv % 12; });

      // Check: all extra core tones accounted for
      var coreOk = true;
      for (var i = 0; i < extraCore.length; i++) {
        if (appliedCore.indexOf(extraCore[i]) < 0) { coreOk = false; break; }
      }
      if (!coreOk) continue;

      // Check: all compound tones accounted for
      var compoundOk = true;
      for (var j = 0; j < compound.length; j++) {
        if (appliedCompound.indexOf(compound[j]) < 0) { compoundOk = false; break; }
      }
      if (!compoundOk) continue;

      return t;
    }
  }
  return null;
}

function _pcsMatch(pcs, intervals) {
  if (pcs.length !== intervals.length) return false;
  for (var i = 0; i < pcs.length; i++) {
    if (pcs[i] !== intervals[i]) return false;
  }
  return true;
}

// ======== KEYBOARD HANDLER ========

function handleIncrementalKeydown(e) {
  var input = document.getElementById('incremental-input');

  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      if (IncrementalState.isOpen && IncrementalState.candidates.length > 0) {
        var candidate = IncrementalState.candidates[IncrementalState.selectedIndex] ||
                        IncrementalState.candidates[0];
        commitToBuilder(candidate);
      } else if (input.value.trim()) {
        var parsed = padParseChordName(input.value.trim());
        if (parsed) {
          commitToBuilder({ type: 'chord', name: parsed.displayName });
        } else {
          input.classList.add('error');
          setTimeout(function() { input.classList.remove('error'); }, 400);
        }
      }
      break;

    case 'ArrowDown':
      if (IncrementalState.isOpen) {
        e.preventDefault();
        IncrementalState.selectedIndex = Math.min(
          IncrementalState.selectedIndex + 1,
          IncrementalState.candidates.length - 1
        );
        updateIncrementalSelection();
      }
      break;

    case 'ArrowUp':
      if (IncrementalState.isOpen) {
        e.preventDefault();
        IncrementalState.selectedIndex = Math.max(
          IncrementalState.selectedIndex - 1, 0
        );
        updateIncrementalSelection();
      }
      break;

    case 'Tab':
      if (IncrementalState.isOpen && IncrementalState.candidates.length > 0) {
        e.preventDefault();
        var tabCandidate = IncrementalState.candidates[IncrementalState.selectedIndex] ||
                           IncrementalState.candidates[0];
        input.value = tabCandidate.name;
        var newCandidates = generateIncrementalCandidates(input.value.trim());
        IncrementalState.candidates = newCandidates;
        IncrementalState.selectedIndex = 0;
        renderIncrementalDropdown(newCandidates);
      }
      break;

    case 'Escape':
      e.preventDefault();
      if (IncrementalState.isOpen) {
        closeIncrementalDropdown();
        input.value = '';
      } else {
        input.blur();
      }
      break;

    case 'ArrowRight':
      if (input.value && IncrementalState.isOpen && !IncrementalState.isExtending) {
        e.preventDefault();
        var extCand = IncrementalState.candidates[IncrementalState.selectedIndex];
        if (extCand && extCand.name) {
          input.value = extCand.name;
          IncrementalState.isExtending = true;
          var extCandidates = generateIncrementalExtensions(input.value);
          IncrementalState.candidates = extCandidates;
          IncrementalState.selectedIndex = 0;
          renderIncrementalDropdown(extCandidates);
        }
      } else if (IncrementalState.isExtending && input.value.indexOf('/') < 0) {
        e.preventDefault();
        input.value += '/';
        input.dispatchEvent(new Event('input'));
        IncrementalState.isExtending = false;
      }
      break;
  }
}
