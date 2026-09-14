// ========================================
// WEB MIDI & CHORD DETECTION
// ========================================
// Source ownership must exist before the held-state objects below are constructed.
if (typeof createMidiHeldState === 'undefined' && typeof document !== 'undefined' && document.readyState === 'loading') {
  var _midiBootstrapSrc = document.currentScript && document.currentScript.src;
  var _midiBootstrapQuery = _midiBootstrapSrc ? _midiBootstrapSrc.indexOf('?') : -1;
  var _midiBootstrapSuffix = _midiBootstrapQuery >= 0 ? _midiBootstrapSrc.slice(_midiBootstrapQuery) : '';
  document.write('<script src="midi-input-state.js' + _midiBootstrapSuffix + '"><\/script>');
}

const midiActiveNotes = new Set(); // currently held mapped MIDI notes (compatibility mirror)
let midiAccess = null;
const midiHeldState = (typeof createMidiHeldState === 'function') ? createMidiHeldState() : null;
const midiPortBindings = (typeof createMidiPortBindingRegistry === 'function') ? createMidiPortBindingRegistry() : null;

function syncMidiActiveNotesFromOwnership() {
  if (!midiHeldState) return;
  midiActiveNotes.clear();
  midiHeldState.heldPitches().forEach(function(note) { midiActiveNotes.add(note); });
}

function getMidiHeldSources() {
  if (midiHeldState) return midiHeldState.heldSources();
  return Array.from(midiActiveNotes).map(function(note) {
    return {
      deviceId: 'legacy', sourceId: 'legacy:' + note, channel: 0,
      rawNote: note, mappedMidi: note, row: null, col: null,
      physicalPadId: null, positionConfidence: 'none',
    };
  });
}

function midiSourceMetadataForInput(input, status, rawNote, mappedMidi, isPush) {
  var deviceId = input && input.id != null ? String(input.id)
    : (input && input.name ? String(input.name) : 'web-midi');
  var channel = status & 0x0f;
  var row = null;
  var col = null;
  var physicalPadId = null;
  var positionConfidence = 'none';

  if (isPush && rawNote >= 36 && rawNote <= 99) {
    var pushIdx = rawNote - PUSH_SERIAL_BASE;
    row = Math.floor(pushIdx / 8);
    col = pushIdx % 8;
    physicalPadId = 'r' + row + 'c' + col;
    positionConfidence = 'exact';
  } else if (!isPush && _lpProgrammerMode && rawNote >= 11 && rawNote <= 88) {
    var lpRow = Math.floor(rawNote / 10) - 1;
    var lpCol = (rawNote % 10) - 1;
    if (lpRow >= 0 && lpRow < 8 && lpCol >= 0 && lpCol < 8) {
      row = lpRow;
      col = lpCol;
      physicalPadId = 'r' + row + 'c' + col;
      positionConfidence = 'exact';
    }
  }

  var sourceAtom = physicalPadId || String(rawNote);
  return {
    deviceId: deviceId,
    sourceId: deviceId + ':' + channel + ':' + sourceAtom,
    channel: channel,
    rawNote: rawNote,
    mappedMidi: mappedMidi,
    row: row,
    col: col,
    physicalPadId: physicalPadId,
    positionConfidence: positionConfidence,
  };
}

function releaseAllMidiHeldSources(preserveSustain) {
  if (typeof window.padWebResetPushInputState === 'function' && !window.IS_DESKTOP_MODE) window.padWebResetPushInputState();
  var released = midiHeldState ? midiHeldState.clearAll() : Array.from(midiActiveNotes);
  midiActiveNotes.clear();
  released.forEach(function(note) {
    try { noteOff(note); } catch (_) {}
  });
  if (!preserveSustain && typeof _cancelSustainDebounce === 'function') _cancelSustainDebounce();
  if (!preserveSustain && typeof _midiSustainOn !== 'undefined' && _midiSustainOn) {
    _midiSustainOn = false;
    if (typeof setSustain === 'function') {
      try { setSustain(false); } catch (_) {}
    }
  }
  refreshLaunchpadLEDs();
  return released;
}

// Chord detection: v1.8.1 user-facing resolution is owned by pad-core.
// padDetectChord remains the transparent candidate generator inside the shared dependency.
function detectChord(notes) {
  var spellingKey = (typeof AppState !== 'undefined')
    ? padGetParentMajorKey(AppState.scaleIdx, AppState.key)
    : 0;
  if (typeof padResolveChordCandidates !== 'function') {
    throw new Error('pad-core chord resolver is not loaded');
  }
  return padResolveChordCandidates(notes, spellingKey);
}
var CHORD_DB = CHORD_DETECT_DB;
var TRIAD_DB = TRIAD_DETECT_DB;
var TETRAD_DB = TETRAD_DETECT_DB;

let midiDebounceTimer = null;
const MIDI_DEBOUNCE_MS = 40; // PUSHのシリアルMIDI対策: 40ms以内のノートをまとめる
let midiNoteRemap = null; // null = no remap, 'push-serial' = Push serial→4th chromatic

function chordPracticeDisplayLocked() {
  return !linkMode
    && AppState.mode === 'chord'
    && BuilderState.root !== null
    && !!BuilderState.quality;
}

// Controller LED output (standard 64 Pad Explorer feature in v1.8.0)
let midiOutput = null;       // Output port for LED Note-On
let midiOutputDAW = null;    // DAW port for SysEx (may be same as midiOutput)
let _pushLedOutputs = [];    // operational Push Live output only
let _pushSetupOutputs = [];  // User/External are setup-only; never ordinary LED transport
let _lpOutputActive = false;
let _controllerLedEnabled = false;  // main.js enables standard controller LED behavior
let _lpProgrammerMode = false; // true when Launchpad is in Programmer mode
let _lpDeviceByte = 0x0C;   // 0x0C = Launchpad X, 0x0D = Mini MK3
let _isPush = false;         // true when a supported Push 2 / Push 3 MIDI port is detected
const _prevLEDState = new Array(64).fill(-1); // -1 = never sent
let _lpLEDMode = 'full'; // 'full' | 'root' | 'off'
let _lastLEDState = null; // cached render state for LED refresh on noteOn/noteOff
let _pushColorPickRole = null; // Push-style palette picker role
let _pushColorPickPaletteVisible = false;
let _pushColorPickReadyAt = 0;
const _pushLedColorRoleOrder = ['root', 'scale', 'pressed', 'memorySlot', 'performActive'];


function padWebPushDiagEnabled() {
  if (typeof window === 'undefined' || !window.location) return false;
  try { return new URLSearchParams(window.location.search).has('pushdiag'); } catch (_) { return false; }
}

function padWebRenderPushMidiDiag() {
  if (!padWebPushDiagEnabled() || typeof document === 'undefined') return;
  var el = document.getElementById('push-midi-diag');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'push-midi-diag';
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;max-width:min(92vw,720px);max-height:38vh;overflow:auto;margin:0;padding:8px 10px;background:rgba(0,0,0,.86);color:#9ef7b5;border:1px solid #4caf50;border-radius:6px;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;pointer-events:none;';
    (document.body || document.documentElement).appendChild(el);
  }
  var d = (typeof window !== 'undefined' && window.__64PE_PUSH_MIDI_DIAG__) || {};
  var pedal = d.pedalPolicy || '-';
  el.textContent = [
    'PUSH MIDI DIAG',
    'sysex=' + String(d.sysexEnabled),
    'bound=' + JSON.stringify(d.boundInputs || []),
    'setupOut=' + JSON.stringify(d.setupOutputs || []),
    'liveOut=' + String(d.operationalOutput || '-'),
    'pedal=' + pedal,
    'events=' + String(d.eventCount || 0) + ' rebinds=' + String(d.rebindCount || 0),
    'last=' + String(d.lastEvent || '-'),
    'lastCC=' + String(d.lastCC || '-'),
    'lastPedal=' + String(d.lastPedal || '-'),
    'sustain midi/audio/worklet=' + String(typeof _midiSustainOn !== 'undefined' && _midiSustainOn)
      + '/' + String(typeof _sustainOn !== 'undefined' && _sustainOn)
      + '/' + String(typeof _epw_sustainOn !== 'undefined' && _epw_sustainOn),
    'engine=' + (typeof AudioState !== 'undefined' && AudioState.instrument
      ? (AudioState.instrument.epiano || AudioState.instrument.sampler || 'WebAudioFont') : '-')
      + ' workletReady=' + String(typeof _epw_initialized !== 'undefined' && _epw_initialized),
    'held=' + String(d.heldNotes || 0),
    'error=' + String(d.lastError || '-'),
  ].join('\n');
}

function padWebPatchPushMidiDiag(patch) {
  if (typeof window === 'undefined') return;
  var d = window.__64PE_PUSH_MIDI_DIAG__ || {};
  Object.keys(patch || {}).forEach(function(key) { d[key] = patch[key]; });
  window.__64PE_PUSH_MIDI_DIAG__ = d;
  padWebRenderPushMidiDiag();
}

