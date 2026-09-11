from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} anchor missing')
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# Push MIDI port contract: setup fan-out, operational Live-Port-only routing,
# generic CoreMIDI Push 3 topology evidence, and pedal initialization.
# -----------------------------------------------------------------------------
Path('push-midi-port-contract.js').write_text(r'''(function(global) {
  'use strict';

  function normalizedName(name) {
    return String(name || '').trim();
  }

  function isGenericPushPortName(name) {
    var lower = normalizedName(name).toLowerCase();
    return lower === 'live port' || lower === 'user port' || lower === 'external port';
  }

  function isPushPortName(name) {
    var n = normalizedName(name);
    var lower = n.toLowerCase();
    return /push/i.test(n)
      || /ableton/i.test(n)
      || lower === 'live port'
      || lower === 'user port'
      || lower === 'external port';
  }

  function isPushOperationalPortName(name) {
    var n = normalizedName(name);
    return isPushPortName(n) && /live port/i.test(n);
  }

  function isPush3PortName(name) {
    return /(?:ableton\s+)?push\s*3/i.test(normalizedName(name));
  }

  function isPush2PortName(name) {
    return /(?:ableton\s+)?push\s*2/i.test(normalizedName(name));
  }

  function connectedValues(portMap) {
    if (!portMap || typeof portMap.values !== 'function') return [];
    return Array.from(portMap.values()).filter(function(port) {
      return !!port && port.state !== 'disconnected';
    });
  }

  function collectPushInputs(access) {
    return connectedValues(access && access.inputs).filter(function(input) {
      return isPushPortName(input && input.name);
    });
  }

  function selectPushOperationalInput(inputs) {
    inputs = (inputs || []).filter(Boolean);
    return inputs.find(function(input) { return isPushOperationalPortName(input.name); })
      || inputs.find(function(input) {
        return isPushPortName(input.name) && !/user port|external port/i.test(input.name || '');
      })
      || null;
  }

  function collectInputCluster(access, selectedId) {
    var inputs = connectedValues(access && access.inputs);
    var pushInputs = inputs.filter(function(input) { return isPushPortName(input && input.name); });
    var operationalPush = selectPushOperationalInput(pushInputs);

    if (!selectedId || selectedId === 'all') {
      // A Push exposes Live/User/External ports, but only Live Port is the control-
      // surface performance path. Keep setup-only User/External listeners out of the
      // held-note model so mirrored NoteOn/NoteOff cannot strand chord ownership.
      var result = inputs.filter(function(input) { return !isPushPortName(input && input.name); });
      if (operationalPush) result.unshift(operationalPush);
      return result;
    }

    var selected = inputs.find(function(input) { return input && input.id === selectedId; });
    if (!selected) return [];
    if (isPushPortName(selected.name)) return operationalPush ? [operationalPush] : [selected];
    return [selected];
  }

  function collectPushOutputs(access) {
    return connectedValues(access && access.outputs).filter(function(output) {
      return isPushPortName(output && output.name);
    });
  }

  function selectPushOperationalOutput(outputs) {
    outputs = (outputs || []).filter(Boolean);
    return outputs.find(function(output) { return isPushOperationalPortName(output.name); })
      || outputs.find(function(output) {
        return isPushPortName(output.name) && !/user port|external port/i.test(output.name || '');
      })
      || null;
  }

  function detectPushGeneration(outputs) {
    var list = (outputs || []).filter(Boolean);
    if (list.some(function(port) { return isPush3PortName(port.name); })) {
      return { generation: 3, evidence: 'explicit-push3-name' };
    }
    if (list.some(function(port) { return isPush2PortName(port.name); })) {
      return { generation: 2, evidence: 'explicit-push2-name' };
    }

    // macOS/CoreMIDI can omit the device prefix entirely. Ableton documents Push 3
    // as Live/User/External; Push 2 control-surface documentation uses Live/User.
    // Require the complete generic three-port topology before treating an unnamed
    // device as Push 3, so the Push-3-only Pedal/CV command is never sent from a
    // single ambiguous generic port.
    var generic = new Set(list.filter(function(port) { return isGenericPushPortName(port.name); })
      .map(function(port) { return normalizedName(port.name).toLowerCase(); }));
    if (generic.has('live port') && generic.has('user port') && generic.has('external port')) {
      return { generation: 3, evidence: 'generic-live-user-external-topology' };
    }
    return { generation: null, evidence: 'unknown' };
  }

  function topologySignature(access) {
    function side(portMap) {
      if (!portMap || typeof portMap.values !== 'function') return '';
      return Array.from(portMap.values()).map(function(port) {
        return [port && port.id || '', port && port.name || '', port && port.state || ''].join(':');
      }).sort().join(',');
    }
    // Deliberately exclude `connection` (open/closed). Web MIDI can emit statechange
    // merely because send() implicitly opens an output; that must not tear down and
    // rebind Push input mid-performance.
    return 'i=' + side(access && access.inputs) + '|o=' + side(access && access.outputs);
  }

  async function requestMidiAccess(nav) {
    if (!nav || typeof nav.requestMIDIAccess !== 'function') throw new Error('Web MIDI unavailable');
    try {
      return await nav.requestMIDIAccess({ sysex: true });
    } catch (sysexError) {
      var access = await nav.requestMIDIAccess();
      try { access.__64peSysexError = String(sysexError && sysexError.message || sysexError || 'SysEx denied'); } catch (_) {}
      return access;
    }
  }

  function initializePush3PedalMode(access, outputs) {
    var setupOutputs = Array.from(new Set((outputs || []).filter(function(output) {
      return !!output && isPushPortName(output.name);
    })));
    if (!access || access.sysexEnabled !== true) {
      return { initialized: false, inquirySent: false, reason: 'sysex-unavailable', output: null, generation: null, evidence: 'none' };
    }

    // Universal Device Inquiry is safe for Push 2/3 and is part of the proven
    // external-controller startup sequence. Send it before generation-specific
    // setup, including when CoreMIDI exposes only generic port names.
    var inquiry = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];
    var inquirySent = false;
    setupOutputs.forEach(function(output) {
      try { output.send(inquiry); inquirySent = true; } catch (_) {}
    });

    var model = detectPushGeneration(setupOutputs);
    if (model.generation !== 3) {
      return {
        initialized: false,
        inquirySent: inquirySent,
        reason: 'push3-model-not-confirmed',
        output: null,
        generation: model.generation,
        evidence: model.evidence,
      };
    }

    var primary = selectPushOperationalOutput(setupOutputs);
    if (!primary) {
      return {
        initialized: false,
        inquirySent: inquirySent,
        reason: 'live-port-unavailable',
        output: null,
        generation: 3,
        evidence: model.evidence,
      };
    }

    var payload = [
      0xf0,
      0x00, 0x21, 0x1d, 0x01, 0x01, 0x37, 0x26, 0x50,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xf7,
    ];
    try {
      primary.send(payload);
      return {
        initialized: true,
        inquirySent: inquirySent,
        reason: 'ok',
        output: primary.name || '',
        generation: 3,
        evidence: model.evidence,
      };
    } catch (error) {
      return {
        initialized: false,
        inquirySent: inquirySent,
        reason: String(error && error.message || error),
        output: primary.name || '',
        generation: 3,
        evidence: model.evidence,
      };
    }
  }

  var api = {
    isPushPortName,
    isPushOperationalPortName,
    isPush3PortName,
    isPush2PortName,
    collectPushInputs,
    collectInputCluster,
    collectPushOutputs,
    selectPushOperationalInput,
    selectPushOperationalOutput,
    detectPushGeneration,
    topologySignature,
    requestMidiAccess,
    initializePush3PedalMode,
  };
  global.padWebPushPortContract = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
''')

