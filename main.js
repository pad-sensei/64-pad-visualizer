// ========================================
// INITIALIZATION
// ========================================
// Load saved settings BEFORE UI init (so AppState has restored values)
loadAppSettings();
if (!AppState.showBadges) document.body.classList.add('hide-badges');

// TASTY Mode: HPS auth + data loading
TastyState.hpsUnlocked = new URLSearchParams(window.location.search).has('hps');
if (TastyState.hpsUnlocked) {
  fetch('data/tasty-recipes.json').then(function(r) { return r.json(); }).then(function(data) {
    TastyState.recipes = data;
    updateTastyUI();
  }).catch(function() {});
  // Load voicings (129 degree-based recipes for TASTY Voicing Engine)
  fetch('data/tasty-voicings.json').then(function(r) { return r.json(); }).then(function(data) {
    TastyState.voicings = data;
    updateTastyUI();
  }).catch(function() {});
}

// Stock Voicing: same HPS gate
StockState.hpsUnlocked = new URLSearchParams(window.location.search).has('hps');
if (StockState.hpsUnlocked) {
  fetch('data/stock-voicings.json?v=6.5.0').then(function(r) { return r.json(); }).then(function(data) {
    StockState.data = data;
    updateStockUI();
  }).catch(function() {});
}
var _hpsEngineAnchor = document.getElementById('hps-engine-anchor');
if (_hpsEngineAnchor) _hpsEngineAnchor.style.display = (TastyState.hpsUnlocked || StockState.hpsUnlocked) ? 'block' : 'none';

// Launchpad LED: same HPS gate
_lpHpsUnlocked = new URLSearchParams(window.location.search).has('hps');

// Genre Preset: HPS-only UI (Desktop paid version always has ?hps)
(function() {
  var hps = new URLSearchParams(window.location.search).has('hps');
  var sel = document.getElementById('genre-preset-select');
  if (sel && hps) {
    sel.style.display = '';
    if (_presetParam && GENRE_WEIGHTS[_presetParam]) sel.value = _presetParam;
  }
})();

initKeyButtons();
initScaleSelect();
initChordKeyPicker();
initRootGrid();
initQualityGrid();
initTensionGrid();
updateOctaveLabel();
initMemorySlots();
initWebMIDI();
initPlayControls();
initTextChordInput();
I18N.init();

// Pane order (ABC preset switch)
function setPaneOrder(preset) {
  var orders = { A: 0, B: 1, C: 2 };
  for (var i = 0; i < preset.length; i++) {
    orders[preset[i]] = i;
  }
  document.querySelector('[data-pane="A"]').style.order = orders.A;
  document.querySelector('[data-pane="B"]').style.order = orders.B;
  document.querySelector('[data-pane="C"]').style.order = orders.C;
  localStorage.setItem('64pad-pane-order', preset);
  var sel = document.getElementById('pane-order-select');
  if (sel) sel.value = preset;
  syncViewSetupControls();
}

function setPaneView(view) {
  var mode = /^(all|A|B|C)$/.test(view) ? view : 'all';
  var panes = {
    A: document.querySelector('[data-pane="A"]'),
    B: document.querySelector('[data-pane="B"]'),
    C: document.querySelector('[data-pane="C"]')
  };
  var defaultDisplay = { A: '', B: '', C: 'flex' };
  Object.keys(panes).forEach(function(key) {
    if (!panes[key]) return;
    panes[key].style.display = (mode === 'all' || mode === key) ? defaultDisplay[key] : 'none';
  });
  document.body.classList.toggle('pane-view-single', mode !== 'all');
  document.body.dataset.paneView = mode;
  localStorage.setItem('64pad-pane-view', mode);
  var sel = document.getElementById('pane-view-select');
  if (sel) sel.value = mode;
  if (typeof updateInfoBarAlignment === 'function') setTimeout(updateInfoBarAlignment, 0);
  syncViewSetupControls();
}

function syncViewSetupControls() {
  var order = localStorage.getItem('64pad-pane-order') || 'ABC';
  var view = (document.body && document.body.dataset ? document.body.dataset.paneView : '') || localStorage.getItem('64pad-pane-view') || 'all';
  var orderSelects = document.querySelectorAll('[data-view-setup-order]');
  orderSelects.forEach(function(sel) { sel.value = order; });
  var viewSelects = document.querySelectorAll('[data-view-setup-view]');
  viewSelects.forEach(function(sel) { sel.value = view; });
  var colorCodingToggles = document.querySelectorAll('[data-view-setup-color-coding]');
  colorCodingToggles.forEach(function(input) { input.checked = !AppState.colorOff; });
  var cFixedToggles = document.querySelectorAll('[data-view-setup-c-fixed]');
  cFixedToggles.forEach(function(input) { input.checked = AppState.padCFixed === true; });
  var pushVoicingToggles = document.querySelectorAll('[data-view-setup-push-voicing]');
  pushVoicingToggles.forEach(function(input) { input.checked = AppState.pushVoicingOverview === true; });
  var pushColorLabels = document.querySelectorAll('[data-push-color-label]');
  pushColorLabels.forEach(function(el) {
    var role = el.getAttribute('data-push-color-label');
    var value = '';
    if (role === 'root') value = AppState.pushScaleRootColor || 3;
    else if (role === 'scale') value = AppState.pushScaleToneColor || 122;
    else if (role === 'pressed') value = AppState.pushPressedColor || 25;
    else if (role === 'memorySlot') value = AppState.pushMemorySlotColor || 45;
    else if (role === 'performActive') value = AppState.pushPerformActiveColor || 9;
    el.textContent = String(value);
  });
  var tipsToggles = document.querySelectorAll('[data-view-setup-tips]');
  tipsToggles.forEach(function(input) { input.checked = AppState.showTips !== false; });
  var badgeToggles = document.querySelectorAll('[data-view-setup-badges]');
  badgeToggles.forEach(function(input) { input.checked = AppState.showBadges !== false; });
}

