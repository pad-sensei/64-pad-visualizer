// Launchpad Pro MK3 Programmer adapter. Protocol/lifecycle only: no music theory.
// Based on DOJO LaunchpadProgrammerMode/Link and Novation's Pro MK3 reference.
(function(global) {
  'use strict';
  function isProMk3(name) {
    var n = String(name || '').toLowerCase().replace(/[\s_\[\]-]/g, '');
    return /launchpadpromk3|lppromk3/.test(n) && !/din/.test(n);
  }
  function isMidiPort(name) {
    return isProMk3(name) && !/daw|midi(?:in|out)[23]/i.test(String(name || ''));
  }
  function values(map) {
    return map && typeof map.values === 'function'
      ? Array.from(map.values()).filter(function(p) { return p.state !== 'disconnected'; }) : [];
  }
  function position(note) {
    if (!Number.isInteger(note)) return null;
    var row = Math.floor(note / 10) - 1, col = note % 10 - 1;
    return row >= 0 && row < 8 && col >= 0 && col < 8 ? { row: row, col: col } : null;
  }
  function padNote(index) { return (Math.floor(index / 8) + 1) * 10 + index % 8 + 1; }
  var enter = [0xf0, 0, 32, 41, 2, 14, 14, 1, 0xf7];
  var live = [0xf0, 0, 32, 41, 2, 14, 14, 0, 0xf7];
  var noteLayout = [0xf0, 0, 32, 41, 2, 14, 0, 4, 0, 0, 0xf7];
  function ledMessage(entries) {
    var bytes = [0xf0, 0, 32, 41, 2, 14, 3];
    entries.forEach(function(e) { bytes.push(0, padNote(e[0]), e[1]); });
    bytes.push(0xf7);
    return bytes;
  }
  // Use the actual rendered pad, not a second voicing calculation or Push palette.
  function paletteForRenderedPad(fill, visible, midi, background) {
    if (!visible || /--pad-off|--pad-omitted|--bg\)/.test(fill)) return 0;
    if (midi % 12 === 0) return 45; // C stays identifiable underneath the shape.
    if (background) return /--pad-root/.test(fill) ? 9 : 2;
    return 13;
  }
  function create(onRelease) {
    var generation = 0, ownedInput = null, output = null, active = false;
    var previous = new Array(64).fill(-1);
    function disconnect() {
      generation += 1;
      var oldInput = ownedInput, oldOutput = output, wasActive = active;
      active = false; ownedInput = null; output = null;
      previous.fill(-1);
      if (oldInput && typeof onRelease === 'function') onRelease(oldInput);
      if (oldOutput && wasActive) {
        // Best effort on page teardown. Never route through Push's all-CC sweep.
        try { oldOutput.clear?.(); } catch (_) {}
        try { oldOutput.send(ledMessage(Array.from({length:64}, function(_, i) { return [i, 0]; }))); } catch (_) {}
        try { oldOutput.send(live); } catch (_) {}
        try { oldOutput.send(noteLayout); } catch (_) {}
      }
    }
    async function connect(access, selectedInputs) {
      disconnect();
      var token = generation;
      if (!access || access.sysexEnabled !== true) return false;
      var inputs = values(access.inputs).filter(function(p) { return isMidiPort(p.name); });
      var outputs = values(access.outputs).filter(function(p) { return isMidiPort(p.name); });
      if (inputs.length !== 1 || outputs.length !== 1 || selectedInputs.indexOf(inputs[0]) < 0) return false;
      var input = inputs[0], port = outputs[0];
      try {
        if (typeof port.open === 'function') await port.open();
        if (token !== generation || input.state === 'disconnected' || port.state === 'disconnected') return false;
        port.send(enter);
      } catch (_) { return false; }
      // Web MIDI send success is not hardware acknowledgement; real-device QA remains required.
      ownedInput = input; output = port; active = true;
      previous.fill(-1);
      return true;
    }
    function paint(colors) {
      if (!active || !output || output.state === 'disconnected' || !colors || colors.length !== 64) return false;
      var changed = [];
      for (var i = 0; i < 64; i++) {
        if (!Number.isInteger(colors[i]) || colors[i] < 0 || colors[i] > 127) return false;
        if (previous[i] !== colors[i]) changed.push([i, colors[i]]);
      }
      if (!changed.length) return true;
      try { output.send(ledMessage(changed)); }
      catch (_) { previous.fill(-1); return false; }
      previous = colors.slice();
      return true;
    }
    return {
      connect: connect, disconnect: disconnect, paint: paint,
      isActiveFor: function(input) { return active && input === ownedInput && output && output.state !== 'disconnected'; },
    };
  }
  var api = { isMidiPort: isMidiPort, position: position, padNote: padNote, create: create,
    paletteForRenderedPad: paletteForRenderedPad };
  global.padLaunchpadProgrammer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
