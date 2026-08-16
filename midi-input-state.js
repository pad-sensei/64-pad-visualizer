// ========================================
// WEB MIDI — source ownership / listener lifecycle state
// No music theory belongs in this module.
// ========================================

function midiSourceKey(source) {
  source = source || {};
  if (source.sourceId != null) return String(source.sourceId);
  var deviceId = source.deviceId != null ? String(source.deviceId) : 'unknown-device';
  var channel = Number.isInteger(source.channel) ? source.channel : 0;
  var rawNote = Number.isFinite(Number(source.rawNote)) ? Number(source.rawNote) : 'unknown-note';
  var physical = source.physicalPadId != null ? String(source.physicalPadId) : String(rawNote);
  return deviceId + ':' + channel + ':' + physical;
}

function normalizeMidiSource(source) {
  source = source || {};
  var rawNote = Number(source.rawNote);
  var mappedMidi = Number(source.mappedMidi);
  if (!Number.isFinite(rawNote) || !Number.isFinite(mappedMidi)) return null;
  var normalized = {
    deviceId: source.deviceId != null ? String(source.deviceId) : 'unknown-device',
    sourceId: source.sourceId != null ? String(source.sourceId) : null,
    channel: Number.isInteger(source.channel) ? source.channel : 0,
    rawNote: rawNote,
    mappedMidi: mappedMidi,
    row: Number.isInteger(source.row) ? source.row : null,
    col: Number.isInteger(source.col) ? source.col : null,
    physicalPadId: source.physicalPadId != null ? String(source.physicalPadId) : null,
    positionConfidence: source.positionConfidence === 'exact' || source.positionConfidence === 'reconstructed'
      ? source.positionConfidence : 'none',
  };
  normalized.sourceKey = midiSourceKey(normalized);
  return normalized;
}

function createMidiHeldState() {
  var bySource = new Map();
  var sourcesByPitch = new Map();

  function addPitchOwner(mappedMidi, sourceKey) {
    var owners = sourcesByPitch.get(mappedMidi);
    if (!owners) {
      owners = new Set();
      sourcesByPitch.set(mappedMidi, owners);
    }
    owners.add(sourceKey);
  }

  function removePitchOwner(mappedMidi, sourceKey) {
    var owners = sourcesByPitch.get(mappedMidi);
    if (!owners) return;
    owners.delete(sourceKey);
    if (owners.size === 0) sourcesByPitch.delete(mappedMidi);
  }

  return {
    noteOn: function(source) {
      var normalized = normalizeMidiSource(source);
      if (!normalized) return { changed: false, source: null, pitchBecameActive: false };
      var previous = bySource.get(normalized.sourceKey);
      if (previous) removePitchOwner(previous.mappedMidi, normalized.sourceKey);
      var wasActive = sourcesByPitch.has(normalized.mappedMidi);
      bySource.set(normalized.sourceKey, normalized);
      addPitchOwner(normalized.mappedMidi, normalized.sourceKey);
      return { changed: true, source: normalized, pitchBecameActive: !wasActive };
    },

    noteOff: function(source) {
      var normalized = normalizeMidiSource(source);
      if (!normalized) return { changed: false, source: null, pitchBecameInactive: false };
      var held = bySource.get(normalized.sourceKey);
      if (!held) return { changed: false, source: normalized, pitchBecameInactive: false };
      var pitch = held.mappedMidi;
      bySource.delete(normalized.sourceKey);
      removePitchOwner(pitch, normalized.sourceKey);
      return { changed: true, source: held, pitchBecameInactive: !sourcesByPitch.has(pitch) };
    },

    clearDevice: function(deviceId) {
      var id = String(deviceId);
      var releasedPitches = new Set();
      Array.from(bySource.entries()).forEach(function(entry) {
        var sourceKey = entry[0], held = entry[1];
        if (held.deviceId !== id) return;
        bySource.delete(sourceKey);
        removePitchOwner(held.mappedMidi, sourceKey);
        if (!sourcesByPitch.has(held.mappedMidi)) releasedPitches.add(held.mappedMidi);
      });
      return Array.from(releasedPitches).sort(function(a, b) { return a - b; });
    },

    clearAll: function() {
      var released = Array.from(sourcesByPitch.keys()).sort(function(a, b) { return a - b; });
      bySource.clear();
      sourcesByPitch.clear();
      return released;
    },

    heldPitches: function() {
      return Array.from(sourcesByPitch.keys()).sort(function(a, b) { return a - b; });
    },

    heldSources: function() {
      return Array.from(bySource.values()).map(function(source) { return Object.assign({}, source); });
    },

    hasPitch: function(mappedMidi) {
      return sourcesByPitch.has(Number(mappedMidi));
    },

    ownerCount: function(mappedMidi) {
      var owners = sourcesByPitch.get(Number(mappedMidi));
      return owners ? owners.size : 0;
    },
  };
}

function createMidiPortBindingRegistry() {
  var bindings = new Map();
  var generation = 0;

  function unbindRecord(record) {
    if (record && record.port && record.port.onmidimessage === record.wrapper) {
      record.port.onmidimessage = null;
    }
  }

  return {
    beginGeneration: function() {
      generation += 1;
      return generation;
    },

    bind: function(port, handler) {
      if (!port || port.id == null || typeof handler !== 'function') return false;
      var id = String(port.id);
      var existing = bindings.get(id);
      if (existing && existing.port === port && existing.handler === handler) return false;
      if (existing) unbindRecord(existing);
      var boundGeneration = generation;
      var wrapper = function(event) {
        var current = bindings.get(id);
        if (!current || current.wrapper !== wrapper || current.generation !== boundGeneration) return;
        handler(event, port);
      };
      bindings.set(id, { port: port, handler: handler, wrapper: wrapper, generation: boundGeneration });
      port.onmidimessage = wrapper;
      return true;
    },

    unbind: function(portId) {
      var id = String(portId);
      var existing = bindings.get(id);
      if (!existing) return false;
      unbindRecord(existing);
      bindings.delete(id);
      return true;
    },

    retainOnly: function(portIds) {
      var keep = new Set((portIds || []).map(String));
      Array.from(bindings.keys()).forEach(function(id) {
        if (!keep.has(id)) this.unbind(id);
      }, this);
    },

    clear: function() {
      Array.from(bindings.values()).forEach(unbindRecord);
      bindings.clear();
      generation += 1;
    },

    size: function() { return bindings.size; },
    generation: function() { return generation; },
  };
}

if (typeof window !== 'undefined') {
  window.midiSourceKey = midiSourceKey;
  window.normalizeMidiSource = normalizeMidiSource;
  window.createMidiHeldState = createMidiHeldState;
  window.createMidiPortBindingRegistry = createMidiPortBindingRegistry;

  // midi.js loads this state module synchronously while the HTML parser is active.
  // Load the observed-structure adapter in the same parser turn so the existing
  // formatDetectedUstInlineHtml entry point is upgraded before MIDI events can fire.
  // This is dependency wiring only; no musical decision is made in the MIDI layer.
  if (typeof document !== 'undefined' && document.readyState === 'loading'
      && typeof window.padWebFormatObservedUstInlineHtml !== 'function') {
    document.write('<script src="pad-core/observed-structure.js?v=6.7.52"><\/script>');
    document.write('<script src="observed-ust-consumer.js?v=6.7.52"><\/script>');
  }
}

if (typeof module !== 'undefined') module.exports = {
  midiSourceKey,
  normalizeMidiSource,
  createMidiHeldState,
  createMidiPortBindingRegistry,
};