function setViewSetupFocusField(field) {
  if (!document.body || !document.body.dataset) return;
  var allowed = {
    focus: true,
    layout: true,
    'c-fixed': true,
    'push-voicing': true,
    'color-root': true,
    'color-scale': true,
    'color-pressed': true,
    'color-memory': true,
    'color-perform': true,
    tips: true,
    badges: true,
    reset: true
  };
  document.body.dataset.viewSetupField = allowed[field] ? field : 'focus';
}

function startViewSetupPushColorPick(role) {
  closeViewSetupPanel();
  if (typeof startPushLedColorPick === 'function') startPushLedColorPick(role, 1);
}

function openViewSetupPanel() {
  syncViewSetupControls();
  setViewSetupFocusField((document.body && document.body.dataset && document.body.dataset.viewSetupField) || 'focus');
  var overlay = document.getElementById('view-setup-overlay');
  if (overlay) overlay.classList.add('active');
}

function closeViewSetupPanel() {
  var overlay = document.getElementById('view-setup-overlay');
  if (overlay) overlay.classList.remove('active');
}

// Restore saved pane order (default: ABC)
(function() {
  var saved = localStorage.getItem('64pad-pane-order');
  if (saved && /^[ABC]{3}$/.test(saved) && saved.indexOf('A') >= 0 && saved.indexOf('B') >= 0 && saved.indexOf('C') >= 0) {
    setPaneOrder(saved);
  }
  setPaneView(localStorage.getItem('64pad-pane-view') || 'all');
})();

// Mobile responsive init
_isMobile = _mobileMediaQuery.matches;
_isLandscape = _landscapeMediaQuery.matches;
if (_isMobile) {
  moveMemorySection(true);
  moveInstrumentRow(true);
} else if (_isLandscape) {
  moveInstrumentRow(true);
  syncPlayControls();
  renderPad32();
}
initScreenDots();
_mobileMediaQuery.addEventListener('change', handleMobileChange);
_landscapeMediaQuery.addEventListener('change', handleLandscapeChange);

// Apply restored display toggles to UI
(function applyRestoredSettings() {
  // Mode buttons & panels
  document.getElementById('mode-scale').classList.toggle('active', AppState.mode === 'scale');
  document.getElementById('mode-chord').classList.toggle('active', AppState.mode === 'chord');
  document.getElementById('mode-input').classList.toggle('active', AppState.mode === 'input');
  document.getElementById('scale-panel').style.display = AppState.mode === 'scale' ? '' : 'none';
  document.getElementById('chord-panel').style.display = AppState.mode === 'chord' ? '' : 'none';
  document.getElementById('input-panel').style.display = AppState.mode === 'input' ? '' : 'none';
  // Key rows: full rows for Scale only, compact row for Chord only
  document.getElementById('key-rows').style.display = AppState.mode === 'scale' ? '' : 'none';
  document.getElementById('key-label').style.display = AppState.mode === 'scale' ? '' : 'none';
  document.getElementById('chord-key-row').style.display = AppState.mode === 'chord' ? '' : 'none';
  if (AppState.mode === 'chord') { updateChordKeyDisplay(); }
  if (AppState.mode === 'chord' && BuilderState.step === 0) {
    BuilderState.root = AppState.key;
    setBuilderStep(1);
  }
  if (AppState.mode === 'input') {
    PlainState.subMode = 'idle';
    updatePlainUI();
    updatePlainDisplay();
  }
  // Scale selector
  const sel = document.getElementById('scale-select');
  if (sel) sel.value = AppState.scaleIdx;
  // Display toggles
  // Enforce exclusive theory view (staff / circle)
  if (showStaff && showCircle) showCircle = false;
  document.getElementById('inst-toggle-guitar').classList.toggle('active', showGuitar);
  document.getElementById('inst-toggle-bass').classList.toggle('active', showBass);
  document.getElementById('inst-toggle-piano').classList.toggle('active', showPiano);
  document.getElementById('inst-toggle-link').classList.toggle('active', linkMode);
  document.getElementById('inst-toggle-staff').classList.toggle('active', showStaff);
  document.getElementById('inst-toggle-circle').classList.toggle('active', showCircle);
  document.getElementById('inst-toggle-sound').classList.toggle('active', showSound);
  document.getElementById('guitar-wrap').style.display = showGuitar ? '' : 'none';
  document.getElementById('bass-wrap').style.display = showBass ? '' : 'none';
  document.getElementById('piano-wrap-display').style.display = showPiano ? '' : 'none';
  document.getElementById('staff-area').style.display = showStaff ? '' : 'none';
  document.getElementById('circle-wrap').style.display = showCircle ? 'flex' : 'none';
  document.getElementById('sound-controls').style.display = showSound ? '' : 'none';
  document.getElementById('guitar-label-btn').style.display = (showGuitar || showBass) ? '' : 'none';
  document.getElementById('guitar-label-btn').textContent = guitarLabelMode === 'name' ? t('label.note_name') : t('label.degree');
  // Memory slots UI
  updateMemorySlotUI();
  // Bank UI (ensure banks initialized even without saved data)
  if (BankState.banks.length === 0) {
    BankState.banks = [{ id: 'default', name: 'Bank 1', memory: Array(16).fill(null) }];
    BankState.activeBankId = 'default';
  }
  updateBankUI();
})();