function padWebRecordPushMidiEvent(input, data) {
  var bytes = Array.from(data || []);
  var d = (typeof window !== 'undefined' && window.__64PE_PUSH_MIDI_DIAG__) || {};
  var count = (d.eventCount || 0) + 1;
  var name = input && (input.name || input.id) || '?';
  var last = name + ' [' + bytes.map(function(v) { return Number(v).toString(16).padStart(2, '0'); }).join(' ') + ']';
  var patch = { eventCount: count, lastEvent: last };
  if (bytes.length >= 3 && (bytes[0] & 0xf0) === 0xb0) {
    patch.lastCC = String(bytes[1]) + '=' + String(bytes[2]) + ' @ ' + name;
    if (bytes[1] === 64) patch.lastPedal = patch.lastCC;
  }
  padWebPatchPushMidiDiag(patch);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !window.__64PE_PUSH_DIAG_ERROR_HOOK__) {
  window.__64PE_PUSH_DIAG_ERROR_HOOK__ = true;
  window.addEventListener('error', function(event) {
    padWebPatchPushMidiDiag({ lastError: String(event && (event.message || event.error) || 'window error') });
  });
  window.addEventListener('unhandledrejection', function(event) {
    padWebPatchPushMidiDiag({ lastError: 'promise: ' + String(event && event.reason || 'unhandled rejection') });
  });
}

// PUSHシリアル配列(row間8半音) → 4度クロマチック配列(row間5半音) 変換
// baseMidi() を使用: octaveShift + semitoneShift 両方反映
const PUSH_SERIAL_BASE = 36;
function pushSerialToFourths(note) {
  const idx = note - PUSH_SERIAL_BASE;
  if (idx < 0 || idx >= 64) return note; // パッド範囲外はそのまま
  const row = Math.floor(idx / 8);
  const col = idx % 8;
  return baseMidi() + row * ROW_INTERVAL + col;
}

function remapMidiNote(note) {
  if (midiNoteRemap === 'push-serial') return pushSerialToFourths(note);
  return note;
}

function onMidiNoteOn(note, velocity, source) {
  const mapped = remapMidiNote(note);
  // Perform mode: intercept MIDI for pad triggering
  if (handlePerformMidi(mapped)) {
    ensureAudioResumed();
    return;
  }
  // Auto-adjust octave if MIDI note is outside pad grid range
  var bm = baseMidi();
  var padHi = bm + (ROWS - 1) * ROW_INTERVAL + (COLS - 1);
  if (!chordPracticeDisplayLocked() && (mapped < bm || mapped > padHi)) {
    var targetOct = Math.round((mapped - BASE_MIDI) / 12);
    if (setOctaveShift(targetOct)) {
      render();
      saveAppSettings();
    }
  }
  if (midiHeldState && source) {
    source.mappedMidi = mapped;
    midiHeldState.noteOn(source);
    syncMidiActiveNotesFromOwnership();
  } else {
    midiActiveNotes.add(mapped);
  }
  refreshLaunchpadLEDs();
  padWebPatchPushMidiDiag({ heldNotes: midiActiveNotes.size });
  ensureAudioResumed();
  // Every physical NoteOn remains a real trigger. Ownership only controls when the
  // shared mapped pitch is finally released.
  noteOn(mapped, applyVelocityCurve(velocity || 100), true);
  // Plain mode: add to activeNotes (auto-start capture if idle)
  if (AppState.mode === 'input') {
    if (PlainState.subMode === 'idle') {
      PlainState.subMode = 'capture';
      PlainState.captureIndex = findNextEmptySlot(0);
      updatePlainUI();
    }
    PlainState.activeNotes.add(mapped);
    updatePlainDisplay();
    render();
  }
  scheduleMidiUpdate();
}

function onMidiNoteOff(note, source) {
  const mapped = remapMidiNote(note);
  var shouldReleasePitch = true;
  if (midiHeldState && source) {
    source.mappedMidi = mapped;
    var release = midiHeldState.noteOff(source);
    if (!release.changed) return; // stale/lost duplicate NoteOff: do not stop another owner
    shouldReleasePitch = release.pitchBecameInactive;
    syncMidiActiveNotesFromOwnership();
  } else {
    midiActiveNotes.delete(mapped);
  }
  refreshLaunchpadLEDs();
  padWebPatchPushMidiDiag({ heldNotes: midiActiveNotes.size });
  if (shouldReleasePitch) noteOff(mapped);
  // Plain capture/edit: latch (don't remove on noteOff)
  if (AppState.mode === 'input' && PlainState.subMode !== 'idle') {
    // keep note in activeNotes — user clears with x or edits manually
  } else if (AppState.mode === 'input' && shouldReleasePitch) {
    PlainState.activeNotes.delete(mapped);
    updatePlainDisplay();
    render();
  }
  scheduleMidiUpdate();
}

// Called from C++ (evaluateJavascript) when native MIDI input is received.
// When VST loaded: sound plays via C++ processBlock, JS only updates UI.
// When no VST: play via WebAudioFont (C++ sine is muted).
function nativeMidiSourceMetadata(note, metadata) {
  metadata = metadata || {};
  var rawPad = Number(metadata.rawPad);
  var exactPosition = metadata.positionConfidence === 'exact'
    && Number.isInteger(rawPad)
    && Number.isInteger(metadata.row)
    && Number.isInteger(metadata.col)
    && rawPad >= 36 && rawPad <= 99
    && metadata.row >= 0 && metadata.row < 8
    && metadata.col >= 0 && metadata.col < 8
    && rawPad === 36 + metadata.row * 8 + metadata.col;
  var deviceId = metadata.deviceId != null ? String(metadata.deviceId) : 'native';
  var channel = Number.isInteger(metadata.channel) && metadata.channel >= 0 && metadata.channel <= 15
    ? metadata.channel : 0;
  var physicalPadId = exactPosition ? 'r' + metadata.row + 'c' + metadata.col : null;
  return {
    deviceId: deviceId,
    sourceId: metadata.sourceId != null ? String(metadata.sourceId) : deviceId + ':' + channel + ':' + (exactPosition ? physicalPadId : note),
    channel: channel,
    rawNote: exactPosition ? rawPad : note,
    mappedMidi: note,
    row: exactPosition ? metadata.row : null,
    col: exactPosition ? metadata.col : null,
    physicalPadId: physicalPadId,
    positionConfidence: exactPosition ? 'exact' : 'none',
  };
}

function onNativeMidiIn(note, velocity, metadata) {
  var source = nativeMidiSourceMetadata(note, metadata);
  if (midiHeldState) {
    midiHeldState.noteOn(source);
    syncMidiActiveNotesFromOwnership();
  } else {
    midiActiveNotes.add(note);
  }
  noteOn(note, (velocity || 100) / 127, true);
  if (handlePerformMidi(note)) return;
  if (!linkMode && AppState.mode === 'input') {
    if (PlainState.subMode === 'idle') {
      PlainState.subMode = 'capture';
      PlainState.captureIndex = findNextEmptySlot(0);
      updatePlainUI();
    }
    PlainState.activeNotes.add(note);
    updatePlainDisplay();
    render();
  }
  scheduleMidiUpdate();
}

function onNativeMidiOff(note, metadata) {
  var shouldReleasePitch = true;
  if (midiHeldState) {
    var release = midiHeldState.noteOff(nativeMidiSourceMetadata(note, metadata));
    if (!release.changed) return;
    shouldReleasePitch = release.pitchBecameInactive;
    syncMidiActiveNotesFromOwnership();
  } else {
    midiActiveNotes.delete(note);
  }
  if (shouldReleasePitch) noteOff(note);
  if (!linkMode && AppState.mode === 'input' && PlainState.subMode !== 'idle') {
    // latch: keep note in activeNotes
  } else if (!linkMode && AppState.mode === 'input' && shouldReleasePitch) {
    PlainState.activeNotes.delete(note);
    updatePlainDisplay();
    render();
  }
  scheduleMidiUpdate();
}

function scheduleMidiUpdate() {
  if (midiDebounceTimer) clearTimeout(midiDebounceTimer);
  midiDebounceTimer = setTimeout(() => {
    midiDebounceTimer = null;
    updateMidiDisplay();
  }, MIDI_DEBOUNCE_MS);
}