Path('tests/unit/push-midi-port-contract.test.js').write_text(r'''import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isPushPortName,
  isPushOperationalPortName,
  isPush3PortName,
  collectInputCluster,
  collectPushOutputs,
  selectPushOperationalOutput,
  detectPushGeneration,
  topologySignature,
  requestMidiAccess,
  initializePush3PedalMode,
} = require('../../push-midi-port-contract.js');

function port(id, name, state = 'connected') { return { id, name, state }; }
function access(inputs, outputs = [], sysexEnabled = false) {
  return {
    inputs: new Map(inputs.map(p => [p.id, p])),
    outputs: new Map(outputs.map(p => [p.id, p])),
    sysexEnabled,
  };
}

describe('Push Web MIDI Live-Port ownership', () => {
  it('collapses Push Live/User/External to the operational Live input', () => {
    const a = access([
      port('p-live', 'Ableton Push 3 Live Port'),
      port('p-user', 'Ableton Push 3 User Port'),
      port('p-ext', 'Ableton Push 3 External Port'),
      port('keys', 'Roland A-88 MK2'),
    ]);
    expect(collectInputCluster(a, 'p-user').map(p => p.id)).toEqual(['p-live']);
    expect(collectInputCluster(a, 'p-ext').map(p => p.id)).toEqual(['p-live']);
    expect(collectInputCluster(a, 'keys').map(p => p.id)).toEqual(['keys']);
    expect(collectInputCluster(a, 'all').map(p => p.id)).toEqual(['p-live', 'keys']);
  });

  it('supports generic CoreMIDI names while keeping only Live operational', () => {
    expect(isPushPortName('Live Port')).toBe(true);
    expect(isPushPortName('User Port')).toBe(true);
    expect(isPushPortName('External Port')).toBe(true);
    expect(isPushOperationalPortName('Live Port')).toBe(true);
    expect(isPushOperationalPortName('User Port')).toBe(false);
    expect(isPush3PortName('Ableton Push 3 Live Port')).toBe(true);
    expect(isPush3PortName('Ableton Push 2 Live Port')).toBe(false);
  });

  it('keeps setup fan-out but selects only Live for ordinary output', () => {
    const outputs = [
      port('live', 'Live Port'),
      port('user', 'User Port'),
      port('ext', 'External Port'),
    ];
    const a = access([], outputs, true);
    expect(collectPushOutputs(a).map(p => p.id)).toEqual(['live', 'user', 'ext']);
    expect(selectPushOperationalOutput(outputs).id).toBe('live');
    expect(detectPushGeneration(outputs)).toEqual({ generation: 3, evidence: 'generic-live-user-external-topology' });
  });

  it('does not treat implicit port-open connection churn as topology drift', () => {
    const input = port('p-live', 'Ableton Push 3 Live Port');
    input.connection = 'closed';
    const a = access([input]);
    const before = topologySignature(a);
    input.connection = 'open';
    expect(topologySignature(a)).toBe(before);
    input.state = 'disconnected';
    expect(topologySignature(a)).not.toBe(before);
  });

  it('requests SysEx first and falls back to ordinary Web MIDI without losing notes', async () => {
    const normal = access([]);
    const nav = {
      requestMIDIAccess: vi.fn(opts => opts?.sysex ? Promise.reject(new Error('denied')) : Promise.resolve(normal)),
    };
    await expect(requestMidiAccess(nav)).resolves.toBe(normal);
    expect(nav.requestMIDIAccess).toHaveBeenNthCalledWith(1, { sysex: true });
    expect(nav.requestMIDIAccess).toHaveBeenCalledTimes(2);
  });

  it('sends inquiry to setup outputs and Push 3 pedal mode only to Live', () => {
    const sent = { live: [], user: [], ext: [] };
    const live = { ...port('live', 'Live Port'), send: bytes => sent.live.push(bytes) };
    const user = { ...port('user', 'User Port'), send: bytes => sent.user.push(bytes) };
    const ext = { ...port('ext', 'External Port'), send: bytes => sent.ext.push(bytes) };
    const result = initializePush3PedalMode({ sysexEnabled: true }, [live, user, ext]);
    expect(result.initialized).toBe(true);
    expect(result.evidence).toBe('generic-live-user-external-topology');
    expect(result.output).toBe('Live Port');
    for (const key of ['live', 'user', 'ext']) {
      expect(sent[key].some(bytes => bytes[0] === 0xf0 && bytes[1] === 0x7e && bytes[4] === 0x01 && bytes.at(-1) === 0xf7)).toBe(true);
    }
    expect(sent.live.some(bytes => bytes[1] === 0x00 && bytes[7] === 0x26 && bytes[8] === 0x50)).toBe(true);
    expect(sent.user.some(bytes => bytes[1] === 0x00 && bytes[8] === 0x50)).toBe(false);
    expect(sent.ext.some(bytes => bytes[1] === 0x00 && bytes[8] === 0x50)).toBe(false);
  });

  it('still sends universal inquiry when Push 3 generation is not confirmed', () => {
    const sent = [];
    const live = { ...port('live', 'Live Port'), send: bytes => sent.push(bytes) };
    const user = { ...port('user', 'User Port'), send: bytes => sent.push(bytes) };
    const result = initializePush3PedalMode({ sysexEnabled: true }, [live, user]);
    expect(result.initialized).toBe(false);
    expect(result.inquirySent).toBe(true);
    expect(result.reason).toBe('push3-model-not-confirmed');
    expect(sent.some(bytes => bytes[1] === 0x7e)).toBe(true);
    expect(sent.some(bytes => bytes[1] === 0x00 && bytes[8] === 0x50)).toBe(false);
    expect(initializePush3PedalMode({ sysexEnabled: false }, [live]).reason).toBe('sysex-unavailable');
  });
});
''')