// ========================================
// VERSION UPDATE NOTIFICATION
// ========================================
// Version notification is now injected into the persistent update-notice banner
// (see banner block below). This keeps it visible until the user dismisses it.
var _versionNoticeShown = false;

function _64peVersionParts(versionText) {
  var m = String(versionText || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [0, 0, 0];
  return [
    parseInt(m[1] || '0', 10) || 0,
    parseInt(m[2] || '0', 10) || 0,
    parseInt(m[3] || '0', 10) || 0
  ];
}

function _64peCompareVersions(a, b) {
  var av = _64peVersionParts(a);
  var bv = _64peVersionParts(b);
  for (var i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

function _64peLocalized(value) {
  if (value && typeof value === 'object') {
    var lang = (typeof I18N !== 'undefined' && I18N.current) || 'ja';
    return value[lang] || value.ja || value.en || '';
  }
  return value || '';
}

function _64peBannerHashStr(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}

function _64peShowUpdateNotice(contentHash, onClose) {
  var banner = document.getElementById('update-notice');
  var closeBtn = document.getElementById('update-notice-close');
  if (!banner) return;
  if (localStorage.getItem('64pad-notice-dismissed') === contentHash) return;
  banner.style.display = '';
  if (closeBtn) {
    closeBtn.onclick = function() {
      banner.style.display = 'none';
      try { localStorage.setItem('64pad-notice-dismissed', contentHash); } catch(_) {}
      if (typeof onClose === 'function') onClose();
    };
  }
}

// ========================================
// STARTUP TIPS (returning users)
// ========================================
function showStartupTip() {
  if (_versionNoticeShown) return; // Version notice takes priority
  if (AppState.showTips === false) return;
  // Don't show for first-time users (onboarding overlay handles them)
  if (!localStorage.getItem('64pad-sound')) return;
  var lang = I18N.current || 'en';
  var tips = (I18N.langs[lang] && I18N.langs[lang].tips) || (I18N.langs['en'] && I18N.langs['en'].tips);
  if (!tips || !tips.length) return;
  var idx = Math.floor(Math.random() * tips.length);
  var offLabel = t('tips_off') || "Don't show";
  var el = document.createElement('div');
  el.id = 'startup-tip';
  el.innerHTML = '<span class="tip-text">\uD83D\uDCA1 ' + tips[idx] + '</span>' +
    '<span class="tip-keys"><kbd>Space</kbd></span>' +
    '<button class="tip-off-btn" onclick="disableStartupTips()">' + offLabel + '</button>';
  var grid = document.getElementById('pad-grid');
  if (grid) grid.parentNode.insertBefore(el, grid);
  setTimeout(dismissStartupTip, 8000);
}
function dismissStartupTip() {
  var el = document.getElementById('startup-tip');
  if (!el) return;
  el.classList.add('tip-fade');
  setTimeout(function() { if (el.parentNode) el.remove(); }, 300);
}
function disableStartupTips() {
  AppState.showTips = false;
  saveAppSettings();
  dismissStartupTip();
}
function toggleStartupTips(on) {
  AppState.showTips = on;
  saveAppSettings();
  var toggles = document.querySelectorAll('[data-view-setup-tips]');
  toggles.forEach(function(input) { input.checked = AppState.showTips !== false; });
}

// C-fixed mode: lock pad to C Major scale (urinami Pad OS philosophy, 2026-04-14)
function toggleCFixed(on) {
  AppState.padCFixed = on === true;
  saveAppSettings();
  var toggles = document.querySelectorAll('[data-view-setup-c-fixed]');
  toggles.forEach(function(input) { input.checked = AppState.padCFixed === true; });
  if (typeof render === 'function') render();
  if (typeof refreshLaunchpadLEDs === 'function') refreshLaunchpadLEDs();
  if (typeof window !== 'undefined' && typeof window._pushNotifyCFixedChanged === 'function') {
    window._pushNotifyCFixedChanged();
  }
}

function togglePushVoicingOverview(on) {
  AppState.pushVoicingOverview = on === true;
  saveAppSettings();
  var toggles = document.querySelectorAll('[data-view-setup-push-voicing]');
  toggles.forEach(function(input) { input.checked = AppState.pushVoicingOverview === true; });
  if (typeof refreshLaunchpadLEDs === 'function') refreshLaunchpadLEDs();
}

showStartupTip();

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener('keydown', (e) => {
  // Ignore when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  const key = e.key;
  const lk = key.toLowerCase(); // for letter key matching (case-insensitive)

  // /: Focus text chord input (Chord mode)
  if (key === '/' && AppState.mode === 'chord') {
    e.preventDefault();
    var tchInput = document.getElementById('text-chord-input');
    if (tchInput) { tchInput.focus(); tchInput.select(); }
    return;
  }

  // [ / ]: Bank switch (全モード共通)
  if (key === '[') { switchBank(-1); return; }
  if (key === ']') { switchBank(1); return; }

  // , / .: Guitar position cycle (Chord mode)
  if (key === ',' && GuitarPositionState.enabled) { cycleGuitarPosition(-1); return; }
  if (key === '.' && GuitarPositionState.enabled) { cycleGuitarPosition(1); return; }

  // < / >: Bass position cycle (Chord mode)
  if (key === '<' && BassPositionState.enabled) { cycleBassPosition(-1); return; }
  if (key === '>' && BassPositionState.enabled) { cycleBassPosition(1); return; }

  // Shift+C: Capture current chord/voicing to selected slot, or next empty slot.
  // Keep this before Perform key handling so Shift+C never triggers slot C.
  if (e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyC') {
    e.preventDefault();
    if (typeof captureCurrentToMemorySlot === 'function') captureCurrentToMemorySlot();
    return;
  }

  // Option+Perform keys: Save to slot using Perform layout (全16スロット, 全モード共通)
  // Must use e.code because Option+key produces special chars on Mac (e.g. Option+Q = œ)
  if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code) {
    let physKey = null;
    if (e.code.startsWith('Digit')) physKey = e.code.charAt(5); // Digit1→1
    else if (e.code.startsWith('Key')) physKey = e.code.charAt(3).toLowerCase(); // KeyQ→q
    if (physKey && typeof PERFORM_KEY_MAP !== 'undefined') {
      const slotIdx = PERFORM_KEY_MAP[physKey];
      if (slotIdx !== undefined) {
        e.preventDefault();
        saveToPlainSlot(slotIdx);
        return;
      }
    }
  }


  // Cmd+Option (Mac) / Ctrl+Alt (Win): Display toggle shortcuts (Ableton-style)
  // Uses e.code because Option+key produces special chars on Mac
  if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code) {
    var cmdOptCode = e.code;
    // Instruments
    if (cmdOptCode === 'KeyG') { e.preventDefault(); toggleInstrument('guitar'); return; }
    if (cmdOptCode === 'KeyB') { e.preventDefault(); toggleInstrument('bass'); return; }
    if (cmdOptCode === 'KeyP') { e.preventDefault(); toggleInstrument('piano'); return; }
    // Right panel
    if (cmdOptCode === 'KeyF') { e.preventDefault(); toggleTheoryView('circle'); return; }
    if (cmdOptCode === 'KeyS') { e.preventDefault(); toggleTheoryView('staff'); return; }
    if (cmdOptCode === 'KeyA') { e.preventDefault(); toggleInstrument('sound'); return; }
    if (cmdOptCode === 'KeyM') { e.preventDefault(); toggleSection('memory'); return; }
    // Control panel sections
    if (cmdOptCode === 'KeyT') { e.preventDefault(); toggleSection('input'); return; }
    if (cmdOptCode === 'KeyQ') { e.preventDefault(); toggleSection('quality'); return; }
    if (cmdOptCode === 'KeyV') { e.preventDefault(); toggleSection('voicing'); return; }
    if (cmdOptCode === 'KeyL') { e.preventDefault(); toggleLinkMode(); return; }
    if (cmdOptCode === 'KeyK') { e.preventDefault(); toggleKeyDisplay(); return; }
    if (cmdOptCode === 'KeyH') { e.preventDefault(); toggleHeader(); return; }
    // Shortcut key indicators
    if (cmdOptCode === 'KeyI') { e.preventDefault(); toggleBadges(); return; }
    // Diatonic extensions
    if (cmdOptCode === 'KeyN') { e.preventDefault(); toggleMinorVariants(); return; }
    if (cmdOptCode === 'KeyD') { e.preventDefault(); toggleSecDom(); return; }
    if (cmdOptCode === 'KeyR') { e.preventDefault(); toggleParallelKey(); return; }
    if (cmdOptCode === 'KeyF') { e.preventDefault(); toggleHarmonicFn(); return; }
  }

  // Shift+D: Cycle Drop (voicing operation, not display toggle)
  if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
    if (lk === 'd') {
      if (AppState.mode === 'chord' && BuilderState.quality) {
        if (!VoicingState.drop) setDrop('drop2');
        else if (VoicingState.drop === 'drop2') setDrop('drop3');
        else setDrop(null);
      }
      return;
    }
  }

  // Tab / Shift+Tab: Mode cycle (Scale → Chord → Input → Scale)
  if (key === 'Tab') {
    e.preventDefault();
    const modes = ['scale', 'chord', 'input'];
    const cur = modes.indexOf(AppState.mode);
    const next = e.shiftKey ? (cur - 1 + 3) % 3 : (cur + 1) % 3;
    document.getElementById('mode-' + modes[next]).click();
    return;
  }

  // Backspace: Back (chord builder)
  if (key === 'Backspace') {
    if (AppState.mode === 'chord') {
      builderBack();
    }
    return;
  }

  // Perform view: keyboard pad triggering (highest priority for letter/number keys)
  if (memoryViewMode === 'perform') {
    if (handlePerformKey(lk)) {
      e.preventDefault();
      ensureAudioResumed();
      return;
    }
  }

  // c: Plain capture (input mode only)
  if (lk === 'c' && AppState.mode === 'input') {
    plainCapture(); return;
  }

  // Escape: Close help modal → exit Plain edit → deselect slot → deselect voicing box
  if (key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    const helpOverlay = document.getElementById('help-overlay');
    if (helpOverlay.classList.contains('active')) {
      helpOverlay.classList.remove('active');
    } else if (memoryViewMode === 'perform' && PerformState.activePad !== null) {
      clearPerform();
    } else if (AppState.mode === 'input' && (PlainState.subMode === 'edit' || PlainState.subMode === 'capture')) {
      PlainState.subMode = 'idle';
      PlainState.activeNotes.forEach(m => noteOff(m));
      PlainState.activeNotes.clear();
      PlainState.currentSlot = null;
      updatePlainUI(); updatePlainDisplay(); updateMemorySlotUI(); render();
    } else if (PlainState.currentSlot !== null) {
      PlainState.currentSlot = null;
      updateMemorySlotUI();
    } else if (TastyState.enabled && VoicingState.selectedBoxIdx !== null) {
      // TASTY ON + box selected: deselect box only, keep TASTY
      VoicingState.selectedBoxIdx = null;
      render();
    } else if (StockState.enabled) {
      disableStock();
    } else if (TastyState.enabled) {
      disableTasty();
    } else if (VoicingState.selectedBoxIdx !== null) {
      VoicingState.selectedBoxIdx = null;
      render();
    }
    return;
  }

  // Cmd+Z / Ctrl+Z: Undo memory slots
  if (lk === 'z' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    undoMemory();
    return;
  }

  // Shift+Space: Play All (memory slots sequential)
  if (key === ' ' && e.shiftKey) {
    e.preventDefault();
    ensureAudioResumed();
    playMemorySlots();
    return;
  }

  // Space: Dismiss startup tip if visible, otherwise play current chord
  if (key === ' ') {
    var tipEl = document.getElementById('startup-tip');
    if (tipEl) { e.preventDefault(); dismissStartupTip(); return; }
    e.preventDefault();
    ensureAudioResumed();
    const notes = typeof getCurrentChordPlaybackMidiNotes === 'function'
      ? getCurrentChordPlaybackMidiNotes()
      : getCurrentChordMidiNotes();
    if (notes && notes.length > 0) playMidiNotes(notes, 1.0);
    return;
  }

  // ?: Toggle help modal
  if (key === '?') {
    const helpOverlay = document.getElementById('help-overlay');
    helpOverlay.classList.toggle('active');
    return;
  }

  // m: Toggle Memory view (Memory ↔ previous)
  if (lk === 'm') {
    toggleMemoryView(memoryViewMode === 'memory' ? 'perform' : 'memory');
    return;
  }

  // p: Toggle Perform view (Perform ↔ previous)
  if (lk === 'p') {
    toggleMemoryView(memoryViewMode === 'perform' ? 'memory' : 'perform');
    return;
  }

  // Arrow Up/Down: Inversion (Plain: move lowest/highest note ±1oct, Chord: cycle inversion)
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (AppState.mode === 'input' && PlainState.activeNotes.size >= 2) {
      e.preventDefault();
      const notes = [...PlainState.activeNotes].sort((a, b) => a - b);
      PlainState.activeNotes.clear();
      if (key === 'ArrowUp') {
        const lowest = notes.shift();
        notes.push(lowest + 12);
      } else {
        const highest = notes.pop();
        notes.unshift(highest - 12);
      }
      notes.forEach(n => PlainState.activeNotes.add(n));
      updatePlainDisplay(); render();
    } else if (AppState.mode === 'chord' && BuilderState.quality && !VoicingState.shell) {
      e.preventDefault();
      const maxInv = Math.min(3, (getBuilderPCS()?.length || 4) - 1);
      let inv = VoicingState.inversion;
      if (key === 'ArrowUp') { inv = inv < maxInv ? inv + 1 : 0; }
      else { inv = inv > 0 ? inv - 1 : maxInv; }
      setInversion(inv);
    }
    return;
  }

  // Arrow Left/Right: Chromatic transpose (Plain: all notes ±1, Chord: root ±1)
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    if (AppState.mode === 'input' && PlainState.activeNotes.size > 0) {
      e.preventDefault();
      const delta = key === 'ArrowRight' ? 1 : -1;
      const newNotes = new Set();
      PlainState.activeNotes.forEach(n => newNotes.add(n + delta));
      PlainState.activeNotes = newNotes;
      updatePlainDisplay(); render();
    } else if (AppState.mode === 'chord' && BuilderState.root !== null) {
      e.preventDefault();
      const delta = key === 'ArrowRight' ? 1 : 11;
      BuilderState.root = (BuilderState.root + delta) % 12;
      updateKeyButtons();
      var midiDelta = key === 'ArrowRight' ? 1 : -1;
      if (TastyState.enabled) {
        refreshTastyVoicing(midiDelta);
      } else if (StockState.enabled) {
        refreshStockVoicing(midiDelta);
      } else if (VoicingState.selectedBoxIdx !== null) {
        VoicingState._preservePosition = { type: 'transpose', midiDelta: key === 'ArrowRight' ? 1 : -1 };
      }
      updateChordDisplay(); render();
    }
    return;
  }

  // Plain mode shortcuts
  if (AppState.mode === 'input') {
    if (lk === 'e') { plainEnd(); return; }
    if (lk === 'x') { clearPlainNotes(); return; }
    // Number keys 1-9, 0: recall/edit slot (1-9→slot 0-8, 0→slot 9)
    if (key >= '0' && key <= '9' && e.location !== 3) {
      const idx = key === '0' ? 9 : parseInt(key) - 1;
      if (idx < 16) recallPlainSlot(idx);
      return;
    }
    return;
  }



  // Number keys 1-7: Select diatonic chord (Scale/Chord mode)
  if (key >= '1' && key <= '7' && e.location !== 3) {
    const num = parseInt(key);
    const scale = SCALES[AppState.scaleIdx];
    if (scale.pcs.length === 7) {
      const noteCount = AppState.diatonicMode === 'triad' ? 3 : 4;
      const tetrads = getDiatonicTetrads(scale.pcs, AppState.key, noteCount);
      if (num - 1 < tetrads.length) {
        onDiatonicClick(tetrads[num - 1]);
      }
    }
    return;
  }

  // t: TASTY mode toggle (ON/OFF only)
  if (lk === 't') {
    if (AppState.mode === 'chord' && TastyState.hpsUnlocked) {
      toggleTasty();
    }
    return;
  }

  // k: STOCK voicing toggle (ON/OFF only)
  if (lk === 'k') {
    if (AppState.mode === 'chord' && StockState.hpsUnlocked) {
      toggleStock();
    }
    return;
  }

  // z/x: active builder voicing engine prev/next (TASTY/STOCK/Guitar)
  if (lk === 'z' || lk === 'x') {
    if (AppState.mode === 'chord') {
      var reverse = lk === 'z';
      if (TastyState.enabled || StockState.enabled ||
          (typeof isGuitarEngineActive === 'function' && isGuitarEngineActive())) {
        cycleActiveVoicing(reverse);
        return;
      }
    }
  }

  // Letter keys A-I: Select voicing box (case-insensitive, single char only)
  if (lk.length === 1 && lk >= 'a' && lk <= 'i') {
    const idx = lk.charCodeAt(0) - 97; // a=0, b=1, ...
    if (idx < VoicingState.lastBoxes.length) {
      selectVoicingBox(idx);
    }
    return;
  }

  // v: Toggle Guitar builder engine (guitar voicing → pad layout)
  if (lk === 'v') {
    if (AppState.mode === 'chord' && !TastyState.enabled && !StockState.enabled && typeof toggleVoicingReflect === 'function') {
      toggleVoicingReflect();
    }
    return;
  }

  // o: Toggle Omit 5
  if (lk === 'o') {
    if (AppState.mode === 'chord' && BuilderState.quality) {
      toggleOmit5();
    }
    return;
  }

  // x: Clear (chord or plain)
  if (lk === 'x') {
    if (AppState.mode === 'input') {
      clearPlainNotes();
    } else if (AppState.mode === 'chord') {
      builderClear();
    }
    return;
  }

  // r: Toggle Rootless
  if (lk === 'r') {
    if (AppState.mode === 'chord' && BuilderState.quality) {
      toggleRootless();
    }
    return;
  }

  // s: Cycle Shell (off → 1-3-7 → 1-7-3 → off)
  if (lk === 's') {
    if (AppState.mode === 'chord' && BuilderState.quality) {
      if (!VoicingState.shell) setShell('137');
      else if (VoicingState.shell === '137') setShell('173');
      else setShell(null);
    }
    return;
  }

  // d: Drop cycle moved to Shift+D (above A-I handler)

});