function updateMidiDisplay() {
  // Panic UI clears the compatibility Set before asking the MIDI display to refresh.
  // Reconcile that explicit clear with authoritative source ownership as well.
  if (midiHeldState && midiActiveNotes.size === 0 && midiHeldState.heldPitches().length > 0) {
    releaseAllMidiHeldSources();
  }
  const detectEl = document.getElementById('midi-detect');
  const notes = [...midiActiveNotes].sort((a, b) => a - b);
  if (notes.length === 0) {
    document.querySelectorAll('.midi-highlight').forEach(el => el.remove());
    document.querySelectorAll('.link-highlight').forEach(el => el.remove());
    if (chordPracticeDisplayLocked()) {
      if (typeof padWebSetLatestObservedShellUstPayload === 'function') padWebSetLatestObservedShellUstPayload(null);
      return;
    }
    // Plain mode: #midi-detect is SSOT of updatePlainDisplay(), don't clear
    // its canonical snapshot before the Desktop bridge can consume it.
    if (!linkMode && AppState.mode === 'input') return;
    if (typeof padWebSetLatestObservedShellUstPayload === 'function') padWebSetLatestObservedShellUstPayload(null);
    if (linkMode) { detectEl.innerHTML = ''; return; } // Link mode: just clear highlights, keep display
    detectEl.innerHTML = '';
    // Restore diagrams: instrument input state takes priority over builder state
    if (instrumentInputActive) {
      updateInstrumentInput();
    } else {
      renderGuitarDiagram(lastRenderRootPC, lastRenderActivePCS);
      renderBassDiagram(lastRenderRootPC, lastRenderActivePCS);
      renderPianoDisplay(lastRenderRootPC, lastRenderActivePCS);
    }
    return;
  }
  // Chord practice: when a chord is already displayed, external/Push pad input should
  // play only. Do not replace the chord display, diagrams, octave range, or add white
  // practice highlights; the screen is the exercise target.
  if (chordPracticeDisplayLocked()) {
    if (typeof padWebSetLatestObservedShellUstPayload === 'function') padWebSetLatestObservedShellUstPayload(null);
    return;
  }
  // Guitar/Bass/Piano input active: preserve instrument chord name, only add MIDI highlights
  if (!linkMode && instrumentInputActive) {
    if (typeof padWebSetLatestObservedShellUstPayload === 'function') padWebSetLatestObservedShellUstPayload(null);
    highlightMidiPads(notes);
    return;
  }
  // Plain mode: #midi-detect handled by updatePlainDisplay() (SSOT), only add highlights
  if (!linkMode && AppState.mode === 'input') {
    if (typeof padWebSetLatestObservedShellUstPayload === 'function') padWebSetLatestObservedShellUstPayload(null);
    highlightMidiPads(notes);
    return;
  }
  // detectEl always visible (no layout shift)
  const candidates = detectChord(notes);
  const noteText = candidates.length > 0
    ? formatDetectedNoteDegreeText(notes, candidates[0].rootPC, candidates[0].name)
    : 'Note: ' + notes.map(n => NOTE_NAMES_SHARP[n % 12]).join(' ');
  if (candidates.length > 0) {
    const best = candidates[0];
    const observedQuality = best.quality || (typeof detectedUstBaseQuality === 'function'
      ? detectedUstBaseQuality(best.name) : null);
    const observedPayload = typeof padWebBuildCanonicalChordPayload === 'function'
      ? padWebBuildCanonicalChordPayload({
        chord: { rootPC: best.rootPC, quality: observedQuality, name: best.name },
        midiNotes: notes,
        sourceNotes: getMidiHeldSources(),
        coreStructure: best,
      }) : null;
    if (typeof padWebSetLatestObservedShellUstPayload === 'function') padWebSetLatestObservedShellUstPayload(observedPayload);
    const legacyUstText = typeof formatDetectedUstText === 'function'
      ? formatDetectedUstText(notes, best.rootPC, best.name) : '';
    const ustInline = (typeof padWebFormatObservedUstInlineFromPayload === 'function')
      ? padWebFormatObservedUstInlineFromPayload(observedPayload, legacyUstText) : '';
    const escapeHtml = typeof padWebEscapeHtml === 'function' ? padWebEscapeHtml : String;
    let html = '<div style="color:var(--accent);font-weight:700;font-size:1.1rem;">' + escapeHtml(best.name) + ustInline + '</div>';
    if (candidates.length > 1) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">';
      candidates.slice(1).forEach(c => {
        html += '<span style="font-size:0.6rem;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,0.08);color:var(--text-muted);">' + escapeHtml(c.name) + '</span>';
      });
      html += '</div>';
    }
    if (typeof padWebFormatObservedStructureHtml === 'function') {
      html += padWebFormatObservedStructureHtml(observedPayload);
    }
    html += '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">' + escapeHtml(noteText) + '</div>';
    detectEl.innerHTML = html;
  } else {
    if (typeof padWebSetLatestObservedShellUstPayload === 'function') padWebSetLatestObservedShellUstPayload(null);
    detectEl.textContent = noteText;
  }
  // Update instrument diagrams with MIDI-detected chord, or highlight-only in link mode
  if (linkMode) {
    // Link mode: keep existing scale/chord display, just add highlight overlays
    highlightMidiInstruments(notes);
  } else if (candidates.length > 0) {
    const midiPCS = new Set(notes.map(n => n % 12));
    renderGuitarDiagram(candidates[0].rootPC, midiPCS);
    renderBassDiagram(candidates[0].rootPC, midiPCS);
    renderPianoDisplay(candidates[0].rootPC, midiPCS);
  }
  highlightMidiPads(notes);
}

function highlightMidiInstruments(midiNotes) {
  document.querySelectorAll('.link-highlight').forEach(el => el.remove());
  // Re-apply dim in case render() rebuilt SVGs
  applyLinkDim();
  if (!midiNotes || midiNotes.length === 0) return;
  var NS = 'http://www.w3.org/2000/svg';
  var noteSet = new Set(midiNotes);

  // --- Pad: bright filled rects over dim ---
  var padSvg = document.getElementById('pad-grid');
  if (padSvg) {
    var bm = baseMidi();
    for (var row = 0; row < ROWS; row++) {
      for (var col = 0; col < COLS; col++) {
        var midi = bm + row * ROW_INTERVAL + col;
        if (!noteSet.has(midi)) continue;
        var x = MARGIN + col * (PAD_SIZE + PAD_GAP);
        var y = MARGIN + (ROWS - 1 - row) * (PAD_SIZE + PAD_GAP);
        var hl = document.createElementNS(NS, 'rect');
        hl.setAttribute('x', x); hl.setAttribute('y', y);
        hl.setAttribute('width', PAD_SIZE); hl.setAttribute('height', PAD_SIZE);
        hl.setAttribute('rx', 6);
        hl.setAttribute('fill', '#fff'); hl.setAttribute('opacity', '0.55');
        hl.setAttribute('stroke', '#fff'); hl.setAttribute('stroke-width', 2);
        hl.setAttribute('class', 'link-highlight');
        hl.setAttribute('pointer-events', 'none');
        padSvg.appendChild(hl);
      }
    }
  }

  // --- Piano: circles on keys over dim ---
  var pianoSvg = document.getElementById('piano-display');
  if (pianoSvg && pianoSvg.children.length > 0) {
    var hitRects = [...pianoSvg.querySelectorAll('rect[cursor="pointer"]')];
    hitRects.forEach(function(hr) {
      var midi = parseInt(hr.dataset.midi);
      if (!noteSet.has(midi)) return;
      var kx = parseFloat(hr.getAttribute('x'));
      var ky = parseFloat(hr.getAttribute('y'));
      var kw = parseFloat(hr.getAttribute('width'));
      var kh = parseFloat(hr.getAttribute('height'));
      // Circle centered on the key
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', kx + kw / 2);
      c.setAttribute('cy', ky + kh / 2);
      c.setAttribute('r', Math.min(kw, kh) * 0.35);
      c.setAttribute('fill', '#fff');
      c.setAttribute('opacity', '0.9');
      c.setAttribute('class', 'link-highlight');
      c.setAttribute('pointer-events', 'none');
      pianoSvg.appendChild(c);
    });
  }

  // --- Guitar: bright circles over dim ---
  var guitarSvg = document.getElementById('guitar-diagram');
  if (guitarSvg && typeof GUITAR_OPEN_MIDI !== 'undefined') {
    var gRects = guitarSvg.querySelectorAll('rect[data-string][data-fret]');
    gRects.forEach(function(r) {
      var s = parseInt(r.dataset.string);
      var f = parseInt(r.dataset.fret);
      var midi = GUITAR_OPEN_MIDI[s] + f;
      if (!noteSet.has(midi)) return;
      var hl = document.createElementNS(NS, 'circle');
      var cx = parseFloat(r.getAttribute('x')) + parseFloat(r.getAttribute('width')) / 2;
      var cy = parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2;
      hl.setAttribute('cx', cx); hl.setAttribute('cy', cy);
      hl.setAttribute('r', 8);
      hl.setAttribute('fill', '#fff'); hl.setAttribute('opacity', '0.9');
      hl.setAttribute('class', 'link-highlight');
      hl.setAttribute('pointer-events', 'none');
      guitarSvg.appendChild(hl);
    });
  }

  // --- Bass: bright circles over dim ---
  var bassSvg = document.getElementById('bass-diagram');
  if (bassSvg && typeof PAD_BASS_TUNING !== 'undefined') {
    var bRects = bassSvg.querySelectorAll('rect[data-string][data-fret]');
    bRects.forEach(function(r) {
      var s = parseInt(r.dataset.string);
      var f = parseInt(r.dataset.fret);
      var midi = PAD_BASS_TUNING[s] + f;
      if (!noteSet.has(midi)) return;
      var hl = document.createElementNS(NS, 'circle');
      var cx = parseFloat(r.getAttribute('x')) + parseFloat(r.getAttribute('width')) / 2;
      var cy = parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2;
      hl.setAttribute('cx', cx); hl.setAttribute('cy', cy);
      hl.setAttribute('r', 8);
      hl.setAttribute('fill', '#fff'); hl.setAttribute('opacity', '0.9');
      hl.setAttribute('class', 'link-highlight');
      hl.setAttribute('pointer-events', 'none');
      bassSvg.appendChild(hl);
    });
  }
}