# -----------------------------------------------------------------------------
# Browser MIDI runtime: operational Live Port only, setup-only fan-out, diagnostics.
# -----------------------------------------------------------------------------
p = Path('midi.js')
s = p.read_text()
s = replace_once(
    s,
    "let _pushLedOutputs = [];  // all Push LED outputs, mirroring Keys standalone fan-out\n",
    "let _pushLedOutputs = [];    // operational Push Live output only\nlet _pushSetupOutputs = [];  // User/External are setup-only; never ordinary LED transport\n",
    'Push output declarations',
)
anchor = "const _pushLedColorRoleOrder = ['root', 'scale', 'pressed', 'memorySlot', 'performActive'];\n"
diag = r'''

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
  var pedal = d.pedalMode ? JSON.stringify(d.pedalMode) : '-';
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

if (typeof window !== 'undefined' && !window.__64PE_PUSH_DIAG_ERROR_HOOK__) {
  window.__64PE_PUSH_DIAG_ERROR_HOOK__ = true;
  window.addEventListener('error', function(event) {
    padWebPatchPushMidiDiag({ lastError: String(event && (event.message || event.error) || 'window error') });
  });
  window.addEventListener('unhandledrejection', function(event) {
    padWebPatchPushMidiDiag({ lastError: 'promise: ' + String(event && event.reason || 'unhandled rejection') });
  });
}
'''
s = replace_once(s, anchor, anchor + diag, 'Push diagnostics insertion')

