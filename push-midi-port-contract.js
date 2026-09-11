(function(global) {
  'use strict';

  function isPushPortName(name) {
    var n = String(name || '').trim();
    var lower = n.toLowerCase();
    return /push/i.test(n)
      || /ableton/i.test(n)
      || lower === 'live port'
      || lower === 'user port'
      || lower === 'external port';
  }

  function isPush3PortName(name) {
    return /(?:ableton\s+)?push\s*3/i.test(String(name || ''));
  }

  function connectedValues(portMap) {
    if (!portMap || typeof portMap.values !== 'function') return [];
    return Array.from(portMap.values()).filter(function(port) {
      return !port || port.state !== 'disconnected';
    });
  }

  function collectInputCluster(access, selectedId) {
    var inputs = connectedValues(access && access.inputs);
    if (!selectedId || selectedId === 'all') return inputs;
    var selected = inputs.find(function(input) { return input && input.id === selectedId; });
    if (!selected) return [];
    // Push is one physical controller exposed as several MIDI ports. Selecting any
    // one Push port must own the complete Live/User/External input cluster so notes,
    // control-surface CC, and pedal CC64 cannot be split across listeners.
    if (isPushPortName(selected.name)) {
      return inputs.filter(function(input) { return isPushPortName(input && input.name); });
    }
    return [selected];
  }

  function collectPushOutputs(access) {
    return connectedValues(access && access.outputs).filter(function(output) {
      return isPushPortName(output && output.name);
    });
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
    // rebind all Push inputs mid-performance.
    return 'i=' + side(access && access.inputs) + '|o=' + side(access && access.outputs);
  }

  async function requestMidiAccess(nav) {
    if (!nav || typeof nav.requestMIDIAccess !== 'function') throw new Error('Web MIDI unavailable');
    try {
      return await nav.requestMIDIAccess({ sysex: true });
    } catch (sysexError) {
      // Keep ordinary note input available even if the user/browser denies SysEx.
      // Pedal-mode initialization will report sysex-unavailable in diagnostics.
      var access = await nav.requestMIDIAccess();
      try { access.__64peSysexError = String(sysexError && sysexError.message || sysexError || 'SysEx denied'); } catch (_) {}
      return access;
    }
  }

  function initializePush3PedalMode(access, outputs) {
    var unique = Array.from(new Set((outputs || []).filter(Boolean)));
    if (!access || access.sysexEnabled !== true) {
      return { initialized: false, reason: 'sysex-unavailable', output: null };
    }

    // Never infer Push 3 from a prefix-less port. The pedal/CV configuration SysEx
    // is Push-3-only, so send it only when the generation is explicit in the name.
    var push3 = unique.filter(function(output) { return isPush3PortName(output && output.name); });
    var primary = push3.find(function(output) { return /live port/i.test(output && output.name || ''); }) || push3[0] || null;
    if (!primary) return { initialized: false, reason: 'push3-model-not-confirmed', output: null };

    // Native Standalone sends Device Inquiry to the Push surface outputs first.
    var inquiry = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];
    unique.forEach(function(output) {
      try { output.send(inquiry); } catch (_) {}
    });

    // Exact 64PE Standalone payload: Push 3 dual-footswitch mode. JUCE wraps its
    // 21-byte payload in F0/F7; Web MIDI requires those bytes inline.
    var payload = [
      0xf0,
      0x00, 0x21, 0x1d, 0x01, 0x01, 0x37, 0x26, 0x50,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xf7,
    ];
    try {
      primary.send(payload);
      return { initialized: true, reason: 'ok', output: primary.name || '' };
    } catch (error) {
      return { initialized: false, reason: String(error && error.message || error), output: primary.name || '' };
    }
  }

  var api = {
    isPushPortName,
    isPush3PortName,
    collectInputCluster,
    collectPushOutputs,
    topologySignature,
    requestMidiAccess,
    initializePush3PedalMode,
  };
  global.padWebPushPortContract = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
