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
  var defaultColors = { scale: 'p:2', c: 'p:45', guide: 'p:13', guideC: 'p:13', pressed: 'p:21' };
  function validColor(value) {
    return typeof value === 'string' && (/^#[0-9a-f]{6}$/i.test(value) || /^p:(0|[1-9][0-9]?|1[01][0-9]|12[0-7])$/.test(value));
  }
  function sanitizeColors(values) {
    var result = {};
    Object.keys(defaultColors).forEach(function(role) { result[role] = values && validColor(values[role]) ? values[role] : defaultColors[role]; });
    return result;
  }
  function colorForRole(role, values) {
    if (!Object.prototype.hasOwnProperty.call(defaultColors, role)) return 0;
    if (values === undefined && typeof AppState !== 'undefined') values = AppState.launchpadColors;
    var value = sanitizeColors(values)[role];
    return value[0] === '#' ? value.toLowerCase() : Number(value.slice(2));
  }
  function validDescriptor(value) { return Number.isInteger(value) && value >= 0 && value <= 127 || typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
  function ledMessage(entries) {
    var bytes = [0xf0, 0, 32, 41, 2, 14, 3];
    entries.forEach(function(e) {
      if (typeof e[1] === 'string') {
        var rgb = parseInt(e[1].slice(1), 16);
        var seven = function(v) { return Math.floor((v * 127 + 127) / 255); };
        bytes.push(3, padNote(e[0]), seven((rgb >> 16) & 255), seven((rgb >> 8) & 255), seven(rgb & 255));
      } else bytes.push(0, padNote(e[0]), e[1]);
    });
    bytes.push(0xf7);
    return bytes;
  }
  // Use the actual rendered pad, not a second voicing calculation or Push palette.
  function paletteForRenderedPad(fill, visible, midi, background) {
    if (!visible || /--pad-off|--pad-omitted|--bg\)/.test(fill)) return 0;
    if (background) return midi % 12 === 0 ? colorForRole('c') : /--pad-root/.test(fill) ? 9 : colorForRole('scale');
    return colorForRole(midi % 12 === 0 ? 'guideC' : 'guide');
  }
  // Novation reference pp.6–7: a query returns the select-layout packet.
  var layoutQuery = [0xf0, 0, 32, 41, 2, 14, 0, 0xf7];
  function readLayout(data) {
    if (!data || data.length !== 11) return null;
    var header = [0xf0, 0, 32, 41, 2, 14, 0];
    if (!header.every(function(byte, i) { return data[i] === byte; })
        || data[10] !== 0xf7 || data[9] !== 0
        || !Number.isInteger(data[7]) || data[7] < 0 || data[7] > 19
        || !Number.isInteger(data[8]) || data[8] < 0 || data[8] > 7) return null;
    return { layout: data[7], page: data[8] };
  }
  function create(onRelease, options) {
    options = options || {};
    var timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 1500;
    var now = options.now || function() { return typeof performance !== 'undefined' ? performance.now() : 0; };
    var generation = 0, ownedInput = null, output = null, active = false, modeSent = false;
    var status = 'idle', statusReason = null, listener = null, pending = null, managedInputs = new Set();
    var previous = new Array(64).fill(-1);
    function setStatus(value, detail) {
      status = value; statusReason = detail || null;
      if (typeof options.onStateChange === 'function') options.onStateChange(value);
    }
    function settle(ready) {
      if (!pending) return;
      var old = pending; pending = null;
      clearTimeout(old.timer);
      old.resolve(ready);
    }
    function removeListener() {
      if (listener && ownedInput) ownedInput.removeEventListener('midimessage', listener);
      listener = null;
    }
    function restore(port, clearPads) {
      if (!port) return;
      try { port.clear?.(); } catch (_) {}
      if (clearPads) {
        try { port.send(ledMessage(Array.from({length:64}, function(_, i) { return [i, 0]; }))); } catch (_) {}
      }
      try { port.send(live); } catch (_) {}
      try { port.send(noteLayout); } catch (_) {}
    }
    function fail(reason) {
      var clearPads = active;
      generation += 1; active = false;
      settle(false); removeListener(); previous.fill(-1);
      if (ownedInput && typeof onRelease === 'function') onRelease(ownedInput);
      if (modeSent) restore(output, clearPads);
      modeSent = false;
      // Retain ownership until rebinding: unconfirmed packets must not become raw notes.
      setStatus(reason, reason === 'timeout' ? 'timeout' : reason === 'mismatch' ? 'layout' : 'transport');
    }
    function disconnect() {
      generation += 1;
      var oldInput = ownedInput, oldOutput = output, clearPads = active, restoreMode = modeSent;
      active = false; settle(false); removeListener();
      ownedInput = null; output = null; modeSent = false; managedInputs.clear(); previous.fill(-1);
      if (oldInput && typeof onRelease === 'function') onRelease(oldInput);
      if (restoreMode) restore(oldOutput, clearPads);
      setStatus('idle');
    }
    async function connect(access, selectedInputs) {
      disconnect();
      var token = generation;
      managedInputs = new Set((selectedInputs || []).filter(function(input) { return isMidiPort(input.name); }));
      if (!managedInputs.size) return false;
      if (!access || access.sysexEnabled !== true) { setStatus('unconfirmed', 'sysex'); return false; }
      var inputs = values(access.inputs).filter(function(p) { return isMidiPort(p.name); });
      var outputs = values(access.outputs).filter(function(p) { return isMidiPort(p.name); });
      if (inputs.length !== 1 || outputs.length !== 1 || selectedInputs.indexOf(inputs[0]) < 0) { setStatus('unconfirmed', 'ports'); return false; }
      var input = inputs[0], port = outputs[0];
      if (typeof input.addEventListener !== 'function' || typeof input.removeEventListener !== 'function') { setStatus('unconfirmed', 'interface'); return false; }
      ownedInput = input; output = port; setStatus('opening');
      try {
        if (typeof port.open === 'function') await port.open();
        if (token !== generation) return false;
        if (input.state === 'disconnected' || port.state === 'disconnected') { fail('failed'); return false; }
        var querySent = false, queryTime = 0;
        var ready = new Promise(function(resolve) {
          pending = { resolve: resolve, timer: setTimeout(function() {
            if (token === generation) fail('timeout');
          }, timeoutMs) };
        });
        listener = function(event) {
          if (token !== generation || input !== ownedInput || !querySent) return;
          if (input.state === 'disconnected' || port.state === 'disconnected') { fail('failed'); return; }
          // Reject queued events stamped before this query. The wire protocol has no nonce.
          if (Number.isFinite(event.timeStamp) && event.timeStamp < queryTime) return;
          var reply = readLayout(event.data);
          if (!reply) return;
          if (reply.layout !== 17 || reply.page !== 0) { fail('mismatch'); return; }
          if (!pending) return; // A repeated confirmation is not a new session.
          active = true; previous.fill(-1); settle(true); setStatus('confirmed');
        };
        input.addEventListener('midimessage', listener);
        setStatus('pending');
        modeSent = true; port.send(enter);
        queryTime = now(); querySent = true; port.send(layoutQuery);
        return await ready;
      } catch (_) {
        if (token === generation) fail('failed');
        return false;
      }
    }
    function isActiveFor(input) {
      return active && input === ownedInput && input.state !== 'disconnected'
        && output && output.state !== 'disconnected';
    }
    function paint(colors) {
      if (!isActiveFor(ownedInput) || !colors || colors.length !== 64) return false;
      var changed = [];
      for (var i = 0; i < 64; i++) {
        if (!validDescriptor(colors[i])) return false;
        if (previous[i] !== colors[i]) changed.push([i, colors[i]]);
      }
      if (!changed.length) return true;
      try { output.send(ledMessage(changed)); }
      catch (_) { previous.fill(-1); return false; }
      previous = colors.slice();
      return true;
    }
    return {
      connect: connect, disconnect: disconnect, paint: paint, isActiveFor: isActiveFor,
      isManagedFor: function(input) { return managedInputs.has(input); },
      getStatus: function() { return status; },
      getReason: function() { return statusReason; },
    };
  }
  var api = { isMidiPort: isMidiPort, position: position, padNote: padNote, create: create,
    paletteForRenderedPad: paletteForRenderedPad, defaultColors: defaultColors, validColor: validColor,
    sanitizeColors: sanitizeColors, colorForRole: colorForRole, validDescriptor: validDescriptor, readLayout: readLayout };
  global.padLaunchpadProgrammer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