old = """      const selectedId = select.value;
      const inputCluster = padWebPushPortContract.collectInputCluster(access, selectedId);
      const inputIds = new Set(inputCluster.map(function(input) { return input.id; }));
      const pushInputs = inputCluster.filter(function(input) { return padWebIsPushMidiPortName(input.name); });
      let connected = inputCluster.length > 0;
      let connectedName = pushInputs.length > 0 ? (pushInputs[0].name || '')
        : (inputCluster.length > 0 ? (inputCluster[0].name || '') : '');
      try {
        window.__64PE_PUSH_MIDI_DIAG__ = {
          selectedId: selectedId,
          boundInputs: inputCluster.map(function(input) { return input.name || input.id || ''; }),
          pushInputs: pushInputs.map(function(input) { return input.name || input.id || ''; }),
          sysexEnabled: access.sysexEnabled === true,
        };
      } catch (_) {}
"""
new = """      const selectedId = select.value;
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
"""
s = replace_once(s, old, new, 'input cluster diagnostics')

s = replace_once(
    s,
    "        const inputHandler = (e) => {\n          if (e.data.length < 3) return;\n          const [status, rawNote, velocity] = e.data;",
    "        const inputHandler = (e) => {\n          if (!e || !e.data) return;\n          padWebRecordPushMidiEvent(input, e.data);\n          if (e.data.length < 3) return;\n          const [status, rawNote, velocity] = e.data;",
    'MIDI event diagnostics',
)

old = """      midiOutput = null;
      midiOutputDAW = null;
      _pushLedOutputs = [];
      _lpOutputActive = false;
"""
new = """      midiOutput = null;
      midiOutputDAW = null;
      _pushLedOutputs = [];
      _pushSetupOutputs = [];
      _lpOutputActive = false;
"""
s = replace_once(s, old, new, 'Push output reset')

