from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} anchor missing')
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# Web Push button LED feedback: mirror the established Desktop state vocabulary,
# but keep every ordinary LED write on the operational Live Port only.
# -----------------------------------------------------------------------------
p = Path('push-web-control.js')
s = p.read_text()

s = replace_once(s,
"""    setupActive: false,
    setupField: 0,
    lastRawByKey: Object.create(null),
""",
"""    setupActive: false,
    setupField: 0,
    lastRawByKey: Object.create(null),
    buttonLedState: Object.create(null),
""",
'button LED state')

s = replace_once(s,
"""  function call(name) {
    var fn = global[name];
    if (typeof fn !== 'function') return undefined;
    return fn.apply(global, Array.prototype.slice.call(arguments, 1));
  }

  function refresh() {
""",
"""  function call(name) {
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
""",
'button LED helpers')

s = replace_once(s,
"""    try { if (typeof global.refreshLaunchpadLEDs === 'function') global.refreshLaunchpadLEDs(); } catch (_) {}
  }
""",
"""    try { if (typeof global.refreshLaunchpadLEDs === 'function') global.refreshLaunchpadLEDs(); } catch (_) {}
    try { syncButtonLeds(); } catch (_) {}
  }
""",
'refresh LED sync')

s = replace_once(s,
"""    (result.events || []).forEach(function(e) { handleLogical(e.code, e.value); });
    return !!result.handled;
  }

  global.padWebHandlePushControl = handleLogical;
""",
"""    (result.events || []).forEach(function(e) { handleLogical(e.code, e.value); });
    if (result.handled) {
      try { syncButtonLeds(); } catch (_) {}
    }
    return !!result.handled;
  }

  global.padWebHandlePushControl = handleLogical;
""",
'CC LED sync')

s = replace_once(s,
"""  global.padWebPushControlWillHandlePad = handlePad;
  global.padWebPushControlState = controlState;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { handleLogical: handleLogical, slotFromRawPad: slotFromRawPad };
  }
""",
"""  global.padWebPushControlWillHandlePad = handlePad;
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
""",
'button LED exports')
p.write_text(s)


p = Path('midi.js')
s = p.read_text()
s = replace_once(s,
"""function padWebSendPushLedMessage(message) {
  var outputs = _pushLedOutputs.length ? _pushLedOutputs : [midiOutput];
  padWebUniquePushOutputs(outputs).forEach(function(output) {
    try { output.send(message); } catch (_) {}
  });
}

function padWebHardClearPushOutputs(outputs) {
""",
"""function padWebSendPushLedMessage(message) {
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
""",
'button LED transport')

s = replace_once(s,
"""        if (_lpOutputActive) {
          ledSel = document.getElementById('led-mode');
          if (ledSel) {
""",
"""        if (_lpOutputActive) {
          ledSel = document.getElementById('led-mode');
          if (ledSel) {
""",
'LED active anchor')

s = replace_once(s,
"""          render();
        }
      }

      indicator.style.background = connected ? '#4caf50' : '#ff9800';
""",
"""          render();
          if (_isPush && typeof window !== 'undefined') {
            try { if (typeof window.padWebResetPushButtonLedState === 'function') window.padWebResetPushButtonLedState(); } catch (_) {}
            try { if (typeof window.padWebSyncPushButtonLeds === 'function') window.padWebSyncPushButtonLeds(); } catch (_) {}
          }
        }
      }

      indicator.style.background = connected ? '#4caf50' : '#ff9800';
""",
'initial button LED sync')

s = replace_once(s,
"""    try { if (typeof render === 'function') render(); } catch (_) {}
  }
}
""",
"""    try { if (typeof render === 'function') render(); } catch (_) {}
    try { if (typeof window !== 'undefined' && typeof window.padWebResetPushButtonLedState === 'function') window.padWebResetPushButtonLedState(); } catch (_) {}
    try { if (typeof window !== 'undefined' && typeof window.padWebSyncPushButtonLeds === 'function') window.padWebSyncPushButtonLeds(); } catch (_) {}
  }
}
""",
'resume button LED sync')
p.write_text(s)


# -----------------------------------------------------------------------------
# Behavioral / routing tests.
# -----------------------------------------------------------------------------
p = Path('tests/unit/push-midi-output-routing.test.js')
s = p.read_text()
s = replace_once(s,
"""  it('clears stale firmware-owned state only on operational outputs', () => {
    expect(source).toContain('padWebHardClearPushOutputs(_pushLedOutputs);');
    expect(source).toContain('output.send([0x80 | channel, serialNote, 0])');
    expect(source).toContain('output.send([0xb0, cc, 0])');
  });
});
""",
"""  it('clears stale firmware-owned state only on operational outputs', () => {
    expect(source).toContain('padWebHardClearPushOutputs(_pushLedOutputs);');
    expect(source).toContain('output.send([0x80 | channel, serialNote, 0])');
    expect(source).toContain('output.send([0xb0, cc, 0])');
  });

  it('routes Push button feedback and blink protocol through the same Live-only transport', () => {
    expect(source).toContain('function padWebSendPushButtonLed(cc, state, colorPaletteLed)');
    expect(source).toContain('padWebSendPushLedMessage([0xb0, cc, value])');
    expect(source).toContain('padWebSendPushLedMessage([0xb9, cc, 127])');
    expect(source).toContain('window.padWebSyncPushButtonLeds');
    expect(source).not.toContain('_pushSetupOutputs.forEach(function(output) { output.send([0xb0');
  });
});
""",
'button LED routing test')
p.write_text(s)