// Option key hold: show save key labels on slots
document.addEventListener('keydown', (e) => {
  if (e.key === 'Alt') {
    document.getElementById('memory-slots')?.classList.add('opt-held');
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') {
    document.getElementById('memory-slots')?.classList.remove('opt-held');
  }
});
window.addEventListener('blur', () => {
  document.getElementById('memory-slots')?.classList.remove('opt-held');
});

// Toggle Key display (Cmd+Opt+K)
function toggleKeyDisplay() {
  var keyRows = document.getElementById('key-rows');
  var keyLabel = document.getElementById('key-label');
  var chordKeyRow = document.getElementById('chord-key-row');
  var visible = keyRows && keyRows.style.display !== 'none';
  if (keyRows) keyRows.style.display = visible ? 'none' : '';
  if (keyLabel) keyLabel.style.display = visible ? 'none' : '';
  if (chordKeyRow) chordKeyRow.style.display = visible ? 'none' : '';
}

render();

function _sectionElementFor(name) {
  return document.getElementById('section-' + name) || (name === 'key' ? document.getElementById('chord-key-row') : null);
}

function _isSectionEnabled(name) {
  try {
    var s = JSON.parse(localStorage.getItem('64pad-sections') || '{}');
    return s[name] !== false;
  } catch(_) {
    return true;
  }
}