old = """        if (isPush) {
          // Match the standalone products: enumerate every Push output, including
          // CoreMIDI's prefix-less Live/User/External Port names. Keep Live Port
          // as the primary compatibility handle, but fan LED writes to all of them.
          _isPush = true;
          var pushOutputs = padWebCollectPushMidiOutputs(access);
          _pushLedOutputs = pushOutputs.slice();
          var pedalInit = padWebPushPortContract.initializePush3PedalMode(access, _pushLedOutputs);
          try { window.__64PE_PUSH_MIDI_DIAG__.pedalMode = pedalInit; } catch (_) {}
          var pushLivePort = pushOutputs.find(function(output) { return /live/i.test(output.name || ''); }) || null;
          var pushUserPort = pushOutputs.find(function(output) { return /user/i.test(output.name || ''); }) || null;
          midiOutput = pushLivePort || pushUserPort || pushOutputs[0] || null;
          if (midiOutput) {
            // 64PE Desktop explicitly clears a stale previous owner at acquisition.
            // Do the same before painting the Web state so a crash/old tab cannot
            // leave an apparently immortal pad colour behind.
            padWebHardClearPushOutputs(_pushLedOutputs);
            _lpOutputActive = true;
            _lpProgrammerMode = true;
            console.log('[64PE LED] Push primary output:', midiOutput.name,
                        'fan-out:', _pushLedOutputs.map(function(output) { return output.name; }));
          }
"""
new = """        if (isPush) {
          // Live Port is the only operational control-surface transport. User and
          // External remain setup-only, matching the mature DOJO Push contract.
          _isPush = true;
          var pushSetupOutputs = padWebCollectPushMidiOutputs(access);
          _pushSetupOutputs = pushSetupOutputs.slice();
          var pedalInit = padWebPushPortContract.initializePush3PedalMode(access, _pushSetupOutputs);
          midiOutput = padWebPushPortContract.selectPushOperationalOutput(_pushSetupOutputs);
          _pushLedOutputs = midiOutput ? [midiOutput] : [];
          padWebPatchPushMidiDiag({
            setupOutputs: _pushSetupOutputs.map(function(output) { return output.name || output.id || ''; }),
            operationalOutput: midiOutput ? (midiOutput.name || midiOutput.id || '') : '',
            pedalMode: pedalInit,
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
"""
s = replace_once(s, old, new, 'Push operational output routing')

# Keep diagnostic held-note count synchronized with note ownership.
s = replace_once(s, "  refreshLaunchpadLEDs();\n  ensureAudioResumed();", "  refreshLaunchpadLEDs();\n  padWebPatchPushMidiDiag({ heldNotes: midiActiveNotes.size });\n  ensureAudioResumed();", 'note-on diagnostics')
s = replace_once(s, "  refreshLaunchpadLEDs();\n  if (shouldReleasePitch) noteOff(mapped);", "  refreshLaunchpadLEDs();\n  padWebPatchPushMidiDiag({ heldNotes: midiActiveNotes.size });\n  if (shouldReleasePitch) noteOff(mapped);", 'note-off diagnostics')

# Do not re-expand operational output collection during cleanup.
old = """  if (midiAccess && midiAccess.outputs) {
    for (const output of midiAccess.outputs.values()) {
      if (padWebIsPushMidiPortName(output.name)) add(output);
    }
  }
"""
if old in s:
    s = s.replace(old, '', 1)

p.write_text(s)

# -----------------------------------------------------------------------------
# Contract tests for output routing and integration string expectations.
# -----------------------------------------------------------------------------
Path('tests/unit/push-midi-output-routing.test.js').write_text(r'''import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('Push Web MIDI output routing parity', () => {
  const source = fs.readFileSync(new URL('../../midi.js', import.meta.url), 'utf8');
  const portContract = fs.readFileSync(new URL('../../push-midi-port-contract.js', import.meta.url), 'utf8');

  it('recognizes prefix-less setup ports but keeps Live as operational', () => {
    expect(portContract).toContain("lower === 'live port'");
    expect(portContract).toContain("lower === 'user port'");
    expect(portContract).toContain("lower === 'external port'");
    expect(portContract).toContain('isPushOperationalPortName');
    expect(source).toContain('padWebPushPortContract.selectPushOperationalOutput(_pushSetupOutputs)');
  });

  it('routes ordinary Push LED traffic only to the operational Live output', () => {
    expect(source).toContain('_pushSetupOutputs = pushSetupOutputs.slice();');
    expect(source).toContain('_pushLedOutputs = midiOutput ? [midiOutput] : [];');
    expect(source).toContain('padWebSendPushLedMessage([0x90, note, color])');
    expect(source).not.toContain('_pushLedOutputs = pushOutputs.slice();');
  });

  it('clears stale firmware-owned state only on operational outputs', () => {
    expect(source).toContain('padWebHardClearPushOutputs(_pushLedOutputs);');
    expect(source).toContain('output.send([0x80 | channel, serialNote, 0])');
    expect(source).toContain('output.send([0xb0, cc, 0])');
  });
});
''')