function highlightMidiPads(midiNotes) {
  // Remove old highlights
  document.querySelectorAll('.midi-highlight').forEach(el => el.remove());
  const svg = document.getElementById('pad-grid');
  const bm = baseMidi();
  const noteSet = new Set(midiNotes);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const midi = bm + row * ROW_INTERVAL + col;
      if (!noteSet.has(midi)) continue;
      const x = MARGIN + col * (PAD_SIZE + PAD_GAP);
      const y = MARGIN + (ROWS - 1 - row) * (PAD_SIZE + PAD_GAP);
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      ring.setAttribute('x', x + 2); ring.setAttribute('y', y + 2);
      ring.setAttribute('width', PAD_SIZE - 4); ring.setAttribute('height', PAD_SIZE - 4);
      ring.setAttribute('rx', 6); ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#fff'); ring.setAttribute('stroke-width', 3);
      ring.setAttribute('class', 'midi-highlight');
      ring.setAttribute('pointer-events', 'none');
      svg.appendChild(ring);
    }
  }
}

function highlightPlaybackPads(midiNotes) {
  document.querySelectorAll('.playback-highlight').forEach(el => el.remove());
  // Perform has its own educational display:
  // one-position by default, exact recorded notes only when the toggle is on.
  // Never add the old green playback overlay in Perform.
  if (typeof memoryViewMode !== 'undefined' && memoryViewMode === 'perform') return;
  if (!midiNotes || midiNotes.length === 0) return;
  const svg = document.getElementById('pad-grid');
  const bm = baseMidi();
  const noteSet = new Set(midiNotes);
  const candidates = detectChord(midiNotes);
  const rootPC = candidates.length > 0 ? candidates[0].rootPC : null;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const midi = bm + row * ROW_INTERVAL + col;
      if (!noteSet.has(midi)) continue;
      const x = MARGIN + col * (PAD_SIZE + PAD_GAP);
      const y = MARGIN + (ROWS - 1 - row) * (PAD_SIZE + PAD_GAP);
      const pc = midi % 12;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', PAD_SIZE); rect.setAttribute('height', PAD_SIZE);
      rect.setAttribute('rx', 8); rect.setAttribute('fill', 'rgba(42,110,42,0.7)');
      rect.setAttribute('class', 'playback-highlight');
      rect.setAttribute('pointer-events', 'none');
      svg.appendChild(rect);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x + PAD_SIZE / 2);
      text.setAttribute('y', rootPC !== null ? y + 15 : y + PAD_SIZE / 2);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', '#fff'); text.setAttribute('font-size', '10px');
      text.setAttribute('font-weight', '600');
      text.setAttribute('class', 'playback-highlight');
      text.textContent = pcName(pc);
      svg.appendChild(text);
      if (rootPC !== null) {
        const interval = ((pc - rootPC) % 12 + 12) % 12;
        const degText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        degText.setAttribute('x', x + PAD_SIZE / 2);
        degText.setAttribute('y', y + 34);
        degText.setAttribute('text-anchor', 'middle'); degText.setAttribute('dominant-baseline', 'middle');
        degText.setAttribute('fill', '#fff'); degText.setAttribute('font-size', '13px');
        degText.setAttribute('font-weight', '700');
        degText.setAttribute('class', 'playback-highlight');
        degText.textContent = SCALE_DEGREE_NAMES[interval];
        svg.appendChild(degText);
      }
    }
  }
}

let selectedMidiInputId = null; // null = all inputs
var _lastOctCC = 0; // debounce mirrored/repeated Push octave CC

// Sustain pedal (CC#64) — エッジ非対称 debounce。
// 経緯: Roland A-88 MK2 等が踏み込み中 / 保持中に CC64=14 などの中間値を
// 流す事例を確認 (うりなみさん 2026-05-01)。素朴に `velocity >= 64` で
// setSustain を毎回呼ぶと、jitter で setSustain(false) が発火し、worklet
// 側 _setSustain(false) が sustainPending を全 _noteOff してしまう。
// 聞こえとしては「Sustain 切れた」になる。
// アプローチ: 3 通りに分岐。
//   - velocity >= 64 (rising edge): 即時 ON (fast pedaling 追従)
//   - velocity === 0 (definitive release): 即時 OFF
//   - velocity 1〜63 (intermediate): 100ms debounce (jitter rejection +
//     非標準 rest 救済)
// 詳細は keys/midi-input.js の同等実装 (commit 0638138) コメント参照。
//
// NOTE: midi.js は module top-level scope で declare されるため、識別子の
// global collision に注意。audio-core/audio-voice.js が `var _sustainOn`
// を持つので、ここでは `_midiSustainOn` と prefix 付きで分離する
// (Codex 監査 P1 BLOCKER 対応)。
const SUSTAIN_OFF_DEBOUNCE_MS = 100;
let _midiSustainOn = false;
let _sustainPendingVal = -1;
let _sustainDebounceTimer = null;
function _cancelSustainDebounce() {
  if (_sustainDebounceTimer !== null) {
    clearTimeout(_sustainDebounceTimer);
    _sustainDebounceTimer = null;
  }
  _sustainPendingVal = -1;
}
function _resolveSustainOff() {
  _sustainDebounceTimer = null;
  const v = _sustainPendingVal;
  _sustainPendingVal = -1;
  if (v > 0 && v < 64 && _midiSustainOn && typeof setSustain === 'function') {
    _midiSustainOn = false;
    try { setSustain(false); } catch (_) {}
  }
}

