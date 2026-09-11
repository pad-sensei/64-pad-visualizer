(function(global) {
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
