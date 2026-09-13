(function(global) {
  'use strict';

  // Classic-script const/let bindings are NOT window properties. Read the live
  // application state, including later reassignment of memoryViewMode, rather
  // than maintaining a second controller-owned copy. Node fixtures may supply
  // window properties when the application's scripts are not loaded.
  var runtime = {
    get AppState() { return typeof AppState !== 'undefined' ? AppState : global.AppState; },
    get BuilderState() { return typeof BuilderState !== 'undefined' ? BuilderState : global.BuilderState; },
    get VoicingState() { return typeof VoicingState !== 'undefined' ? VoicingState : global.VoicingState; },
    get PlainState() { return typeof PlainState !== 'undefined' ? PlainState : global.PlainState; },
    get PerformState() { return typeof PerformState !== 'undefined' ? PerformState : global.PerformState; },
    get TastyState() { return typeof TastyState !== 'undefined' ? TastyState : global.TastyState; },
    get StockState() { return typeof StockState !== 'undefined' ? StockState : global.StockState; },
    get BankState() { return typeof BankState !== 'undefined' ? BankState : global.BankState; },
    get GuitarPositionState() { return typeof GuitarPositionState !== 'undefined' ? GuitarPositionState : global.GuitarPositionState; },
    get SCALES() { return typeof SCALES !== 'undefined' ? SCALES : global.SCALES; },
    get BUILDER_QUALITIES() { return typeof BUILDER_QUALITIES !== 'undefined' ? BUILDER_QUALITIES : global.BUILDER_QUALITIES; },
    get memoryViewMode() { return typeof memoryViewMode !== 'undefined' ? memoryViewMode : global.memoryViewMode; },
    get linkMode() { return typeof linkMode !== 'undefined' ? linkMode : global.linkMode; },
    get showGuitar() { return typeof showGuitar !== 'undefined' ? showGuitar : global.showGuitar; },
    get showBass() { return typeof showBass !== 'undefined' ? showBass : global.showBass; },
    get showPiano() { return typeof showPiano !== 'undefined' ? showPiano : global.showPiano; },
    get TutorialEngine() { return typeof TutorialEngine !== 'undefined' ? TutorialEngine : global.TutorialEngine; },
  };

  var controlState = {
    cc: typeof global.padWebCreatePushCcState === 'function' ? global.padWebCreatePushCcState() : {},
    deleteHeld: false,
    deletePadUsed: false,
    duplicateHeld: false,
    duplicateSource: null,
    entryStep: null,
    entryRoot: null,
    entryQualityIndex: 0,
    chordLowerLayerIndex: 0,
    tensionMode: false,
    inputPadLayout: false,
    changingLayout: false,
    heldSlot: null,
    heldNotes: [],
    ownedPads: new Set(),
    setupActive: false,
    setupField: 0,
    lastRawByKey: Object.create(null),
    buttonLedState: Object.create(null),
  };

  function wrap(value, len) {
    if (!len) return 0;
    return ((value % len) + len) % len;
  }

  function call(name) {
    var fn = global[name];
    if (typeof fn !== 'function') return undefined;
    return fn.apply(global, Array.prototype.slice.call(arguments, 1));
  }

  function sendButtonLed(key, cc, state, colorPaletteLed) {
    if (global.IS_DESKTOP_MODE || typeof global.padWebSendPushButtonLed !== 'function') return;
    var desired = state || 'off';
    var previous = controlState.buttonLedState[key];
    if (previous === desired) return;
    controlState.buttonLedState[key] = desired;

    // Desktop's proven blink contract uses channel 10 after explicitly clearing
    // channel 1. Reset channel 1 before leaving blink so firmware mode cannot leak.
    if (previous === 'blink' && desired !== 'blink') {
      global.padWebSendPushButtonLed(cc, 'off', !!colorPaletteLed);
    }
    global.padWebSendPushButtonLed(cc, desired, !!colorPaletteLed);
  }

  function resetButtonLedState() {
    controlState.buttonLedState = Object.create(null);
  }

  function domButtonActive(id, fallback) {
    if (typeof document !== 'undefined') {
      var el = document.getElementById(id);
      if (el && el.classList) return el.classList.contains('active');
    }
    return !!fallback;
  }

  function keySectionVisible() {
    try {
      if (global.localStorage) {
        var saved = JSON.parse(global.localStorage.getItem('64pad-sections') || '{}');
        return saved.key !== false;
      }
    } catch (_) {}
    return true;
  }

  function completedChord() {
    return currentMode() === 'chord' && runtime.BuilderState
      && runtime.BuilderState.root !== null && runtime.BuilderState.root !== undefined
      && !!runtime.BuilderState.quality;
  }

  function performBankContext() {
    return currentMode() === 'input' && runtime.memoryViewMode === 'perform';
  }

  function upperButtonStates() {
    if (controlState.entryStep) {
      var list = controlState.entryStep === 'root' ? new Array(12).fill(true) : qualityList().map(function() { return true; });
      var activeIndex = controlState.entryStep === 'root'
        ? (controlState.entryRoot === null || controlState.entryRoot === undefined ? -1 : controlState.entryRoot)
        : controlState.entryQualityIndex;
      return new Array(8).fill(null).map(function(_, i) {
        if (i >= list.length) return null;
        return i === activeIndex;
      });
    }

    var scaleName = '';
    try {
      scaleName = runtime.SCALES && runtime.AppState && runtime.SCALES[runtime.AppState.scaleIdx]
        ? String(runtime.SCALES[runtime.AppState.scaleIdx].name || '').toLowerCase() : '';
    } catch (_) {}
    var minorScale = scaleName.indexOf('minor') !== -1 || scaleName.indexOf('aeolian') !== -1;

    // Assigned-but-inactive buttons are white; selected state uses the accent.
    return [
      false,
      !!(runtime.TastyState && runtime.TastyState.enabled),
      !!(runtime.StockState && runtime.StockState.enabled),
      false,
      false,
      !!controlState.tensionMode,
      keySectionVisible(),
      minorScale,
    ];
  }

  function lowerButtonStates() {
    if (controlState.entryStep) {
      var list = controlState.entryStep === 'root' ? new Array(12).fill(true) : qualityList().map(function() { return true; });
      var activeIndex = controlState.entryStep === 'root'
        ? (controlState.entryRoot === null || controlState.entryRoot === undefined ? -1 : controlState.entryRoot)
        : controlState.entryQualityIndex;
      return new Array(8).fill(null).map(function(_, i) {
        var index = 8 + i;
        if (index >= list.length) return null;
        return index === activeIndex;
      });
    }
    if (performBankContext()) return [false, false, false, false, false, false, null, null];
    var chordRow = chordLowerRow();
    if (chordRow) return chordRow.states;
    var app = runtime.AppState || {};
    return [
      domButtonActive('inst-toggle-link', runtime.linkMode),
      domButtonActive('inst-toggle-guitar', runtime.showGuitar),
      domButtonActive('inst-toggle-bass', runtime.showBass),
      domButtonActive('inst-toggle-piano', runtime.showPiano),
      !!app.showMinorVariants,
      !!app.showParallelKey,
      !!app.showSecDom,
      !!app.showParentScales,
    ];
  }

  function syncButtonLeds() {
    if (global.IS_DESKTOP_MODE || typeof global.padWebSendPushButtonLed !== 'function') return;

    var upper = upperButtonStates();
    var lower = lowerButtonStates();
    for (var i = 0; i < 8; i++) {
      var up = upper[i];
      var lo = lower[i];
      sendButtonLed('u' + i, 102 + i, up === null ? 'off' : (up ? 'weak' : 'white-weak'), true);
      sendButtonLed('l' + i, 20 + i, lo === null ? 'off' : (lo ? 'weak' : 'white-weak'), true);
    }

    var mode = currentMode();
    var app = runtime.AppState || {};
    var setupOrPick = !!controlState.setupActive || !!global.__pushLedColorPickRole;
    var chordNav = completedChord();
    var navContext = setupOrPick || !!controlState.entryStep || chordNav || heldSlotActive();
    var bankContext = slotLayoutActive();
    var bankCount = 0;
    try { bankCount = runtime.BankState && Array.isArray(runtime.BankState.banks) ? runtime.BankState.banks.length : 0; } catch (_) {}

    sendButtonLed('setup', 30, setupOrPick ? 'strong' : 'weak', false);
    sendButtonLed('layout', 31, mode === 'input' ? 'strong' : 'weak', false);
    sendButtonLed('add', 32, bankContext ? 'weak' : 'off', false);
    sendButtonLed('swap', 33, mode === 'chord' ? (app.showAllPositions === true ? 'strong' : 'white-weak') : 'off', false);
    sendButtonLed('dpad-left', 44, navContext ? 'white-weak' : 'off', false);
    sendButtonLed('dpad-right', 45, navContext ? 'white-weak' : 'off', false);
    sendButtonLed('dpad-up', 46, navContext ? 'white-weak' : 'off', false);
    sendButtonLed('dpad-down', 47, navContext ? 'white-weak' : 'off', false);
    sendButtonLed('page-left', 62, bankContext && bankCount > 1 ? 'weak' : 'off', true);
    sendButtonLed('page-right', 63, bankContext && bankCount > 1 ? 'weak' : 'off', true);
    sendButtonLed('shift', 49, 'weak', false);
    sendButtonLed('duplicate', 88, bankContext ? (controlState.duplicateHeld ? 'strong' : 'weak') : 'off', false);
    sendButtonLed('dpad-center', 91, navContext ? 'white-weak' : 'off', false);
    sendButtonLed('jog-press', 94, navContext ? 'white-weak' : 'off', false);
    sendButtonLed('delete', 118, controlState.deleteHeld ? 'strong' : 'weak', false);
    sendButtonLed('undo', 119, 'weak', false);
    sendButtonLed('oct-down', 54, 'weak', false);
    sendButtonLed('oct-up', 55, 'weak', false);
    sendButtonLed('scale', 58, mode === 'scale' ? 'strong' : 'weak', false);
    sendButtonLed('play', 85, 'weak', true);

    var captureEnabled = mode === 'input';
    try {
      if (!captureEnabled && typeof global.getCurrentChordPlaybackMidiNotes === 'function') {
        var playbackNotes = global.getCurrentChordPlaybackMidiNotes();
        captureEnabled = !!(playbackNotes && playbackNotes.length);
      } else if (!captureEnabled && typeof global.getCurrentChordMidiNotes === 'function') {
        var notes = global.getCurrentChordMidiNotes();
        captureEnabled = !!(notes && notes.length);
      }
    } catch (_) {}
    sendButtonLed('capture', 65, captureEnabled ? 'weak' : 'off', true);
    sendButtonLed('sets', 80, 'weak', false);
    sendButtonLed('learn', 81, 'weak', false);
    sendButtonLed('save', 82, 'weak', false);
    sendButtonLed('lock', 83, app.padCFixed === true ? 'red-soft' : 'white-weak', false);
    // Browser has no native plug-in device picker: keep the physical button dark.
    sendButtonLed('device', 110, 'off', false);
    sendButtonLed('record', 86, mode === 'input' ? 'strong' : 'weak', true);
  }

  function refresh() {
    try { if (typeof global.updateChordDisplay === 'function') global.updateChordDisplay(); } catch (_) {}
    try { if (typeof global.updatePlainDisplay === 'function' && runtime.AppState && runtime.AppState.mode === 'input') global.updatePlainDisplay(); } catch (_) {}
    try { if (typeof global.render === 'function') global.render(); } catch (_) {}
    try { if (typeof global.updateMemorySlotUI === 'function') global.updateMemorySlotUI(); } catch (_) {}
    try { if (typeof global.updateBankUI === 'function') global.updateBankUI(); } catch (_) {}
    try { if (typeof global.saveAppSettings === 'function') global.saveAppSettings(); } catch (_) {}
    try { if (typeof global.refreshLaunchpadLEDs === 'function') global.refreshLaunchpadLEDs(); } catch (_) {}
    try { syncButtonLeds(); } catch (_) {}
  }

  function currentMode() {
    return runtime.AppState && runtime.AppState.mode ? runtime.AppState.mode : '';
  }

  function setMode(mode) {
    if (typeof global.setMode === 'function') global.setMode(mode);
    refresh();
  }

  function setScaleRootDelta(delta) {
    if (!runtime.AppState) return false;
    runtime.AppState.key = wrap((runtime.AppState.key || 0) + (delta < 0 ? -1 : 1), 12);
    if (typeof global.onKeyChanged === 'function') global.onKeyChanged();
    else refresh();
    return true;
  }

  function setScaleIndexDelta(delta) {
    if (!runtime.AppState || !Array.isArray(runtime.SCALES) || !runtime.SCALES.length) return false;
    runtime.AppState.scaleIdx = wrap((runtime.AppState.scaleIdx || 0) + (delta < 0 ? -1 : 1), runtime.SCALES.length);
    var sel = document.getElementById('scale-select');
    if (sel) sel.value = String(runtime.AppState.scaleIdx);
    if (typeof global.renderDiatonicBar === 'function') global.renderDiatonicBar();
    if (typeof global.updateScaleKeyDisplay === 'function') global.updateScaleKeyDisplay();
    refresh();
    return true;
  }

  function nudgeChordRoot(delta) {
    if (!runtime.BuilderState || runtime.BuilderState.root === null || runtime.BuilderState.root === undefined || !runtime.BuilderState.quality) return false;
    if (runtime.TastyState && runtime.TastyState.enabled) call('disableTasty');
    if (runtime.StockState && runtime.StockState.enabled) call('disableStock');
    runtime.BuilderState.root = wrap(runtime.BuilderState.root + delta, 12);
    if (runtime.BuilderState.bass !== null && runtime.BuilderState.bass !== undefined) {
      runtime.BuilderState.bass = wrap(runtime.BuilderState.bass + delta, 12);
    }
    // Match Standalone: semitone navigation keeps the completed chord intact.
    // selectRoot() is an entry action and would clear quality/tension/bass.
    runtime.BuilderState._fromDiatonic = false;
    runtime.BuilderState._diatonicScaleIdx = undefined;
    runtime.BuilderState._fromSecDom = false;
    runtime.BuilderState._secDomTargetIsMajor = undefined;
    call('resetVoicingSelection');
    refresh();
    return true;
  }

  function cycleInversion(delta) {
    if (!runtime.AppState || runtime.AppState.mode !== 'chord' || !runtime.BuilderState || !runtime.BuilderState.quality) return false;
    if (typeof global.chordBasicFormActive === 'function' && global.chordBasicFormActive()
        && typeof global.stepBasicFormInversion === 'function') {
      global.stepBasicFormInversion(delta < 0 ? -1 : 1);
      refresh();
      return true;
    }
    if (runtime.VoicingState && runtime.VoicingState.shell) return false;
    var pcs = typeof global.getBuilderPCS === 'function' ? global.getBuilderPCS() : (runtime.BuilderState.quality.pcs || []);
    var maxInv = Math.min(3, Math.max(0, (pcs ? pcs.length : 1) - 1));
    var inv = runtime.VoicingState ? (runtime.VoicingState.inversion || 0) : 0;
    inv = delta > 0 ? (inv < maxInv ? inv + 1 : 0) : (inv > 0 ? inv - 1 : maxInv);
    if (typeof global.setInversion === 'function') global.setInversion(inv);
    else if (runtime.VoicingState) runtime.VoicingState.inversion = inv;
    refresh();
    return true;
  }

  function visibleTensionButtons(availableOnly) {
    return Array.prototype.slice.call(document.querySelectorAll('#tension-grid .tension-btn')).filter(function(btn) {
      if (!btn || !btn._tension || btn.classList.contains('quality-hidden')) return false;
      if (availableOnly && (btn.classList.contains('scale-unavailable') || btn.classList.contains('tension-possible') || btn.classList.contains('tension-uncommon'))) return false;
      return true;
    });
  }

  function cycleTension(delta) {
    var buttons = visibleTensionButtons(true);
    if (!buttons.length) buttons = visibleTensionButtons(false);
    if (!buttons.length) return false;
    var selected = -1;
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].classList.contains('selected')) { selected = i; break; }
    }
    var next = selected < 0 ? (delta < 0 ? buttons.length - 1 : 0) : wrap(selected + (delta < 0 ? -1 : 1), buttons.length);
    buttons[next].click();
    refresh();
    return true;
  }

  function cycleActiveVoicing(delta, alternative) {
    if (runtime.TastyState && runtime.TastyState.enabled && typeof global.cycleTasty === 'function') {
      global.cycleTasty(delta < 0); refresh(); return true;
    }
    if (runtime.StockState && runtime.StockState.enabled && typeof global.cycleStock === 'function') {
      global.cycleStock(delta < 0); refresh(); return true;
    }
    if (typeof global.isGuitarEngineActive === 'function' && global.isGuitarEngineActive()) {
      if (alternative && runtime.GuitarPositionState && Array.isArray(runtime.GuitarPositionState.groups)
          && runtime.GuitarPositionState.groups.length > 1 && typeof global.setGuitarEngineGroup === 'function') {
        var gi = runtime.GuitarPositionState.currentGroupIdx || 0;
        global.setGuitarEngineGroup(wrap(gi + (delta < 0 ? -1 : 1), runtime.GuitarPositionState.groups.length));
      } else if (typeof global.cycleGuitarEngine === 'function') {
        global.cycleGuitarEngine(delta < 0);
      }
      refresh(); return true;
    }
    if (alternative && typeof global.chordBasicFormActive === 'function' && global.chordBasicFormActive()
        && typeof global.cycleBasicFormPosition === 'function') {
      global.cycleBasicFormPosition(); refresh(); return true;
    }
    if (runtime.VoicingState && Array.isArray(runtime.VoicingState.lastBoxes) && runtime.VoicingState.lastBoxes.length) {
      var idx = runtime.VoicingState.selectedBoxIdx;
      if (idx === null || idx === undefined) idx = 0;
      if (alternative) {
        var box = runtime.VoicingState.lastBoxes[idx];
        if (box && Array.isArray(box.alternatives) && box.alternatives.length > 1 && typeof global.selectVoicingBox === 'function') {
          global.selectVoicingBox(idx); refresh(); return true;
        }
      } else {
        var next = wrap(idx + (delta < 0 ? -1 : 1), runtime.VoicingState.lastBoxes.length);
        if (typeof global.selectVoicingBox === 'function') global.selectVoicingBox(next);
        refresh(); return true;
      }
    }
    return false;
  }

  function qualityList() {
    var out = [];
    if (!Array.isArray(runtime.BUILDER_QUALITIES)) return out;
    runtime.BUILDER_QUALITIES.forEach(function(row) { (row || []).forEach(function(q) { if (q) out.push(q); }); });
    return out;
  }

  function beginEntry(step) {
    controlState.tensionMode = false;
    if (currentMode() !== 'chord') setMode('chord');
    controlState.entryStep = step === 'quality' ? 'quality' : 'root';
    controlState.entryRoot = runtime.BuilderState && runtime.BuilderState.root !== null && runtime.BuilderState.root !== undefined
      ? runtime.BuilderState.root : null;
    var list = qualityList();
    controlState.entryQualityIndex = 0;
    if (runtime.BuilderState && runtime.BuilderState.quality) {
      for (var i = 0; i < list.length; i++) if (list[i].name === runtime.BuilderState.quality.name) controlState.entryQualityIndex = i;
    }
    if (typeof global.setBuilderStep === 'function') global.setBuilderStep(1);
    return true;
  }

  function cycleEntry(delta) {
    if (!controlState.entryStep) return false;
    if (controlState.entryStep === 'root') {
      if (controlState.entryRoot === null || controlState.entryRoot === undefined) controlState.entryRoot = delta < 0 ? 11 : 0;
      else controlState.entryRoot = wrap(controlState.entryRoot + delta, 12);
    }
    else {
      var list = qualityList();
      controlState.entryQualityIndex = wrap(controlState.entryQualityIndex + delta, Math.max(1, list.length));
    }
    return true;
  }

  function applyEntry(index) {
    if (!controlState.entryStep) return false;
    if (controlState.entryStep === 'root') {
      var root = index === undefined ? controlState.entryRoot : index;
      if (root === null || root === undefined) root = 0;
      if (root < 0 || root > 11) return true;
      if (typeof global.selectRoot === 'function') global.selectRoot(root);
      controlState.entryRoot = root;
      controlState.entryStep = 'quality';
      refresh();
      return true;
    }
    var list = qualityList();
    var qi = index === undefined ? controlState.entryQualityIndex : index;
    if (!list[qi]) return true;
    if (runtime.BuilderState && (runtime.BuilderState.root === null || runtime.BuilderState.root === undefined)
        && typeof global.selectRoot === 'function') global.selectRoot(controlState.entryRoot || 0);
    if (typeof global.selectQuality === 'function') global.selectQuality(list[qi]);
    controlState.entryQualityIndex = qi;
    controlState.entryStep = null;
    refresh();
    return true;
  }

  function toggleMajorMinorScale() {
    if (!runtime.AppState || !Array.isArray(runtime.SCALES)) return false;
    var current = runtime.SCALES[runtime.AppState.scaleIdx] ? String(runtime.SCALES[runtime.AppState.scaleIdx].name || '').toLowerCase() : '';
    runtime.AppState.scaleIdx = (current.indexOf('minor') !== -1 || current.indexOf('aeolian') !== -1) ? 0 : 5;
    var sel = document.getElementById('scale-select'); if (sel) sel.value = String(runtime.AppState.scaleIdx);
    refresh(); return true;
  }

  function toggleKeySection() {
    try {
      var s = JSON.parse(localStorage.getItem('64pad-sections') || '{}');
      var next = s.key === false;
      if (typeof global.setSectionVisible === 'function') global.setSectionVisible('key', next);
      else if (typeof global.toggleSection === 'function') global.toggleSection('key');
      refresh(); return true;
    } catch (_) { return false; }
  }

  // S1: same layer vocabulary as Standalone. Chord generation stays in pad-core.
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

  function entryRootLabel(pc) {
    if (pc === null || pc === undefined) return 'None';
    try {
      if (typeof pcName === 'function') return pcName(pc, runtime.AppState ? runtime.AppState.key : pc);
    } catch (_) {}
    var names = typeof NOTE_NAMES_SHARP !== 'undefined' ? NOTE_NAMES_SHARP : global.NOTE_NAMES_SHARP;
    return names && names[pc] ? names[pc] : String(pc);
  }

  function chordEntryDisplay() {
    if (global.IS_DESKTOP_MODE || !controlState.entryStep) return null;
    var labels = new Array(16).fill('');
    var states = new Array(16).fill(null);
    var activeIndex = -1;
    if (controlState.entryStep === 'root') {
      activeIndex = controlState.entryRoot === null || controlState.entryRoot === undefined ? -1 : controlState.entryRoot;
      for (var i = 0; i < 12; i++) {
        labels[i] = entryRootLabel(i);
        states[i] = i === activeIndex;
      }
    } else {
      var qualities = qualityList();
      activeIndex = controlState.entryQualityIndex;
      for (var q = 0; q < Math.min(16, qualities.length); q++) {
        labels[q] = qualities[q] && qualities[q].name ? qualities[q].name : '';
        states[q] = q === activeIndex;
      }
    }
    var title = controlState.entryStep === 'root' ? 'Select Root' : 'Select Quality';
    var detail = controlState.entryStep === 'root'
      ? ('Root: ' + entryRootLabel(controlState.entryRoot))
      : ('Quality: ' + (labels[activeIndex] || ''));
    return {
      step: controlState.entryStep,
      title: title,
      detail: detail,
      hint: 'Display buttons choose / Jog moves / Press confirms',
      upper: { labels: labels.slice(0, 8), states: states.slice(0, 8) },
      lower: { labels: labels.slice(8, 16), states: states.slice(8, 16) },
    };
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

  function lowerSwitch(index) {
    if (currentMode() === 'chord') return selectChordLower(index);
    var perform = currentMode() === 'input' && runtime.memoryViewMode === 'perform';
    if (perform) {
      if (index === 0) call('playMemorySlots');
      else if (index === 1) call('exportPlainMidi');
      else if (index === 2) call('importMidi');
      else if (index === 3) call('addBank');
      else if (index === 4) call('switchBank', -1);
      else if (index === 5) call('switchBank', 1);
      refresh(); return true;
    }
    if (index === 0) call('toggleLinkMode');
    else if (index === 1) call('toggleInstrument', 'guitar');
    else if (index === 2) call('toggleInstrument', 'bass');
    else if (index === 3) call('toggleInstrument', 'piano');
    else if (index === 4) call('toggleMinorVariants');
    else if (index === 5) call('toggleParallelKey');
    else if (index === 6) call('toggleSecDom');
    else if (index === 7) call('toggleParentScales');
    refresh(); return true;
  }

  function upperSwitch(index) {
    if (index === 0) return beginEntry('root');
    if (index === 1) { call('toggleTasty'); refresh(); return true; }
    if (index === 2) { call('toggleStock'); refresh(); return true; }
    if (index === 3) { call('toggleVoicingReflect'); refresh(); return true; }
    if (index === 4) return beginEntry('quality');
    if (index === 5) {
      if (currentMode() !== 'chord') setMode('chord');
      if (runtime.BuilderState && runtime.BuilderState.quality && typeof global.setBuilderStep === 'function') {
        global.setBuilderStep(2); controlState.tensionMode = true; refresh();
      }
      return true;
    }
    if (index === 6) return toggleKeySection();
    if (index === 7) return toggleMajorMinorScale();
    return true;
  }

  var setupFields = ['focus','layout','color-coding','show-all-positions','c-fixed','color-root','color-scale','color-pressed','color-memory','color-perform','tips','badges','reset','close'];
  function setupShow() {
    if (typeof global.setViewSetupFocusField === 'function') global.setViewSetupFocusField(setupFields[controlState.setupField]);
  }
  function setupToggle() {
    controlState.setupActive = !controlState.setupActive;
    if (controlState.setupActive) { call('openViewSetupPanel'); setupShow(); }
    else call('closeViewSetupPanel');
    return true;
  }
  function setupMove(delta) {
    controlState.setupField = wrap(controlState.setupField + (delta < 0 ? -1 : 1), setupFields.length);
    setupShow(); return true;
  }
  function setupChange(delta) {
    var field = setupFields[controlState.setupField];
    if (field === 'focus') {
      var values = ['all','B','A','C'];
      var cur = (document.body && document.body.dataset && document.body.dataset.paneView) || 'all';
      call('setPaneView', values[wrap(Math.max(0, values.indexOf(cur)) + (delta < 0 ? -1 : 1), values.length)]);
    } else if (field === 'layout') {
      var layouts = ['ABC','ACB','BAC','BCA','CAB','CBA'];
      var lcur = localStorage.getItem('64pad-pane-order') || 'ABC';
      call('setPaneOrder', layouts[wrap(Math.max(0, layouts.indexOf(lcur)) + (delta < 0 ? -1 : 1), layouts.length)]);
    } else if (field === 'color-coding') call('toggleColorCoding', delta > 0);
    else if (field === 'show-all-positions') call('toggleShowAllPositions', delta > 0);
    else if (field === 'c-fixed') call('toggleCFixed', delta > 0);
    else if (field === 'tips') call('toggleStartupTips', delta > 0);
    else if (field === 'badges') call('toggleBadges', delta > 0);
    else {
      var role = field === 'color-root' ? 'root' : field === 'color-scale' ? 'scale' : field === 'color-pressed' ? 'pressed' : field === 'color-memory' ? 'memorySlot' : field === 'color-perform' ? 'performActive' : null;
      if (role) call('startViewSetupPushColorPick', role);
    }
    syncView(); return true;
  }
  function syncView() { try { call('syncViewSetupControls'); } catch (_) {} refresh(); }
  function setupConfirm() {
    var field = setupFields[controlState.setupField];
    if (field === 'close') { controlState.setupActive = false; call('closeViewSetupPanel'); return true; }
    if (field === 'reset') { if (runtime.TutorialEngine && typeof runtime.TutorialEngine.reset === 'function') runtime.TutorialEngine.reset(); return true; }
    return setupChange(1);
  }

  function clearCurrent() {
    if (currentMode() === 'input') call('clearPlainNotes');
    else if (currentMode() === 'chord') call('builderClear');
    refresh();
  }

  function playCurrent() {
    call('ensureAudioResumed');
    var notes = typeof global.getCurrentChordPlaybackMidiNotes === 'function' ? global.getCurrentChordPlaybackMidiNotes()
      : (typeof global.getCurrentChordMidiNotes === 'function' ? global.getCurrentChordMidiNotes() : null);
    if (notes && notes.length && typeof global.playMidiNotes === 'function') global.playMidiNotes(notes, 1.0);
  }

  function captureCurrent() {
    if (currentMode() === 'input' && typeof global.plainCapture === 'function') global.plainCapture();
    else call('captureCurrentToMemorySlot');
    refresh();
  }

  function backCurrent(redo) {
    if (currentMode() === 'input') {
      stopHeldSlot();
      if (redo) call('redoMemory'); else call('undoMemory');
    } else if (currentMode() === 'chord') {
      // Standalone Back first deselects a position; only the next Back unwinds
      // the builder. Redo/left side tap in Chord still follows builderBack.
      if (!redo && runtime.VoicingState && runtime.VoicingState.selectedBoxIdx != null) {
        runtime.VoicingState.selectedBoxIdx = null;
      } else {
        controlState.tensionMode = false;
        call('builderBack');
      }
    }
    refresh();
  }

  function toggleHelp() {
    var overlay = document.getElementById('help-overlay');
    if (overlay) overlay.classList.toggle('active');
  }

  function slotFromRawPad(rawNote) {
    var idx = (rawNote | 0) - 36;
    if (idx < 0 || idx >= 64) return null;
    var row = Math.floor(idx / 8), col = idx % 8;
    if (row > 3 || col > 3) return null;
    return (3 - row) * 4 + col;
  }

  function slotLayoutActive() {
    return currentMode() === 'input' && controlState.inputPadLayout;
  }

  function heldSlotActive() {
    return slotLayoutActive() && controlState.heldSlot !== null;
  }

  function stopHeldSlot(preserveBuffer) {
    var hadSlot = controlState.heldSlot !== null;
    // Use ordinary note release. A layout change is NOT a physical pedal-up:
    // never emit artificial CC64 or change the browser's physical sustain state.
    controlState.heldNotes.forEach(function(note) { call('noteOff', note); });
    controlState.heldNotes = [];
    controlState.heldSlot = null;
    if (hadSlot && runtime.PerformState) runtime.PerformState.activePad = null;
    if (hadSlot && !preserveBuffer && runtime.PlainState) runtime.PlainState.activeNotes.clear();
  }

  function beforeModeChange() {
    if (global.IS_DESKTOP_MODE || controlState.changingLayout) return;
    // Preserve Input's chord buffer for the existing Input -> Chord transfer.
    stopHeldSlot(true);
    controlState.inputPadLayout = false;
    controlState.entryStep = null;
    controlState.tensionMode = false;
  }

  function onMemoryViewChange(mode) {
    if (global.IS_DESKTOP_MODE || controlState.changingLayout) return;
    stopHeldSlot();
    // The on-screen Perform switch remains authoritative. Turning it off returns
    // to musical Input; the separate physical Layout button visits Memory slots.
    controlState.inputPadLayout = currentMode() === 'input' && mode === 'perform';
    refresh();
  }

  function setInputLayout(view, useSlots) {
    stopHeldSlot();
    // A NoteOff arriving after the switch will belong to the slot dispatcher.
    // Release the old musical owners first, without pretending the pedal lifted.
    call('releaseAllMidiHeldSources', true);
    controlState.entryStep = null;
    controlState.tensionMode = false;
    controlState.changingLayout = true;
    try {
      setMode('input');
      call('toggleMemoryView', view);
      controlState.inputPadLayout = !!useSlots;
    } finally { controlState.changingLayout = false; }
    refresh();
  }

  function cycleInputLayout() {
    // Standalone: musical Input -> Memory slots -> Perform slots -> musical Input.
    var wasSlots = slotLayoutActive();
    var wasPerform = runtime.memoryViewMode === 'perform';
    setInputLayout(wasSlots && !wasPerform ? 'perform' : 'memory', !wasSlots || !wasPerform);
    return true;
  }

  function voicingEngineActive() {
    return !!((runtime.TastyState && runtime.TastyState.enabled)
      || (runtime.StockState && runtime.StockState.enabled)
      || call('isGuitarEngineActive'));
  }

  function editHeldSlot(delta, rotate) {
    if (!delta || !heldSlotActive() || !runtime.PlainState) return true;
    var slot = runtime.PlainState.memory[controlState.heldSlot];
    if (!slot || !controlState.heldNotes.length || (rotate && controlState.heldNotes.length < 2)) return true;
    var notes = controlState.heldNotes.slice().sort(function(a, b) { return a - b; });
    if (rotate) {
      if (delta > 0) notes.push(notes.shift() + 12);
      else notes.unshift(notes.pop() - 12);
    } else notes = notes.map(function(note) { return note + delta; });
    notes = notes.map(function(note) { return Math.max(0, Math.min(127, note)); });
    call('pushUndoState');
    controlState.heldNotes.forEach(function(note) { call('noteOff', note); });
    controlState.heldNotes = notes;
    notes.forEach(function(note) { call('noteOn', note, 0.8); });
    runtime.PlainState.activeNotes = new Set(notes);
    if (runtime.PerformState) runtime.PerformState.activePad = controlState.heldSlot;
    var candidates = call('detectChord', notes) || [];
    var name = candidates.length ? candidates[0].name : slot.chordName;
    runtime.PlainState.memory[controlState.heldSlot] = call('makeMemorySlot', notes, name, null);
    call('syncMemoryToActiveBank');
    refresh();
    return true;
  }

  function slotPadColor(row, col) {
    if (!slotLayoutActive()) return null;
    if (row < 0 || row > 3 || col < 0 || col > 3) return 0;
    var slot = (3 - row) * 4 + col;
    var app = runtime.AppState || {};
    if (runtime.memoryViewMode === 'perform' && controlState.heldSlot === slot) return app.pushPerformActiveColor || 9;
    return runtime.PlainState && runtime.PlainState.memory[slot] ? (app.pushMemorySlotColor || 45) : 3;
  }

  function resetInputState() {
    stopHeldSlot();
    controlState.ownedPads.clear();
    controlState.deleteHeld = false;
    controlState.deletePadUsed = false;
    controlState.duplicateHeld = false;
    controlState.duplicateSource = null;
    controlState.cc = call('padWebCreatePushCcState') || {};
    controlState.lastRawByKey = Object.create(null);
    refresh();
  }

  function handlePad(rawNote, isDown) {
    if (global.IS_DESKTOP_MODE) return false;
    var slot = slotFromRawPad(rawNote);
    // Consume releases even after leaving the layout or releasing a modifier.
    if (!isDown && controlState.ownedPads.has(rawNote)) {
      controlState.ownedPads.delete(rawNote);
      if (slot === controlState.heldSlot) stopHeldSlot();
      refresh(); return true;
    }
    if (!slotLayoutActive()) return false;
    if (!isDown) return true;
    if (controlState.ownedPads.has(rawNote)) return true;
    controlState.ownedPads.add(rawNote);
    // Slot layout owns the whole grid; the other 48 pads must not play raw notes.
    if (slot === null || !runtime.PlainState) return true;
    var memory = runtime.PlainState.memory;
    if (controlState.deleteHeld) {
      controlState.deletePadUsed = true;
      if (memory[slot]) {
        if (controlState.heldSlot === slot) stopHeldSlot();
        call('pushUndoState'); memory[slot] = null;
        call('syncMemoryToActiveBank'); refresh();
      }
      return true;
    }
    if (controlState.duplicateHeld) {
      if (controlState.duplicateSource === null) {
        if (memory[slot]) controlState.duplicateSource = slot;
      } else {
        var src = memory[controlState.duplicateSource];
        if (src && slot !== controlState.duplicateSource) {
          call('pushUndoState'); memory[slot] = call('cloneMemorySlot', src);
          runtime.PlainState.currentSlot = slot;
          call('syncMemoryToActiveBank'); refresh();
        }
        controlState.duplicateSource = null;
      }
      return true;
    }
    if (!memory[slot] || !memory[slot].midiNotes.length) return true;
    stopHeldSlot();
    controlState.heldSlot = slot;
    controlState.heldNotes = memory[slot].midiNotes.slice();
    runtime.PlainState.activeNotes = new Set(controlState.heldNotes);
    if (runtime.memoryViewMode === 'perform') runtime.PerformState.activePad = slot;
    else runtime.PlainState.currentSlot = slot;
    call('ensureAudioResumed');
    controlState.heldNotes.forEach(function(note) { call('noteOn', note, 0.8); });
    refresh();
    return true;
  }

  function handleLogical(code, value) {
    code |= 0; value |= 0;

    if (global.IS_DESKTOP_MODE) return false;

    if (controlState.setupActive && code !== 70) {
      if (code === 30 || code === 33) return setupMove(value || 1);
      if (code === 35) return setupChange(value || 1);
      if (code === 43) return setupMove(-(value || 1));
      if (code === 34) return setupConfirm();
      if (code === 41) { controlState.setupActive = false; call('closeViewSetupPanel'); return true; }
      return true;
    }

    if (code === 70) return setupToggle();
    if (code === 1) { controlState.entryStep = null; setMode(currentMode() === 'scale' ? 'chord' : 'scale'); return true; }
    if (code === 3) { setInputLayout('memory', false); return true; }
    if (code === 47) return cycleInputLayout();

    if (controlState.entryStep) {
      if (code === 20) return applyEntry(8 + value);
      if (code === 21) return applyEntry(value);
      if (code === 30 || code === 35 || code === 43) return cycleEntry(value || 1);
      if (code === 34) return applyEntry();
      if (code === 36) return beginEntry(value > 0 ? 'quality' : 'root');
      if (code === 41) { controlState.entryStep = null; return true; }
    }

    if (code === 20) return lowerSwitch(value);
    if (code === 21) return upperSwitch(value);
    if (code === 30) {
      if (heldSlotActive()) return editHeldSlot(value, true);
      if (currentMode() === 'scale') {
        if (typeof global.doubleStopActive === 'function' && global.doubleStopActive() && typeof global.cycleDoubleStopDegree === 'function') {
          global.cycleDoubleStopDegree(value); refresh(); return true;
        }
        return setScaleIndexDelta(value);
      }
      if (currentMode() === 'chord') {
        if (controlState.tensionMode && runtime.BuilderState && runtime.BuilderState.step === 2) return cycleTension(value);
        if (voicingEngineActive()) return cycleActiveVoicing(value, false);
        return cycleInversion(value);
      }
      return true;
    }
    if (code === 33) { backCurrent(value < 0); return true; }
    if (code === 34) {
      if (heldSlotActive()) {
        runtime.PlainState.currentSlot = controlState.heldSlot;
        call('saveAppSettings'); refresh(); return true;
      }
      if (currentMode() === 'input') return true;
      if (currentMode() === 'scale' && typeof global.cycleDoubleStopPosition === 'function') { global.cycleDoubleStopPosition(); refresh(); return true; }
      return cycleActiveVoicing(1, true) || true;
    }
    if (code === 35) {
      if (heldSlotActive()) return editHeldSlot(value, false);
      if (currentMode() === 'scale' && call('doubleStopActive') && typeof global.cycleDoubleStopDegree === 'function') {
        call('cycleDoubleStopDegree', value); refresh(); return true;
      }
      if (currentMode() === 'chord') return nudgeChordRoot(value);
      if (currentMode() === 'scale') return setScaleRootDelta(value);
      return true;
    }
    if (code === 36) { if (performBankContext()) { stopHeldSlot(); call('switchBank', value < 0 ? -1 : 1); } refresh(); return true; }
    if (code >= 50 && code <= 57) {
      var enc = code - 50;
      if (enc === 1 && runtime.TastyState && runtime.TastyState.enabled) { call('cycleTasty', value < 0); refresh(); return true; }
      if (enc === 2 && runtime.StockState && runtime.StockState.enabled) { call('cycleStock', value < 0); refresh(); return true; }
      if (enc === 3 && typeof global.isGuitarEngineActive === 'function' && global.isGuitarEngineActive()) { call('cycleGuitarEngine', value < 0); refresh(); return true; }
      if (enc === 5) return cycleTension(value);
      if (enc === 6) return currentMode() === 'chord' ? nudgeChordRoot(value) : setScaleRootDelta(value);
      if (enc === 7) return setScaleIndexDelta(value);
      return true;
    }
    if (code === 40) {
      if (value) { controlState.deleteHeld = true; controlState.deletePadUsed = false; }
      else { if (controlState.deleteHeld && !controlState.deletePadUsed) clearCurrent(); controlState.deleteHeld = false; controlState.deletePadUsed = false; }
      return true;
    }
    if (code === 49) {
      controlState.duplicateHeld = value !== 0;
      if (!controlState.duplicateHeld) controlState.duplicateSource = null;
      return true;
    }
    if (code === 41) { backCurrent(value > 0); return true; }
    if (code === 42) { playCurrent(); return true; }
    if (code === 44) { captureCurrent(); return true; }
    if (code === 45) { if (runtime.TutorialEngine && typeof runtime.TutorialEngine.showSelector === 'function') runtime.TutorialEngine.showSelector(); return true; }
    if (code === 71) { toggleHelp(); return true; }
    if (code === 72) { if (runtime.AppState) call('toggleCFixed', !(runtime.AppState.padCFixed === true)); refresh(); return true; }
    if (code === 73) return true; // Native plug-in device picker has no browser equivalent.
    if (code === 74) { if (runtime.AppState) call('toggleShowAllPositions', !(runtime.AppState.showAllPositions === true)); refresh(); return true; }
    if (code === 75) { if (controlState.deleteHeld) call('deleteBank'); else call('addBank'); refresh(); return true; }
    if (code === 48) { call('saveAppSettings'); call('showSaveToast'); return true; }
    if (code === 46) {
      if (heldSlotActive()) return editHeldSlot(value * 12, false);
      call('shiftOctave', value);
      refresh();
      return true;
    }
    if (code === 43) {
      if (heldSlotActive()) return editHeldSlot(value, true);
      if (currentMode() === 'scale' && typeof global.doubleStopActive === 'function' && global.doubleStopActive() && typeof global.cycleDoubleStopInterval === 'function') {
        global.cycleDoubleStopInterval(value); refresh(); return true;
      }
      return cycleInversion(value) || true;
    }
    return false;
  }

  function mirroredDuplicate(cc, value, inputName, nowMs) {
    var key = String(cc) + ':' + String(value);
    var prev = controlState.lastRawByKey[key];
    controlState.lastRawByKey[key] = { inputName: String(inputName || ''), at: nowMs };
    return !!(prev && prev.inputName !== String(inputName || '') && (nowMs - prev.at) < 25);
  }

  function handleMidiCc(cc, value, meta) {
    if (global.IS_DESKTOP_MODE) return false; // native Standalone owns its control surface
    if (typeof global.padWebMapPushCc !== 'function') return false;
    meta = meta || {};
    var nowMs = Number.isFinite(meta.nowMs) ? meta.nowMs : (global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now());
    if (mirroredDuplicate(cc, value, meta.inputName, nowMs)) return true;
    var result = global.padWebMapPushCc(cc, value, {
      inputName: meta.inputName,
      nowMs: nowMs,
      padIsHeld: !!meta.padIsHeld || heldSlotActive(),
      padPlaybackBlocked: !!meta.padPlaybackBlocked || slotLayoutActive(),
      mpeMode: !!meta.mpeMode,
    }, controlState.cc);
    (result.events || []).forEach(function(e) { handleLogical(e.code, e.value); });
    if (result.handled) {
      try { syncButtonLeds(); } catch (_) {}
    }
    return !!result.handled;
  }

  global.padWebPushBeforeModeChange = beforeModeChange;
  global.padWebPushMemoryViewChanged = onMemoryViewChange;
  global.padWebPushSlotLayoutActive = slotLayoutActive;
  global.padWebPushHeldSlotActive = heldSlotActive;
  global.padWebPushSlotPadColor = slotPadColor;
  global.padWebResetPushInputState = resetInputState;
  global.padWebHandlePushControl = handleLogical;
  global.padWebHandlePushMidiCc = handleMidiCc;
  global.padWebPushControlWillHandlePad = handlePad;
  global.padWebPushControlState = controlState;
  function chordUpperDisplayStates() {
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
  global.padWebGetPushChordUpperDisplayStates = chordUpperDisplayStates;
  global.padWebSyncPushButtonLeds = syncButtonLeds;
  global.padWebResetPushButtonLedState = resetButtonLedState;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      handleLogical: handleLogical,
      slotFromRawPad: slotFromRawPad,
      syncButtonLeds: syncButtonLeds,
      resetButtonLedState: resetButtonLedState,
      chordUpperDisplayStates: chordUpperDisplayStates,
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