p = Path('tests/unit/push-web-control.test.js')
s = p.read_text()
s = s.replace(
"const { handleLogical } = require('../../push-web-control.js');",
"const { handleLogical, syncButtonLeds, resetButtonLedState } = require('../../push-web-control.js');")
s = s.replace(
"""  'updateMemorySlotUI', 'updateBankUI', 'saveAppSettings', 'refreshLaunchpadLEDs',
];
""",
"""  'updateMemorySlotUI', 'updateBankUI', 'saveAppSettings', 'refreshLaunchpadLEDs',
  'padWebSendPushButtonLed', 'TastyState', 'StockState', 'SCALES', 'BankState',
  'memoryViewMode', 'localStorage', 'BuilderState', '__pushLedColorPickRole',
];
""")
s = replace_once(s,
"""  it('falls back to global octave shift when Perform WYSIWYG preconditions are absent', () => {
    const calls = [];
    globalThis.AppState = { mode: 'input' };
    globalThis.memoryViewMode = 'perform';
    globalThis.PerformState = { activePad: null };
    globalThis.PlainState = { activeNotes: new Set() };
    globalThis.performOctaveEdit = value => calls.push(['perform', value]);
    globalThis.shiftOctave = value => calls.push(['global', value]);

    expect(handleLogical(46, -1)).toBe(true);
    expect(calls).toEqual([['global', -1]]);
  });
});
""",
"""  it('falls back to global octave shift when Perform WYSIWYG preconditions are absent', () => {
    const calls = [];
    globalThis.AppState = { mode: 'input' };
    globalThis.memoryViewMode = 'perform';
    globalThis.PerformState = { activePad: null };
    globalThis.PlainState = { activeNotes: new Set() };
    globalThis.performOctaveEdit = value => calls.push(['perform', value]);
    globalThis.shiftOctave = value => calls.push(['global', value]);

    expect(handleLogical(46, -1)).toBe(true);
    expect(calls).toEqual([['global', -1]]);
  });

  it('mirrors active/inactive Push button state with Desktop LED semantics', () => {
    const calls = [];
    globalThis.AppState = { mode: 'scale', scaleIdx: 0, padCFixed: false };
    globalThis.SCALES = [{ name: 'Major' }];
    globalThis.TastyState = { enabled: true };
    globalThis.StockState = { enabled: false };
    globalThis.localStorage = { getItem: () => '{}' };
    globalThis.padWebSendPushButtonLed = (cc, state, palette) => calls.push([cc, state, palette]);

    resetButtonLedState();
    syncButtonLeds();

    expect(calls).toContainEqual([103, 'weak', true]);       // active upper TASTY
    expect(calls).toContainEqual([104, 'white-weak', true]); // assigned STOCK, inactive
    expect(calls).toContainEqual([58, 'strong', false]);     // Scale mode button active
    expect(calls).toContainEqual([86, 'weak', true]);        // Record assigned, not Input
  });

  it('lights Input/Perform navigation and C-fixed state from screen truth', () => {
    const calls = [];
    globalThis.AppState = { mode: 'input', scaleIdx: 0, padCFixed: true };
    globalThis.SCALES = [{ name: 'Major' }];
    globalThis.memoryViewMode = 'perform';
    globalThis.BankState = { banks: [{}, {}] };
    globalThis.localStorage = { getItem: () => '{}' };
    globalThis.padWebSendPushButtonLed = (cc, state, palette) => calls.push([cc, state, palette]);

    resetButtonLedState();
    syncButtonLeds();

    expect(calls).toContainEqual([31, 'strong', false]); // Layout/Input
    expect(calls).toContainEqual([62, 'weak', true]);    // Page left available
    expect(calls).toContainEqual([63, 'weak', true]);    // Page right available
    expect(calls).toContainEqual([83, 'red-soft', false]);
    expect(calls).toContainEqual([86, 'strong', true]);  // Record/Input
  });
});
""",
'button LED behavior tests')
p.write_text(s)


# -----------------------------------------------------------------------------
# PWA version identity: index + service worker must move together.
# -----------------------------------------------------------------------------
p = Path('index.html')
s = p.read_text()
s = replace_once(s,
"<script src=\"push-web-control.js?v=1.8.0\"></script>\n<script src=\"midi.js?v=6.7.58\"></script>",
"<script src=\"push-web-control.js?v=1.8.0-led1\"></script>\n<script src=\"midi.js?v=6.7.59\"></script>",
'index asset versions')
p.write_text(s)

p = Path('sw.js')
s = p.read_text()
s = replace_once(s,
"var CACHE_NAME = '64pad-v180-preview-20260911-liveport-2';",
"var CACHE_NAME = '64pad-v180-preview-20260911-buttonled-1';",
'cache name')
s = replace_once(s,
"'push-web-control.js?v=1.8.0',\n  'midi.js?v=6.7.58',",
"'push-web-control.js?v=1.8.0-led1',\n  'midi.js?v=6.7.59',",
'sw asset versions')
p.write_text(s)