function initWebMIDI() {
  if (!navigator.requestMIDIAccess) return;
  padWebPushPortContract.requestMidiAccess(navigator).then(access => {
    midiAccess = access;
    const statusEl = document.getElementById('midi-status');
    statusEl.style.display = '';
    const select = document.getElementById('midi-device-select');
    const indicator = document.getElementById('midi-indicator');

    function refreshDeviceList() {
      const prev = select.value;
      select.innerHTML = '<option value="all">' + t('midi.all_devices') + '</option>';
      for (const input of access.inputs.values()) {
        if (input.state === 'disconnected') continue;
        const opt = document.createElement('option');
        opt.value = input.id;
        opt.textContent = input.name;
        select.appendChild(opt);
      }
      // Restore previous selection if still available (by ID)
      if (prev && select.querySelector('option[value="' + prev + '"]')) {
        select.value = prev;
      } else {
        // Try to restore by saved device name (IDs may change between sessions)
        try {
          const savedName = localStorage.getItem('64pad-midi-device');
          if (savedName && savedName !== 'all') {
            for (const opt of select.options) {
              if (opt.textContent === savedName) { select.value = opt.value; break; }
            }
          }
        } catch(_) {}
      }
    }

    function connectInputs() {
      // Invalidate every previously-owned listener before rebinding current ports.
      if (midiPortBindings) midiPortBindings.clear();
      for (const input of access.inputs.values()) input.onmidimessage = null;
      // Topology/selection changes can strand NoteOff. Conservatively release every
      // held source before reconnecting so audio/UI cannot remain stuck.
      releaseAllMidiHeldSources();
      updateMidiDisplay();
      if (midiPortBindings) midiPortBindings.beginGeneration();

      const selectedId = select.value;
      const inputCluster = padWebPushPortContract.collectInputCluster(access, selectedId);
      const inputIds = new Set(inputCluster.map(function(input) { return input.id; }));
      const pushInputs = inputCluster.filter(function(input) { return padWebIsPushMidiPortName(input.name); });
      const pushSetupInputs = padWebPushPortContract.collectPushInputs(access);
      let connected = inputCluster.length > 0;
      let connectedName = pushInputs.length > 0 ? (pushInputs[0].name || '')
        : (inputCluster.length > 0 ? (inputCluster[0].name || '') : '');
      var previousDiag = (typeof window !== 'undefined' && window.__64PE_PUSH_MIDI_DIAG__) || {};
      padWebPatchPushMidiDiag({
        selectedId: selectedId,
        boundInputs: inputCluster.map(function(input) { return input.name || input.id || ''; }),
        pushInputs: pushInputs.map(function(input) { return input.name || input.id || ''; }),
        pushSetupInputs: pushSetupInputs.map(function(input) { return input.name || input.id || ''; }),
        sysexEnabled: access.sysexEnabled === true,
        rebindCount: (previousDiag.rebindCount || 0) + 1,
        eventCount: previousDiag.eventCount || 0,
      });

      for (const input of access.inputs.values()) {
        if (!inputIds.has(input.id)) continue;
        // Per-input Push detection: シリアル→4度変換をデバイス単位で適用
        const isPush = padWebIsPushMidiPortName(input.name);
        const inputHandler = (e) => {
          if (!e || !e.data) return;
          padWebRecordPushMidiEvent(input, e.data);
          if (e.data.length < 3) return;
          const [status, rawNote, velocity] = e.data;
          const cmd = status & 0xf0;
          // Launchpad octave buttons: CC#91=▲, CC#92=▼ (X/Mini MK3/Pro MK3)
          //                           CC#104=▲, CC#105=▼ (MK1/Mini MK2)
          if (!isPush && cmd === 0xb0 && velocity === 127 &&
              (rawNote === 91 || rawNote === 92 || rawNote === 104 || rawNote === 105)) {
            var now = performance.now();
            if (now - _lastOctCC < 100) return;
            _lastOctCC = now;
            shiftOctave((rawNote === 91 || rawNote === 104) ? 1 : -1);
            return;
          }
          // Sustain pedal (CC#64) — エッジ非対称 debounce。
          // 詳細は midi.js モジュール上部 SUSTAIN_OFF_DEBOUNCE_MS コメント参照。
          if (cmd === 0xb0 && rawNote === 64) {
            if (velocity >= 64) {
              // Rising edge: 即時 ON、保留 OFF を cancel
              _cancelSustainDebounce();
              if (!_midiSustainOn && typeof setSustain === 'function') {
                _midiSustainOn = true;
                try { setSustain(true); } catch (_) {}
              }
            } else if (velocity === 0) {
              // Definitive release: 即時 OFF、保留 cancel
              _cancelSustainDebounce();
              if (_midiSustainOn && typeof setSustain === 'function') {
                _midiSustainOn = false;
                try { setSustain(false); } catch (_) {}
              }
            } else {
              // 1〜63 intermediate: jitter rejection + 非標準 rest 救済
              if (_midiSustainOn) {
                _sustainPendingVal = velocity;
                if (_sustainDebounceTimer !== null) clearTimeout(_sustainDebounceTimer);
                _sustainDebounceTimer = setTimeout(_resolveSustainOff, SUSTAIN_OFF_DEBOUNCE_MS);
              }
            }
            padWebRenderPushMidiDiag();
            return;
          }
          // Push control-surface CC: raw mapping is the same contract used by
          // Standalone. CC64 was consumed above as performance sustain.
          if (isPush && cmd === 0xb0 && typeof window.padWebHandlePushMidiCc === 'function') {
            var _pushCcHandled = window.padWebHandlePushMidiCc(rawNote, velocity, {
              inputName: input.name || '',
              inputId: input.id || '',
              nowMs: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
              padIsHeld: midiActiveNotes.size > 0 || (typeof window.padWebPushHeldSlotActive === 'function' && window.padWebPushHeldSlotActive()),
              padPlaybackBlocked: false,
              mpeMode: (typeof window.mpeMode !== 'undefined' && window.mpeMode === true)
                || (typeof AppState !== 'undefined' && AppState.mpeMode === true)
            });
            if (_pushCcHandled) return;
          }
          // Delete/Duplicate + pad gestures are part of the same Push control surface.
          if (isPush && (cmd === 0x90 || cmd === 0x80)
              && rawNote >= 36 && rawNote <= 99
              && typeof window.padWebPushControlWillHandlePad === 'function') {
            var _pushPadDown = cmd === 0x90 && velocity > 0;
            if (window.padWebPushControlWillHandlePad(rawNote, _pushPadDown)) return;
          }
          // Push perform mode: serial 4x4 → slots directly (bypass fourths conversion)
          if (isPush && typeof window.padWebPushSlotLayoutActive !== 'function' && memoryViewMode === 'perform' && cmd === 0x90 && velocity > 0) {
            var si = rawNote - PUSH_SERIAL_BASE;
            if (si >= 0 && si < 64) {
              var sRow = Math.floor(si / 8);
              var sCol = si % 8;
              if (sRow <= 3 && sCol <= 3) {
                performPadTap((3 - sRow) * 4 + sCol);
                ensureAudioResumed();
                return;
              }
            }
          }
          // Non-Push fourths-layout controller perform mode (Linnstrument, Launchpad, etc.)
          if (!isPush && memoryViewMode === 'perform' && cmd === 0x90 && velocity > 0) {
            var perfNote = (_lpProgrammerMode && rawNote >= 11 && rawNote <= 88) ? _lpProgrammerToFourths(rawNote) : rawNote;
            if (perfNote >= 0 && handlePerformMidi(perfNote)) {
              ensureAudioResumed();
              return;
            }
          }
          // Push: block notes outside pad range (touch strip sends low notes)
          if (isPush && (cmd === 0x90 || cmd === 0x80) && (rawNote < 36 || rawNote > 99)) return;
          // Launchpad Programmer mode: convert notes 11-88 to 4th chromatic
          var note;
          if (isPush) {
            note = pushSerialToFourths(rawNote);
          } else if (_lpProgrammerMode && rawNote >= 11 && rawNote <= 88) {
            note = _lpProgrammerToFourths(rawNote);
            if (note < 0) return; // Invalid pad position (e.g., note 19 = side button)
          } else {
            note = rawNote;
          }
          var source = midiSourceMetadataForInput(input, status, rawNote, note, isPush);
          if (cmd === 0x90 && velocity > 0) onMidiNoteOn(note, velocity, source);
          else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) onMidiNoteOff(note, source);
        };
        if (midiPortBindings) midiPortBindings.bind(input, inputHandler);
        else input.onmidimessage = inputHandler;
      }

      // Per-input remap handles Push now; global remap no longer needed
      midiNoteRemap = null;

      // Auto-match MIDI output for standard Push LED/control ownership
      _exitLaunchpadProgrammerMode();
      midiOutput = null;
      midiOutputDAW = null;
      _pushLedOutputs = [];
      _pushSetupOutputs = [];
      _lpOutputActive = false;
      _lpProgrammerMode = false;
      var ledSel = document.getElementById('led-mode');
      if (ledSel) ledSel.style.display = 'none';
      // LED control: Push 2 / Push 3 MIDI output (no SysEx needed) + Launchpad (disabled until physical testing)
      _isPush = false;
      console.log('[64PE LED] controllerLedEnabled:', _controllerLedEnabled, 'connected:', connected, 'connectedName:', connectedName);
      // List all output ports for debugging
      for (const output of access.outputs.values()) {
        console.log('[64PE LED] Output port:', output.name, output.id);
      }
      if (_controllerLedEnabled && connected && connectedName) {
        var isPush = pushInputs.length > 0;
        var isLaunchpad = /launchpad/i.test(connectedName);
        console.log('[64PE LED] isPush:', isPush, 'isLaunchpad:', isLaunchpad);
        if (isPush) {
          // Live Port is the only operational control-surface transport. User and
          // External remain setup-only, matching the mature DOJO Push contract.
          _isPush = true;
          var pushSetupOutputs = padWebCollectPushMidiOutputs(access);
          _pushSetupOutputs = pushSetupOutputs.slice();
          // Do not rewrite Push 3 Pedal/CV jack configuration on page load.
          // Real hardware already delivers Pedal 2 as CC64 by default; the 2026-09-11
          // audible failure was downstream in audio-core, not in MIDI transport.
          midiOutput = padWebPushPortContract.selectPushOperationalOutput(_pushSetupOutputs);
          _pushLedOutputs = midiOutput ? [midiOutput] : [];
          padWebPatchPushMidiDiag({
            setupOutputs: _pushSetupOutputs.map(function(output) { return output.name || output.id || ''; }),
            operationalOutput: midiOutput ? (midiOutput.name || midiOutput.id || '') : '',
            pedalPolicy: 'hardware-default-preserved-no-pedal-cv-sysex',
          });
          if (midiOutput) {
            // Clear and paint only the operational Live Port. Mirroring ordinary
            // Note/CC LED traffic into User/External can create feedback/ownership
            // ambiguity; those handles are setup-only.
            padWebHardClearPushOutputs(_pushLedOutputs);
            _lpOutputActive = true;
            _lpProgrammerMode = true;
            console.log('[64PE LED] Push operational output:', midiOutput.name,
                        'setup-only:', _pushSetupOutputs.filter(function(output) { return output !== midiOutput; }).map(function(output) { return output.name; }));
          }
        } else if (false && isLaunchpad) {
          // Launchpad: disabled until physical device testing
          _lpDeviceByte = /mini/i.test(connectedName) ? 0x0D : 0x0C;
          var matchedOutputs = [];
          for (const output of access.outputs.values()) {
            if (/launchpad/i.test(output.name)) matchedOutputs.push(output);
          }
          if (matchedOutputs.length > 0) {
            midiOutput = matchedOutputs[0];
            midiOutputDAW = matchedOutputs.length > 1 ? matchedOutputs[1] : matchedOutputs[0];
            _lpOutputActive = true;
            _enterLaunchpadProgrammerMode();
          }
        } else {
          // Non-Launchpad: try direct name match for basic LED
          for (const output of access.outputs.values()) {
            if (output.name === connectedName || output.name.includes(connectedName) || connectedName.includes(output.name)) {
              midiOutput = output;
              _lpOutputActive = true;
              break;
            }
          }
        }
        // Show LED mode selector and trigger initial LED update
        if (_lpOutputActive) {
          ledSel = document.getElementById('led-mode');
          if (ledSel) {
            ledSel.style.display = '';
            try {
              var saved = localStorage.getItem('64pad-led-mode');
              if (saved && (saved === 'full' || saved === 'root' || saved === 'off')) {
                _lpLEDMode = saved;
                ledSel.value = saved;
              }
            } catch(_) {}
          }
          render();
          if (_isPush && typeof window !== 'undefined') {
            try { if (typeof window.padWebResetPushButtonLedState === 'function') window.padWebResetPushButtonLedState(); } catch (_) {}
            try { if (typeof window.padWebSyncPushButtonLeds === 'function') window.padWebSyncPushButtonLeds(); } catch (_) {}
          }
        }
      }

      indicator.style.background = connected ? '#4caf50' : '#ff9800';
    }

    select.addEventListener('change', () => {
      connectInputs();
      try {
        const opt = select.options[select.selectedIndex];
        localStorage.setItem('64pad-midi-device', opt ? opt.textContent : 'all');
      } catch(_) {}
    });

    refreshDeviceList();
    connectInputs();
    let _midiTopologySignature = padWebPushPortContract.topologySignature(access);
    access.onstatechange = () => {
      const nextSignature = padWebPushPortContract.topologySignature(access);
      if (nextSignature === _midiTopologySignature) return;
      _midiTopologySignature = nextSignature;
      refreshDeviceList();
      connectInputs();
    };
  }).catch(() => {});
}

