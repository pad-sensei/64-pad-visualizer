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

    // CoreMIDI can expose bare Live/User/External names. This is informational
    // generation evidence only. It must never authorize a hardware configuration
    // write: Web preserves the device's existing Pedal/CV jack configuration.
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
    } catch (_) {
      // SysEx is optional for this product path. In particular, Push 3 Pedal/CV
      // configuration is never rewritten by 64PE Web; ordinary Note/CC/LED works
      // through standard Web MIDI. Launchpad programmer mode can remain unavailable
      // when the browser denies SysEx.
      return await nav.requestMIDIAccess();
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
  };
  global.padWebPushPortContract = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