function _setSectionStored(name, visible) {
  try {
    var s = JSON.parse(localStorage.getItem('64pad-sections') || '{}');
    s[name] = !!visible;
    localStorage.setItem('64pad-sections', JSON.stringify(s));
  } catch(_) {}
}

function setSectionVisible(name, visible, shouldPersist) {
  var section = _sectionElementFor(name);
  var btn = document.getElementById('sect-' + name);
  if (!section) return;

  if (name === 'key') {
    var showInChord = !!visible && typeof AppState !== 'undefined' && AppState.mode === 'chord';
    section.style.display = showInChord ? '' : 'none';
    if (btn) btn.classList.toggle('active', !!visible);
    if (shouldPersist !== false) _setSectionStored(name, visible);
    if (typeof renderDiatonicBar === 'function') renderDiatonicBar();
    if (typeof renderParentScales === 'function') renderParentScales();
    return;
  }

  section.style.display = visible ? '' : 'none';
  if (btn) btn.classList.toggle('active', !!visible);

  // Quality toggles Root together
  if (name === 'quality') {
    var rootSect = document.getElementById('section-root');
    if (rootSect) rootSect.style.display = visible ? '' : 'none';
  }

  if (shouldPersist !== false) _setSectionStored(name, visible);
}

// Section toggle (Chord panel collapsible sections)
function toggleSection(name) {
  var section = document.getElementById('section-' + name) || (name === 'key' ? document.getElementById('chord-key-row') : null);
  if (!section) return;
  var visible = name === 'key' ? _isSectionEnabled('key') : section.style.display !== 'none';
  setSectionVisible(name, !visible);
}
// Restore section states
(function() {
  try {
    var s = JSON.parse(localStorage.getItem('64pad-sections') || '{}');
    ['key', 'input', 'quality', 'voicing', 'memory'].forEach(function(name) {
      if (s[name] === false) {
        setSectionVisible(name, false, false);
      }
    });
  } catch(_) {}
})();