p = Path('tests/unit/push-web-cc-integration.test.js')
s = p.read_text()
s = s.replace("midi.js?v=6.7.57", "midi.js?v=6.7.58")
s = s.replace("push-midi-port-contract.js?v=1.8.0", "push-midi-port-contract.js?v=1.8.0-liveport2")
p.write_text(s)

# Dev deployment must not hot-reload itself through PWA activation mid Human Gate.
p = Path('tests/unit/v180-web-contract.test.js')
s = p.read_text()
needle = "  it('keeps display opt-in lifecycle separate from MIDI pad ownership', () => {"
insert = r'''  it('keeps the /64-pad-dev/ hardware gate free of service-worker hot reloads', () => {
    expect(html).toContain("location.pathname.indexOf('/64-pad-dev/') !== -1");
    expect(html).toContain("sessionStorage.setItem('64pad-dev-sw-cleared', '1')");
    expect(html).toContain('navigator.serviceWorker.getRegistrations()');
  });

'''
s = replace_once(s, needle, insert + needle, 'dev service-worker test')
p.write_text(s)

# -----------------------------------------------------------------------------
# Cache bust + stable dev hardware gate (no SW update reloads on /64-pad-dev/).
# -----------------------------------------------------------------------------
p = Path('index.html')
s = p.read_text()
s = s.replace('push-midi-port-contract.js?v=1.8.0', 'push-midi-port-contract.js?v=1.8.0-liveport2')
s = s.replace('midi.js?v=6.7.57', 'midi.js?v=6.7.58')
old = r'''if ('serviceWorker' in navigator) {
  // Clean up old ?v= registrations (they create zombie SWs)
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    regs.forEach(function(r) {
      if (r.active && r.active.scriptURL.includes('sw.js?v=')) r.unregister();
    });
  });
  // Only reload on SW UPDATE, not first install (first install reload wipes version notice)
  var _hadSWController = !!navigator.serviceWorker.controller;
  // Register without ?v= query. updateViaCache:'none' bypasses HTTP cache for SW checks.
  // Version lives inside sw.js (CACHE_NAME). Content change → browser detects update.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function(reg) {
    reg.addEventListener('updatefound', function() {
      var w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', function() {
        if (w.state === 'activated' && _hadSWController) {
          try { localStorage.setItem('64pad-just-updated', '1'); } catch(_) {}
          location.reload();
        }
      });
    });
  });
}
'''
new = r'''if ('serviceWorker' in navigator) {
  var _is64PadDevDeploy = location.pathname.indexOf('/64-pad-dev/') !== -1;
  if (_is64PadDevDeploy) {
    // Real-hardware dev gates must never be interrupted by a newly deployed SW.
    // Remove the dev registration and escape an already controlling worker once.
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      return Promise.all(regs.map(function(r) { return r.unregister(); }));
    }).then(function() {
      if (navigator.serviceWorker.controller && !sessionStorage.getItem('64pad-dev-sw-cleared')) {
        sessionStorage.setItem('64pad-dev-sw-cleared', '1');
        location.reload();
      }
    });
  } else {
    // Clean up old ?v= registrations (they create zombie SWs)
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      regs.forEach(function(r) {
        if (r.active && r.active.scriptURL.includes('sw.js?v=')) r.unregister();
      });
    });
    // Only reload on SW UPDATE, not first install (first install reload wipes version notice)
    var _hadSWController = !!navigator.serviceWorker.controller;
    // Register without ?v= query. updateViaCache:'none' bypasses HTTP cache for SW checks.
    // Version lives inside sw.js (CACHE_NAME). Content change → browser detects update.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function(reg) {
      reg.addEventListener('updatefound', function() {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', function() {
          if (w.state === 'activated' && _hadSWController) {
            try { localStorage.setItem('64pad-just-updated', '1'); } catch(_) {}
            location.reload();
          }
        });
      });
    });
  }
}
'''
s = replace_once(s, old, new, 'dev service-worker boundary')
p.write_text(s)

p = Path('sw.js')
s = p.read_text()
s = s.replace("64pad-v180-preview-20260911-push3runtime-1", "64pad-v180-preview-20260911-liveport-2")
s = s.replace("'push-midi-port-contract.js?v=1.8.0'", "'push-midi-port-contract.js?v=1.8.0-liveport2'")
s = s.replace("'midi.js?v=6.7.57'", "'midi.js?v=6.7.58'")
p.write_text(s)