// ======== LAUNCHPAD LED CONTROL ========
// Standard Push LED control without Ableton (v1.8.0)
// - Scale pads keep the long-standing 64PE look: root orange, scale white.
// - Ableton不要でPushをスケール練習デバイスとして使える
// Map 64PE pad state to device palette indices (0-127).
// Do not infer Push colors from Launchpad names. Push 2/3 use a different
// palette (for example 5=brown, 9=yellow-green). Validate on hardware first.
function _padColorToLP(state, row, col) {
  if (_lpLEDMode === 'off') return 0;
  if (_isPush && typeof window.padWebPushSlotPadColor === 'function') {
    var slotColor = window.padWebPushSlotPadColor(row, col);
    if (slotColor !== null) return slotColor;
  }

  var bm = baseMidi();
  var midi = bm + row * ROW_INTERVAL + col;
  var pc = midi % 12;
  var rootPC = state.rootPC;

  // Highlight currently pressed pads. Keep it away from white because scale
  // notes are white on Push.
  if (midiActiveNotes.has(midi)) return _isPush ? (AppState.pushPressedColor || 25) : 3;

  // Root-only mode: only light up root pitch class
  if (_lpLEDMode === 'root') {
    if (pc === rootPC && rootPC !== null) return 3; // Push: orange
    return 0;
  }

  // Push LED: always show scale colors from AppState (mode-independent)
  // In Input/TASTY/Stock modes, state.activePCS lacks scale info, so compute directly
  var cFixed = AppState.padCFixed === true;
  var scaleIdx = cFixed ? 0 : AppState.scaleIdx;
  var scale = SCALES[scaleIdx];
  var scaleRoot = cFixed ? 0 : AppState.key;
  var scalePCS = new Set(scale.pcs.map(function(p) { return (p + scaleRoot) % 12; }));

  // Use scale-derived root for consistent display
  if (_isPush && rootPC == null) rootPC = scaleRoot;

  var activePCS = state.activePCS;
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
  var omittedPCS = state.omittedPCS;
  var guide3PCS = state.guide3PCS;
  var guide7PCS = state.guide7PCS;
  var tensionPCS = state.tensionPCS;
  var avoidPCS = state.avoidPCS;
  var overlayPCS = state.overlayPCS;

  // For Push: use scale data when state doesn't have it (Input/TASTY/Stock modes)
  if (_isPush && (!activePCS || activePCS.size === 0 || (AppState.mode !== 'scale' && AppState.mode !== 'chord'))) {
    activePCS = scalePCS;
    rootPC = scaleRoot;
  }

  var isRoot = pc === rootPC && !omittedPCS.has(pc);
  var isBass = bassPC !== null && pc === bassPC;
  var isActive = activePCS.has(pc);
  var isGuide3 = AppState.mode === 'chord' && guide3PCS.has(pc) && !isRoot && !tensionPCS.has(pc);
  var isGuide7 = AppState.mode === 'chord' && guide7PCS.has(pc) && !isRoot && !tensionPCS.has(pc);
  var isTension = AppState.mode === 'chord' && tensionPCS.has(pc) && !isRoot && !isGuide3 && !isGuide7;
  var isAvoid = AppState.mode === 'chord' && avoidPCS.has(pc) && !isRoot;

  if (AppState.mode === 'scale') {
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
}

function _pushPaletteColors64(first) {
  const start = first || 1;
  const colors = [];
  for (let i = 0; i < 64; i++) {
    const color = start + i;
    colors.push(color <= 127 ? color : 0);
  }
  return colors;
}

function _pushIsColorPickActive() {
  return !!(_pushColorPickRole || (typeof window !== 'undefined' && window.__pushLedColorPickRole));
}

function _pushCurrentLedColorForRole(role) {
  if (typeof AppState === 'undefined') return 1;
  if (role === 'root') return AppState.pushScaleRootColor || 3;
  if (role === 'scale') return AppState.pushScaleToneColor || 122;
  if (role === 'pressed') return AppState.pushPressedColor || 25;
  if (role === 'memorySlot') return AppState.pushMemorySlotColor || 45;
  if (role === 'performActive') return AppState.pushPerformActiveColor || 9;
  return 1;
}

function _pushLedColorRoleLabel(role) {
  if (role === 'root') return 'Root';
  if (role === 'scale') return 'Scale notes';
  if (role === 'pressed') return 'Pressed pads';
  if (role === 'memorySlot') return 'Memory slots';
  if (role === 'performActive') return 'Perform active';
  return 'Push color';
}

function _pushColorPageLabel(first) {
  return first > 64 ? '明るい色 / 白を含む' : '基本色';
}

function _pushEnsureColorPickOverlay() {
  if (typeof document === 'undefined') return null;
  var overlay = document.getElementById('push-color-pick-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'push-color-pick-overlay';
  overlay.className = 'help-overlay';
  overlay.innerHTML = [
    '<div class="help-modal push-color-pick-modal">',
      '<h2>Push Color Select</h2>',
      '<div class="push-color-pick-target"></div>',
      '<div class="push-color-pick-page"></div>',
      '<div class="push-color-pick-instruction">Push の光っているパッドから色を選びます。</div>',
      '<p class="view-setup-note">十字キー上下で対象、左右で色ページを切り替えます。Undo で設定に戻ります。</p>',
      '<button class="close-btn" type="button" onclick="returnPushLedColorPick()">設定に戻る</button>',
    '</div>'
  ].join('');
  document.body.appendChild(overlay);
  return overlay;
}

function _pushRenderColorPickOverlay(role, first) {
  var overlay = _pushEnsureColorPickOverlay();
  if (!overlay) return;
  overlay.classList.add('active');
  var target = overlay.querySelector('.push-color-pick-target');
  if (target) target.textContent = _pushLedColorRoleLabel(role);
  var page = overlay.querySelector('.push-color-pick-page');
  if (page) page.textContent = _pushColorPageLabel(first);
}

function _pushUpdateColorPickDisplay(role, first, savedColor) {
  if (typeof _juceInvoke !== 'function') return;
  var pageLabel = first > 64 ? 'BRIGHT / WHITE' : 'BASIC COLORS';
  _juceInvoke('updatePushBuilderChord', 'PICK COLOR', [], [
    'PUSH_COLOR',
    'TARGET ' + _pushLedColorRoleLabel(role).toUpperCase(),
    'PAGE ' + pageLabel,
    savedColor !== undefined ? ('SAVED ' + savedColor) : 'PRESS A LIT PAD'
  ]);
}

function _pushShowColorPickPalette(first) {
  const colors = _pushPaletteColors64(first);
  _pushColorPickPaletteVisible = true;
  _pushColorPickReadyAt = Date.now() + 140;
  for (var i = 0; i < 64; i++) _prevLEDState[i] = -1;
  if (typeof _juceInvoke === 'function') {
    _juceInvoke('updatePushLEDs', colors);
    setTimeout(function() { if (_pushIsColorPickActive()) _juceInvoke('updatePushLEDs', colors); }, 80);
    setTimeout(function() { if (_pushIsColorPickActive()) _juceInvoke('updatePushLEDs', colors); }, 220);
  }
}

function _pushHideColorPickOverlay() {
  if (typeof document === 'undefined') return;
  var overlay = document.getElementById('push-color-pick-overlay');
  if (overlay) overlay.classList.remove('active');
}

function _pushApplyLedColorRole(role, color) {
  if (typeof AppState === 'undefined') return false;
  const value = Math.max(0, Math.min(127, Number(color) || 0));
  if (role === 'root') AppState.pushScaleRootColor = value;
  else if (role === 'scale') AppState.pushScaleToneColor = value;
  else if (role === 'pressed') {
    AppState.pushPressedColor = value;
    if (typeof _juceInvoke === 'function') _juceInvoke('setPushHeldColor', value);
  }
  else if (role === 'memorySlot') AppState.pushMemorySlotColor = value;
  else if (role === 'performActive') AppState.pushPerformActiveColor = value;
  else return false;

  if (typeof saveAppSettings === 'function') saveAppSettings();
  return true;
}

function _pushSetLedColorRole(role, color) {
  if (!_pushApplyLedColorRole(role, color)) return false;
  _pushColorPickPaletteVisible = false;
  _pushColorPickReadyAt = 0;
  _pushHideColorPickOverlay();
  for (var i = 0; i < 64; i++) _prevLEDState[i] = -1;
  if (typeof window !== 'undefined' && typeof window._pushRefreshPadLEDs === 'function') window._pushRefreshPadLEDs();
  else refreshLaunchpadLEDs();
  if (typeof window !== 'undefined' && typeof window._pushRestoreMainDisplayAfterColorPick === 'function') {
    window._pushRestoreMainDisplayAfterColorPick();
  }
  return true;
}

function startPushLedColorPick(role, first) {
  _pushColorPickRole = role;
  const currentColor = _pushCurrentLedColorForRole(role);
  const start = first || (currentColor > 64 ? 65 : 1);
  if (typeof window !== 'undefined') {
    window.__pushLedColorPickRole = role;
    window.__pushLedColorPickFirst = start;
  }
  if (typeof _juceInvoke === 'function') _juceInvoke('setPushPadPlaybackBlocked', true);
  _pushShowColorPickPalette(start);
  _pushRenderColorPickOverlay(role, start);
  _pushUpdateColorPickDisplay(role, start);
  return true;
}

function switchPushLedColorPickRole(delta) {
  const role = _pushColorPickRole || (typeof window !== 'undefined' ? window.__pushLedColorPickRole : null);
  if (!role) return false;
  var idx = _pushLedColorRoleOrder.indexOf(role);
  if (idx < 0) idx = 0;
  idx = (idx + (delta > 0 ? 1 : -1) + _pushLedColorRoleOrder.length) % _pushLedColorRoleOrder.length;
  const nextRole = _pushLedColorRoleOrder[idx];
  const first = (typeof window !== 'undefined' && window.__pushLedColorPickFirst) ? window.__pushLedColorPickFirst : 1;
  _pushColorPickRole = nextRole;
  if (typeof window !== 'undefined') window.__pushLedColorPickRole = nextRole;
  _pushShowColorPickPalette(first);
  _pushRenderColorPickOverlay(nextRole, first);
  _pushUpdateColorPickDisplay(nextRole, first);
  return true;
}

function switchPushLedColorPickPage(delta) {
  const role = _pushColorPickRole || (typeof window !== 'undefined' ? window.__pushLedColorPickRole : null);
  if (!role) return false;
  const currentFirst = (typeof window !== 'undefined' && window.__pushLedColorPickFirst) ? window.__pushLedColorPickFirst : 1;
  const nextFirst = currentFirst > 64 ? 1 : 65;
  if (typeof window !== 'undefined') window.__pushLedColorPickFirst = nextFirst;
  _pushShowColorPickPalette(nextFirst);
  _pushRenderColorPickOverlay(role, nextFirst);
  _pushUpdateColorPickDisplay(role, nextFirst);
  return true;
}

function cancelPushLedColorPick() {
  _pushColorPickRole = null;
  if (typeof window !== 'undefined') {
    window.__pushLedColorPickRole = null;
    window.__pushLedColorPickFirst = null;
  }
  if (typeof window !== 'undefined' && typeof window._pushSyncPadPlaybackBlock === 'function') window._pushSyncPadPlaybackBlock();
  else if (typeof _juceInvoke === 'function') _juceInvoke('setPushPadPlaybackBlocked', false);
  _pushColorPickPaletteVisible = false;
  _pushColorPickReadyAt = 0;
  _pushHideColorPickOverlay();
  for (var i = 0; i < 64; i++) _prevLEDState[i] = -1;
  refreshLaunchpadLEDs();
  if (typeof window !== 'undefined' && typeof window._pushRestoreMainDisplayAfterColorPick === 'function') {
    window._pushRestoreMainDisplayAfterColorPick();
  }
}

function returnPushLedColorPick() {
  if (typeof window !== 'undefined' && typeof window._pushReturnToViewSetupFromColorPick === 'function') {
    window._pushReturnToViewSetupFromColorPick();
    return;
  }
  cancelPushLedColorPick();
}

function handlePushLedColorPickPad(padIdx) {
  const role = _pushColorPickRole || (typeof window !== 'undefined' ? window.__pushLedColorPickRole : null);
  if (!role) return false;
  if (!_pushColorPickPaletteVisible || Date.now() < _pushColorPickReadyAt) return true;
  const idx = Number(padIdx);
  if (!Number.isFinite(idx) || idx < 0 || idx >= 64) return true;
  const first = (typeof window !== 'undefined' && window.__pushLedColorPickFirst) ? window.__pushLedColorPickFirst : 1;
  const value = Math.max(0, Math.min(127, first + idx));
  if (!_pushApplyLedColorRole(role, value)) return true;
  _pushShowColorPickPalette(first);
  _pushRenderColorPickOverlay(role, first);
  _pushUpdateColorPickDisplay(role, first, value);
  return true;
}

if (typeof window !== 'undefined') {
  window.startPushLedColorPick = startPushLedColorPick;
  window.cancelPushLedColorPick = cancelPushLedColorPick;
  window.returnPushLedColorPick = returnPushLedColorPick;
  window.handlePushLedColorPickPad = handlePushLedColorPickPad;
  window.switchPushLedColorPickRole = switchPushLedColorPickRole;
  window.switchPushLedColorPickPage = switchPushLedColorPickPage;
  window._pushSetLedColorRole = _pushSetLedColorRole;
}

function padWebIsPushMidiPortName(name) {
  return !!(window.padWebPushPortContract && window.padWebPushPortContract.isPushPortName(name));
}

function padWebCollectPushMidiOutputs(access) {
  return window.padWebPushPortContract
    ? window.padWebPushPortContract.collectPushOutputs(access)
    : [];
}

function padWebUniquePushOutputs(outputs) {
  var unique = [];
  (outputs || []).forEach(function(output) {
    if (output && unique.indexOf(output) < 0) unique.push(output);
  });
  return unique;
}

function padWebSendPushLedMessage(message) {
  var outputs = _pushLedOutputs.length ? _pushLedOutputs : [midiOutput];
  padWebUniquePushOutputs(outputs).forEach(function(output) {
    try { output.send(message); } catch (_) {}
  });
}

function padWebSendPushButtonLed(cc, state, colorPaletteLed) {
  cc = Number(cc) | 0;
  if (cc < 0 || cc > 127) return;
  var desired = state || 'off';
  if (desired === 'blink') {
    // Desktop-proven Push LED protocol: normal channel clears the old state,
    // channel 10 requests firmware blink/pulse for this controller.
    padWebSendPushLedMessage([0xb0, cc, 0]);
    padWebSendPushLedMessage([0xb9, cc, 127]);
    return;
  }

  var value = 0;
  if (desired === 'weak' || desired === 'action') value = colorPaletteLed ? 122 : 21;
  else if (desired === 'white-weak') value = 124;
  else if (desired === 'red-soft') value = 1;
  else if (desired === 'strong') value = 127;
  padWebSendPushLedMessage([0xb0, cc, value]);
}

if (typeof window !== 'undefined') window.padWebSendPushButtonLed = padWebSendPushButtonLed;

function padWebHardClearPushOutputs(outputs) {
  // Exact Gate-0 sequence proven in 64PE Desktop: app-visible pads first,
  // then explicit NoteOff for every pad on every channel, then CC=0.
  padWebUniquePushOutputs(outputs).forEach(function(output) {
    try { output.clear?.(); } catch (_) {}
    for (var note = 36; note <= 99; note++) {
      try { output.send([0x90, note, 0]); } catch (_) {}
    }
    for (var channel = 0; channel < 16; channel++) {
      for (var serialNote = 36; serialNote <= 99; serialNote++) {
        try { output.send([0x80 | channel, serialNote, 0]); } catch (_) {}
      }
    }
    for (var cc = 0; cc <= 127; cc++) {
      try { output.send([0xb0, cc, 0]); } catch (_) {}
    }
  });
}

function padWebGetPushMidiOutputs() {
  var outputs = [];
  var add = function(output) {
    if (!output || outputs.indexOf(output) >= 0) return;
    outputs.push(output);
  };
  add(midiOutput);
  add(midiOutputDAW);
  _pushLedOutputs.forEach(add);
  return outputs;
}

var _pushWebShuttingDown = false;

function padWebBeginPushShutdown() {
  _pushWebShuttingDown = true;
  // Freeze the normal LED renderer before the shutdown clear. Without
  // this, a late render()/MIDI callback can repaint the scale after the
  // 64 zero-velocity messages have already been sent.
  _lpOutputActive = false;
  _lpProgrammerMode = false;
  _lastLEDState = null;
  _pushColorPickPaletteVisible = false;
  _pushColorPickReadyAt = 0;
}

function padWebResumePushSurface() {
  _pushWebShuttingDown = false;
  if (_isPush && midiOutput) {
    _lpOutputActive = true;
    _lpProgrammerMode = true;
    for (var i = 0; i < 64; i++) _prevLEDState[i] = -1;
    try { if (typeof render === 'function') render(); } catch (_) {}
    try { if (typeof window !== 'undefined' && typeof window.padWebResetPushButtonLedState === 'function') window.padWebResetPushButtonLedState(); } catch (_) {}
    try { if (typeof window !== 'undefined' && typeof window.padWebSyncPushButtonLeds === 'function') window.padWebSyncPushButtonLeds(); } catch (_) {}
  }
}

function padWebResetPushMidiRuntimeState() {
  if (typeof window.padWebResetPushInputState === 'function' && !window.IS_DESKTOP_MODE) window.padWebResetPushInputState();
  try { if (typeof _cancelSustainDebounce === 'function') _cancelSustainDebounce(); } catch (_) {}
  try {
    if (typeof _midiSustainOn !== 'undefined') _midiSustainOn = false;
    if (typeof setSustain === 'function') setSustain(false);
  } catch (_) {}
  try { if (midiHeldState) midiHeldState.clearAll(); } catch (_) {}
  try { midiActiveNotes.clear(); } catch (_) {}
  for (var i = 0; i < 64; i++) _prevLEDState[i] = -1;
}

function padWebGetPushDisplaySnapshot() {
  var payload = (typeof padWebGetLatestObservedShellUstPayload === 'function')
    ? padWebGetLatestObservedShellUstPayload() : null;
  var notes = Array.from(midiActiveNotes).sort(function(a, b) { return a - b; });
  var pushHeldSlot = typeof window.padWebPushHeldSlotActive === 'function' && window.padWebPushHeldSlotActive();
  if (pushHeldSlot) notes = Array.from(PlainState.activeNotes).sort(function(a, b) { return a - b; });
  var noteNames = notes.map(function(note) {
    try { return pcName(((note % 12) + 12) % 12); }
    catch (_) { return String(note); }
  });
  var key = '';
  var scale = '';
  try {
    key = pcName(AppState.key, AppState.key);
    scale = (SCALES[AppState.scaleIdx] && SCALES[AppState.scaleIdx].name) || '';
  } catch (_) {}
  var chord = payload && payload.chord && payload.chord.name || '';
  if (pushHeldSlot && window.padWebPushControlState) {
    var heldSlot = PlainState.memory[window.padWebPushControlState.heldSlot];
    chord = heldSlot ? heldSlot.chordName : '';
  }
  if (!pushHeldSlot
      && typeof AppState !== 'undefined' && AppState.mode === 'input'
      && typeof padWebFormatTopResolvedChordText === 'function'
      && typeof lastDetectedCandidates !== 'undefined') {
    var resolvedTopText = padWebFormatTopResolvedChordText(lastDetectedCandidates);
    if (resolvedTopText) chord = resolvedTopText;
  }
  if (!chord) {
    var detect = document.getElementById('midi-detect');
    var first = detect && detect.firstElementChild;
    chord = (first && first.textContent || '').replace(/UST:.*/, '').trim();
  }
  var shell = payload && payload.shell && Array.isArray(payload.shell.degrees)
    ? payload.shell.degrees.join(' ') : '';
  var ust = '';
  if (payload && payload.ust) {
    ust = payload.ust.name || '';
    if (payload.ust.base) ust += ' / ' + payload.ust.base;
  }
  var tensions = payload && Array.isArray(payload.tensions)
    ? payload.tensions.map(function(item) { return item.label; }).filter(Boolean).join(' ') : '';
  return {
    mode: (typeof AppState !== 'undefined' && AppState.mode) || '',
    key: key,
    scale: scale,
    chord: chord,
    notes: noteNames,
    shell: shell,
    ust: ust,
    tensions: tensions,
    chordEntry: typeof window.padWebGetPushChordEntryDisplay === 'function' ? window.padWebGetPushChordEntryDisplay() : null,
    chordLowerRow: typeof window.padWebGetPushChordLowerRow === 'function' ? window.padWebGetPushChordLowerRow() : null,
  };
}

if (typeof window !== 'undefined') {
  window.padWebGetPushMidiOutputs = padWebGetPushMidiOutputs;
  window.padWebBeginPushShutdown = padWebBeginPushShutdown;
  window.padWebResumePushSurface = padWebResumePushSurface;
  window.padWebResetPushMidiRuntimeState = padWebResetPushMidiRuntimeState;
  window.padWebGetPushDisplaySnapshot = padWebGetPushDisplaySnapshot;
}

function setLEDMode(mode) {
  _lpLEDMode = mode;
  // Force full re-send by resetting prev state
  for (var i = 0; i < 64; i++) _prevLEDState[i] = -1;
  try { localStorage.setItem('64pad-led-mode', mode); } catch(_) {}
  render();
}

// Convert 64PE grid (row, col) to Launchpad Programmer mode note (11-88)
function _lpNote(row, col) {
  return (row + 1) * 10 + (col + 1);
}

// Convert Launchpad Programmer mode note (11-88) to 64PE MIDI note
function _lpProgrammerToFourths(note) {
  var lpRow = Math.floor(note / 10) - 1;
  var lpCol = (note % 10) - 1;
  if (lpRow < 0 || lpRow >= 8 || lpCol < 0 || lpCol >= 8) return -1;
  return baseMidi() + lpRow * ROW_INTERVAL + lpCol;
}

function _enterLaunchpadProgrammerMode() {
  var port = midiOutputDAW || midiOutput;
  if (!port) return;
  var sysex = [0xF0, 0x00, 0x20, 0x29, 0x02, _lpDeviceByte, 0x0E, 0x01, 0xF7];
  try {
    port.send(sysex);
    _lpProgrammerMode = true;
    // Also try sending on MIDI port in case DAW port didn't work
    if (midiOutput && midiOutput !== port) {
      try { midiOutput.send(sysex); } catch(_) {}
    }
  } catch(e) {
    // SysEx not permitted (user denied or browser blocked)
    _lpProgrammerMode = false;
    _lpOutputActive = false;
    console.warn('[64PE] SysEx not available — LED control disabled. Grant MIDI SysEx permission to enable.');
  }
}

function _exitLaunchpadProgrammerMode() {
  if (!_lpProgrammerMode) return;
  var sysex = [0xF0, 0x00, 0x20, 0x29, 0x02, _lpDeviceByte, 0x0E, 0x00, 0xF7];
  var port = midiOutputDAW || midiOutput;
  try { if (port) port.send(sysex); } catch(_) {}
  try { if (midiOutput && midiOutput !== port) midiOutput.send(sysex); } catch(_) {}
  _lpProgrammerMode = false;
}

function updateLaunchpadLEDs(state) {
  if (_pushWebShuttingDown) return;
  _lastLEDState = state;
  if (_isPush && _pushIsColorPickActive()) return;
  if (!midiOutput || !_lpOutputActive || !_lpProgrammerMode) return;
  // Push pad LEDs follow the rendered controller state. _padColorToLP applies
  // the current Scale / Chord / Memory / Perform presentation, including exact
  // Chord-position overlays and the scale background defined by the current view.
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var idx = row * COLS + col;
      var color = _padColorToLP(state, row, col);
      if (color !== _prevLEDState[idx]) {
        var note;
        if (_isPush) {
          // Push 3 User Mode: serial layout (36 + row*8 + col)
          note = 36 + row * 8 + col;
        } else if (_lpProgrammerMode) {
          note = _lpNote(row, col);
        } else {
          note = baseMidi() + row * ROW_INTERVAL + col;
        }
        if (note >= 0 && note <= 127) {
          if (_isPush) padWebSendPushLedMessage([0x90, note, color]);
          else midiOutput.send([0x90, note, color]);
        }
        _prevLEDState[idx] = color;
      }
    }
  }
}