// Update notification: glow tutorial button after SW update
(function() {
  try {
    if (localStorage.getItem('64pad-just-updated') === '1') {
      localStorage.removeItem('64pad-just-updated');
      var btn = document.getElementById('tut-btn');
      if (btn) {
        btn.style.animation = 'hint-pulse 1.5s ease-in-out 3';
        btn.style.color = 'var(--accent)';
        setTimeout(function() { btn.style.animation = ''; btn.style.color = ''; }, 5000);
      }
    }
  } catch(_) {}
})();

// Update notice banner: blog/HPS updates + version release notes (prepended on version change)
(function() {
  try {
    var banner = document.getElementById('update-notice');
    var bannerText = document.getElementById('update-notice-text');
    if (!banner || !bannerText) return;
    var ver = document.querySelector('.version-tag');
    var currentVer = ver ? ver.textContent.trim() : '';  // "V4.9.99"
    var currentVerPlain = currentVer.replace(/^V/, '');

    // Prepend version release notes. Shown once per version: if the user hasn't
    // dismissed the notice for this specific version, show it — including users who
    // visited before a whats_new_<digits> entry was added for that version.
    // i18n key: 'whats_new_' + digits. Web V6.1 → whats_new_61. Desktop v1.2.3 → whats_new_123.
    // (Desktop overrides version-tag to "Desktop v1.2.3"; non-digit chars are stripped here)
    // Add a whats_new_<digits> entry in lang-*.js whenever a release is worth announcing.
    var verDigits = currentVer.replace(/[^0-9]/g, '');
    var relKey = 'whats_new_' + verDigits;
    var relMsg = (typeof t === 'function' ? t(relKey) : '');
    if (relMsg === relKey) relMsg = ''; // no entry for this version → skip notice
    var noticeSeenKey = '64pad-notice-seen-' + verDigits;
    if (relMsg && !localStorage.getItem(noticeSeenKey)) {
      var whatsNew = (typeof t === 'function' ? t('whats_new') : '') || "What's New";
      var releaseHtml = '\u2728 <b>' + whatsNew + ' (' + currentVer + ')</b> ' + relMsg + '&nbsp;&nbsp;';
      bannerText.innerHTML = releaseHtml + bannerText.innerHTML;
      _versionNoticeShown = true;
    }

    var msg = bannerText.textContent.trim();
    if (!msg) return;
    // Content hash で dismiss 管理 (RSS 更新で content 変われば自動再表示、Pad Sensei Keys と同じパターン、2026-05-11 修正)
    var contentHash = _64peBannerHashStr(msg);
    _64peShowUpdateNotice(contentHash, function() {
      // Record that this version's release notice has been seen
      if (_versionNoticeShown) localStorage.setItem(noticeSeenKey, '1');
    });
  } catch(_) {}
})();

