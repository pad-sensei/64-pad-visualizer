(function(global) {
  'use strict';

  var controlState = {
    cc: typeof global.padWebCreatePushCcState === 'function' ? global.padWebCreatePushCcState() : {},
    deleteHeld: false,
    deletePadUsed: false,
    duplicateHeld: false,
    duplicateSource: null,
    entryStep: null,
    entryRoot: null,
    entryQualityIndex: 0,
    tensionMode: false,
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
    return currentMode() === 'chord' && global.BuilderState
      && global.BuilderState.root !== null && global.BuilderState.root !== undefined
      && !!global.BuilderState.quality;
  }

  function performBankContext() {
    return currentMode() === 'input' && global.memoryViewMode === 'perform';
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
      scaleName = global.SCALES && global.AppState && global.SCALES[global.AppState.scaleIdx]
        ? String(global.SCALES[global.AppState.scaleIdx].name || '').toLowerCase() : '';
    } catch (_) {}
    var minorScale = scaleName.indexOf('minor') !== -1 || scaleName.indexOf('aeolian') !== -1;

    // Assigned-but-inactive buttons are white; selected state uses the accent.
    return [
      false,
      !!(global.TastyState && global.TastyState.enabled),
      !!(global.StockState && global.StockState.enabled),
      false,
      false,
      !!controlState.tensionMode,
      keySectionVisible(),
      minorScale,
    ];
  }

  function lowerButtonStates() {
    if (performBankContext()) return [false, false, false, false, false, false, null, null];
    var app = global.AppState || {};
    return [
      domButtonActive('inst-toggle-link', global.linkMode),
      domButtonActive('inst-toggle-guitar', global.showGuitar),
      domButtonActive('inst-toggle-bass', global.showBass),
      domButtonActive('inst-toggle-piano', global.showPiano),
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
    var app = global.AppState || {};
    var setupOrPick = !!controlState.setupActive || !!global.__pushLedColorPickRole;
    var chordNav = completedChord();
    var navContext = setupOrPick || !!controlState.entryStep || chordNav;
    var bankContext = performBankContext();
    var bankCount = 0;
    try { bankCount = global.BankState && Array.isArray(global.BankState.banks) ? global.BankState.banks.length : 0; } catch (_) {}

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
    try { if (typeof global.updatePlainDisplay === 'function' && global.AppState && global.AppState.mode === 'input') global.updatePlainDisplay(); } catch (_) {}
    try { if (typeof global.render === 'function') global.render(); } catch (_) {}
    try { if (typeof global.updateMemorySlotUI === 'function') global.updateMemorySlotUI(); } catch (_) {}
    try { if (typeof global.updateBankUI === 'function') global.updateBankUI(); } catch (_) {}
    try { if (typeof global.saveAppSettings === 'function') global.saveAppSettings(); } catch (_) {}
    try { if (typeof global.refreshLaunchpadLEDs === 'function') global.refreshLaunchpadLEDs(); } catch (_) {}
    try { syncButtonLeds(); } catch (_) {}
  }

  function currentMode() {
    return global.AppState && global.AppState.mode ? global.AppState.mode : '';
  }

  function setMode(mode) {
    if (typeof global.setMode === 'function') global.setMode(mode);
    refresh();
  }

  function setScaleRootDelta(delta) {
    if (!global.AppState) return false;
    global.AppState.key = wrap((global.AppState.key || 0) + (delta < 0 ? -1 : 1), 12);
    if (typeof global.onKeyChanged === 'function') global.onKeyChanged();
    else refresh();
    return true;
  }

  function setScaleIndexDelta(delta) {
    if (!global.AppState || !Array.isArray(global.SCALES) || !global.SCALES.length) return false;
    global.AppState.scaleIdx = wrap((global.AppState.scaleIdx || 0) + (delta < 0 ? -1 : 1), global.SCALES.length);
    var sel = document.getElementById('scale-select');
    if (sel) sel.value = String(global.AppState.scaleIdx);
    if (typeof global.renderDiatonicBar === 'function') global.renderDiatonicBar();
    if (typeof global.updateScaleKeyDisplay === 'function') global.updateScaleKeyDisplay();
    refresh();
    return true;
  }

  function nudgeChordRoot(delta) {
    if (!global.BuilderState || global.BuilderState.root === null || global.BuilderState.root === undefined) return false;
    var next = wrap(global.BuilderState.root + (delta < 0 ? -1 : 1), 12);
    if (typeof global.selectRoot === 'function') {
      global.selectRoot(next);
    } else {
      global.BuilderState.root = next;
      if (global.BuilderState.bass !== null && global.BuilderState.bass !== undefined) {
        global.BuilderState.bass = wrap(global.BuilderState.bass + (delta < 0 ? -1 : 1), 12);
      }
    }
    refresh();
    return true;
  }

  function cycleInversion(delta) {
    if (!global.AppState || global.AppState.mode !== 'chord' || !global.BuilderState || !global.BuilderState.quality) return false;
    if (typeof global.chordBasicFormActive === 'function' && global.chordBasicFormActive()
        && typeof global.stepBasicFormInversion === 'function') {
      global.stepBasicFormInversion(delta < 0 ? -1 : 1);
      refresh();
      return true;
    }
    if (global.VoicingState && global.VoicingState.shell) return false;
    var pcs = typeof global.getBuilderPCS === 'function' ? global.getBuilderPCS() : (global.BuilderState.quality.pcs || []);
    var maxInv = Math.min(3, Math.max(0, (pcs ? pcs.length : 1) - 1));
    var inv = global.VoicingState ? (global.VoicingState.inversion || 0) : 0;
    inv = delta > 0 ? (inv < maxInv ? inv + 1 : 0) : (inv > 0 ? inv - 1 : maxInv);
    if (typeof global.setInversion === 'function') global.setInversion(inv);
    else if (global.VoicingState) global.VoicingState.inversion = inv;
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
    if (global.TastyState && global.TastyState.enabled && typeof global.cycleTasty === 'function') {
      global.cycleTasty(delta < 0); refresh(); return true;
    }
    if (global.StockState && global.StockState.enabled && typeof global.cycleStock === 'function') {
      global.cycleStock(delta < 0); refresh(); return true;
    }
    if (typeof global.isGuitarEngineActive === 'function' && global.isGuitarEngineActive()) {
      if (alternative && global.GuitarPositionState && Array.isArray(global.GuitarPositionState.groups)
          && global.GuitarPositionState.groups.length > 1 && typeof global.setGuitarEngineGroup === 'function') {
        var gi = global.GuitarPositionState.currentGroupIdx || 0;
        global.setGuitarEngineGroup(wrap(gi + (delta < 0 ? -1 : 1), global.GuitarPositionState.groups.length));
      } else if (typeof global.cycleGuitarEngine === 'function') {
        global.cycleGuitarEngine(delta < 0);
      }
      refresh(); return true;
    }
    if (alternative && typeof global.chordBasicFormActive === 'function' && global.chordBasicFormActive()
        && typeof global.cycleBasicFormPosition === 'function') {
      global.cycleBasicFormPosition(); refresh(); return true;
    }
    if (global.VoicingState && Array.isArray(global.VoicingState.lastBoxes) && global.VoicingState.lastBoxes.length) {
      var idx = global.VoicingState.selectedBoxIdx;
      if (idx === null || idx === undefined) idx = 0;
      if (alternative) {
        var box = global.VoicingState.lastBoxes[idx];
        if (box && Array.isArray(box.alternatives) && box.alternatives.length > 1 && typeof global.selectVoicingBox === 'function') {
          global.selectVoicingBox(idx); refresh(); return true;
        }
      } else {
        var next = wrap(idx + (delta < 0 ? -1 : 1), global.VoicingState.lastBoxes.length);
        if (typeof global.selectVoicingBox === 'function') global.selectVoicingBox(next);
        refresh(); return true;
      }
    }
    return false;
  }

  function qualityList() {
    var out = [];
    if (!Array.isArray(global.BUILDER_QUALITIES)) return out;
    global.BUILDER_QUALITIES.forEach(function(row) { (row || []).forEach(function(q) { if (q) out.push(q); }); });
    return out;
  }

  function beginEntry(step) {
    if (currentMode() !== 'chord') setMode('chord');
    controlState.entryStep = step === 'quality' ? 'quality' : 'root';
    controlState.entryRoot = global.BuilderState && global.BuilderState.root !== null && global.BuilderState.root !== undefined
      ? global.BuilderState.root : (global.AppState ? global.AppState.key : 0);
    var list = qualityList();
    controlState.entryQualityIndex = 0;
    if (global.BuilderState && global.BuilderState.quality) {
      for (var i = 0; i < list.length; i++) if (list[i].name === global.BuilderState.quality.name) controlState.entryQualityIndex = i;
    }
    if (typeof global.setBuilderStep === 'function') global.setBuilderStep(1);
    return true;
  }

  function cycleEntry(delta) {
    if (!controlState.entryStep) return false;
    if (controlState.entryStep === 'root') controlState.entryRoot = wrap((controlState.entryRoot || 0) + (delta < 0 ? -1 : 1), 12);
    else {
      var list = qualityList();
      controlState.entryQualityIndex = wrap(controlState.entryQualityIndex + (delta < 0 ? -1 : 1), Math.max(1, list.length));
    }
    return true;
  }

  function applyEntry(index) {
    if (!controlState.entryStep) return false;
    if (controlState.entryStep === 'root') {
      var root = index === undefined ? controlState.entryRoot : index;
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
    if (global.BuilderState && (global.BuilderState.root === null || global.BuilderState.root === undefined)
        && typeof global.selectRoot === 'function') global.selectRoot(controlState.entryRoot || 0);
    if (typeof global.selectQuality === 'function') global.selectQuality(list[qi]);
    controlState.entryQualityIndex = qi;
    controlState.entryStep = null;
    refresh();
    return true;
  }

  function toggleMajorMinorScale() {
    if (!global.AppState || !Array.isArray(global.SCALES)) return false;
    var current = global.SCALES[global.AppState.scaleIdx] ? String(global.SCALES[global.AppState.scaleIdx].name || '').toLowerCase() : '';
    global.AppState.scaleIdx = (current.indexOf('minor') !== -1 || current.indexOf('aeolian') !== -1) ? 0 : 5;
    var sel = document.getElementById('scale-select'); if (sel) sel.value = String(global.AppState.scaleIdx);
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

  function lowerSwitch(index) {
    var perform = currentMode() === 'input' && global.memoryViewMode === 'perform';
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
      if (global.BuilderState && global.BuilderState.quality && typeof global.setBuilderStep === 'function') {
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
    if (field === 'reset') { if (global.TutorialEngine && typeof global.TutorialEngine.reset === 'function') global.TutorialEngine.reset(); return true; }
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
      if (redo) call('redoMemory'); else call('undoMemory');
    } else if (currentMode() === 'chord' && !redo) call('builderBack');
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

  function handlePad(rawNote, isDown) {
    if (!controlState.deleteHeld && !controlState.duplicateHeld) return false;
    var slot = slotFromRawPad(rawNote);
    if (slot === null) return false;
    if (!isDown) return true;
    if (!global.PlainState || !Array.isArray(global.PlainState.memory)) return true;

    if (controlState.deleteHeld) {
      controlState.deletePadUsed = true;
      if (global.PlainState.memory[slot]) {
        call('pushUndoState');
        global.PlainState.memory[slot] = null;
        call('syncMemoryToActiveBank');
        refresh();
      }
      return true;
    }

    if (controlState.duplicateHeld) {
      if (controlState.duplicateSource === null) {
        if (global.PlainState.memory[slot]) controlState.duplicateSource = slot;
      } else {
        var src = global.PlainState.memory[controlState.duplicateSource];
        if (src) {
          call('pushUndoState');
          global.PlainState.memory[slot] = typeof global.cloneMemorySlot === 'function' ? global.cloneMemorySlot(src) : JSON.parse(JSON.stringify(src));
          call('syncMemoryToActiveBank');
          refresh();
        }
        controlState.duplicateSource = null;
      }
      return true;
    }
    return false;
  }

  function handleLogical(code, value) {
    code |= 0; value |= 0;

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
    if (code === 3) { controlState.entryStep = null; setMode('input'); return true; }
    if (code === 47) { call('togglePerformMode'); refresh(); return true; }

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
      if (currentMode() === 'scale') {
        if (typeof global.doubleStopActive === 'function' && global.doubleStopActive() && typeof global.cycleDoubleStopDegree === 'function') {
          global.cycleDoubleStopDegree(value); refresh(); return true;
        }
        return setScaleIndexDelta(value);
      }
      if (currentMode() === 'chord') {
        if (controlState.tensionMode) return cycleTension(value);
        if (cycleActiveVoicing(value, false)) return true;
        return cycleInversion(value);
      }
      return true;
    }
    if (code === 33) { backCurrent(value < 0); return true; }
    if (code === 34) {
      if (currentMode() === 'scale' && typeof global.cycleDoubleStopPosition === 'function') { global.cycleDoubleStopPosition(); refresh(); return true; }
      return cycleActiveVoicing(1, true) || true;
    }
    if (code === 35) {
      if (currentMode() === 'chord') return nudgeChordRoot(value);
      if (currentMode() === 'scale') return setScaleRootDelta(value);
      return true;
    }
    if (code === 36) { if (currentMode() === 'input' && global.memoryViewMode === 'perform') call('switchBank', value < 0 ? -1 : 1); refresh(); return true; }
    if (code >= 50 && code <= 57) {
      var enc = code - 50;
      if (enc === 1 && global.TastyState && global.TastyState.enabled) { call('cycleTasty', value < 0); refresh(); return true; }
      if (enc === 2 && global.StockState && global.StockState.enabled) { call('cycleStock', value < 0); refresh(); return true; }
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
    if (code === 45) { if (global.TutorialEngine && typeof global.TutorialEngine.showSelector === 'function') global.TutorialEngine.showSelector(); return true; }
    if (code === 71) { toggleHelp(); return true; }
    if (code === 72) { if (global.AppState) call('toggleCFixed', !(global.AppState.padCFixed === true)); refresh(); return true; }
    if (code === 73) return true; // Native plug-in device picker has no browser equivalent.
    if (code === 74) { if (global.AppState) call('toggleShowAllPositions', !(global.AppState.showAllPositions === true)); refresh(); return true; }
    if (code === 75) { if (controlState.deleteHeld) call('deleteBank'); else call('addBank'); refresh(); return true; }
    if (code === 48) { call('saveAppSettings'); call('showSaveToast'); return true; }
    if (code === 46) {
      // Preserve the owner-ruling Push WYSIWYG gesture: in Input/Perform with a held
      // slot/chord, octave moves that slot and saves it instead of transposing the grid.
      if (currentMode() === 'input' && global.memoryViewMode === 'perform'
          && global.PerformState && global.PerformState.activePad !== null
          && global.PlainState && global.PlainState.activeNotes
          && global.PlainState.activeNotes.size > 0) {
        call('performOctaveEdit', value);
        refresh();
        return true;
      }
      call('shiftOctave', value);
      refresh();
      return true;
    }
    if (code === 43) {
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
      padIsHeld: !!meta.padIsHeld,
      padPlaybackBlocked: !!meta.padPlaybackBlocked,
      mpeMode: !!meta.mpeMode,
    }, controlState.cc);
    (result.events || []).forEach(function(e) { handleLogical(e.code, e.value); });
    if (result.handled) {
      try { syncButtonLeds(); } catch (_) {}
    }
    return !!result.handled;
  }

  global.padWebHandlePushControl = handleLogical;
  global.padWebHandlePushMidiCc = handleMidiCc;
  global.padWebPushControlWillHandlePad = handlePad;
  global.padWebPushControlState = controlState;
  global.padWebSyncPushButtonLeds = syncButtonLeds;
  global.padWebResetPushButtonLedState = resetButtonLedState;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      handleLogical: handleLogical,
      slotFromRawPad: slotFromRawPad,
      syncButtonLeds: syncButtonLeds,
      resetButtonLedState: resetButtonLedState,
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