// Re-run LED update with cached state (for noteOn/noteOff feedback)
function refreshLaunchpadLEDs() {
  if (_pushWebShuttingDown) return;
  if (_isPush && _pushIsColorPickActive()) return;
  if (_lastLEDState) updateLaunchpadLEDs(_lastLEDState);
}

function clearLaunchpadLEDs() {
  if (!midiOutput) return;
  for (var i = 0; i < 64; i++) {
    if (_prevLEDState[i] > 0) {
      var row = Math.floor(i / COLS);
      var col = i % COLS;
      var note;
      if (_isPush) {
        note = 36 + row * 8 + col;
      } else if (_lpProgrammerMode) {
        note = _lpNote(row, col);
      } else {
        note = baseMidi() + row * ROW_INTERVAL + col;
      }
      if (note >= 0 && note <= 127) {
        if (_isPush) padWebSendPushLedMessage([0x90, note, 0]);
        else midiOutput.send([0x90, note, 0]);
      }
    }
    _prevLEDState[i] = -1;
  }
}

// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  detectChord, CHORD_DB, TRIAD_DB, TETRAD_DB,
  midiSourceMetadataForInput, nativeMidiSourceMetadata, getMidiHeldSources,
  onMidiNoteOn, onMidiNoteOff, onNativeMidiIn, onNativeMidiOff,
  releaseAllMidiHeldSources,
};