// Remote Desktop update notice. The app loads a tiny JS manifest from the blog:
//   window.__64PE_UPDATE__ = {
//     enabled: true,
//     latestDesktopVersion: "1.5.1",
//     title: { ja: "64Pad Explorer Desktop v1.5.1", en: "64Pad Explorer Desktop v1.5.1" },
//     message: { ja: "更新版があります。", en: "A desktop update is available." },
//     url: "https://padsensei.gumroad.com/l/bklonh",
//     cta: { ja: "Gumroadでダウンロード", en: "Download on Gumroad" }
//   };
(function() {
  try {
    var currentText = (document.querySelector('.version-tag') || {}).textContent || '';
    var isDesktop = /^Desktop\b/i.test(currentText) || !!window._desktopVersion;
    if (!isDesktop) return;

    window.__64PE_UPDATE__ = null;
    var script = document.createElement('script');
    script.src = 'https://murinaikurashi.com/apps/64-pad/64-pad-explorer-update.js?v=' + Date.now();
    script.async = true;
    script.onload = function() {
      try {
        var data = window.__64PE_UPDATE__ || {};
        if (data.enabled === false) return;
        var latest = data.latestDesktopVersion || data.latestVersion || '';
        var current = window._desktopVersion || currentText;
        if (!latest || _64peCompareVersions(current, latest) >= 0) return;

        var title = _64peLocalized(data.title) || ('64Pad Explorer Desktop v' + latest);
        var message = _64peLocalized(data.message) || '';
        var url = data.url || 'https://padsensei.gumroad.com/l/bklonh';
        var cta = _64peLocalized(data.cta) || 'Gumroad';
        var html = '\uD83D\uDCE6 <b>' + title + '</b> ' + message +
          ' <a href="' + url + '" target="_blank" rel="noopener">' + cta + '</a>&nbsp;&nbsp;';

        var bannerText = document.getElementById('update-notice-text');
        if (!bannerText) return;
        var hash = _64peBannerHashStr('desktop-update:' + latest + ':' + message + ':' + url);
        if (localStorage.getItem('64pad-notice-dismissed') === hash) return;
        bannerText.innerHTML = html + bannerText.innerHTML;
        _versionNoticeShown = true;
        _64peShowUpdateNotice(hash);
      } catch(_) {}
    };
    document.head.appendChild(script);
  } catch(_) {}
})();

// ========================================
// HEADER TOGGLE (⌘⌥H)
// ========================================
function toggleHeader() {
  var row = document.querySelector('.header-row');
  if (!row) return;
  var visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : '';
  try { localStorage.setItem('64pad-header-hidden', visible ? '1' : ''); } catch(_) {}
}
// Restore header state
(function() {
  try {
    if (localStorage.getItem('64pad-header-hidden') === '1') toggleHeader();
  } catch(_) {}
})();

// ========================================
// INFO BAR (hover info — aligned to right panel)
// ========================================
(function() {
  var bar = document.getElementById('info-bar');
  if (!bar) return;
  var defaultKey = 'info.default';

  function setInfo(key) {
    var text = t(key);
    bar.textContent = (text !== key) ? text : '';
  }

  // Align info bar to match right panel (staff-ep-panel) exactly
  function alignInfoBar() {
    var panel = document.getElementById('staff-ep-panel');
    var row = document.querySelector('.header-row');
    if (!panel || !row) return;
    var panelStyle = window.getComputedStyle(panel);
    if (panelStyle.display === 'none' || panel.offsetParent === null) {
      bar.style.display = 'none';
      return;
    }
    var panelRect = panel.getBoundingClientRect();
    var rowRect = row.getBoundingClientRect();
    if (panelRect.width < 80 || panelRect.right <= panelRect.left) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    bar.style.left = (panelRect.left - rowRect.left) + 'px';
    bar.style.right = (rowRect.right - panelRect.right) + 'px';
  }
  window.addEventListener('resize', alignInfoBar);
  // Run after fonts/layout settle, and periodically for pane changes
  requestAnimationFrame(function() { requestAnimationFrame(alignInfoBar); });
  setInterval(alignInfoBar, 2000);

  setInfo(defaultKey);

  document.addEventListener('mouseenter', function(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-info]');
    if (el) setInfo(el.getAttribute('data-info'));
  }, true);

  document.addEventListener('mouseleave', function(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-info]');
    if (el) setInfo(defaultKey);
  }, true);
})();
