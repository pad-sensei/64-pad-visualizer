// ========================================
// 64 PAD EXPLORER — observed Shell / UST thin consumer
// Theory decisions live in pad-core. This module only adapts source notes into a
// display-neutral model for the Web app.
// ========================================

function padWebNormalizeObservedSources(midiNotes, sourceNotes) {
  var sources = Array.isArray(sourceNotes) ? sourceNotes.filter(Boolean) : [];
  if (sources.length) {
    return sources.map(function(source) {
      return {
        midi: Number.isFinite(Number(source.mappedMidi)) ? Number(source.mappedMidi) : Number(source.midi),
        mappedMidi: Number.isFinite(Number(source.mappedMidi)) ? Number(source.mappedMidi) : Number(source.midi),
        rawNote: Number.isFinite(Number(source.rawNote)) ? Number(source.rawNote) : null,
        row: Number.isInteger(source.row) ? source.row : null,
        col: Number.isInteger(source.col) ? source.col : null,
        physicalPadId: source.physicalPadId != null ? String(source.physicalPadId) : null,
        sourceId: source.sourceId != null ? String(source.sourceId) : null,
        deviceId: source.deviceId != null ? String(source.deviceId) : null,
        positionConfidence: source.positionConfidence === 'exact' || source.positionConfidence === 'reconstructed'
          ? source.positionConfidence : 'none',
      };
    }).filter(function(source) { return Number.isFinite(source.midi); });
  }

  // Generic MIDI fallback is explicit about missing physical position. The theory
  // layer may use register evidence at lower confidence, but the Web app never
  // pretends these notes came from known pad coordinates.
  return (midiNotes || []).filter(function(midi) { return Number.isFinite(Number(midi)); }).map(function(midi, index) {
    midi = Number(midi);
    return {
      midi: midi,
      mappedMidi: midi,
      rawNote: midi,
      row: null,
      col: null,
      physicalPadId: null,
      sourceId: 'generic:' + index + ':' + midi,
      deviceId: 'generic-midi',
      positionConfidence: 'none',
    };
  });
}

function padWebEscapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function padWebObservedPayloadNote(note) {
  if (!note) return null;
  return {
    midi: Number(note.midi),
    pc: Number(note.pc),
    degree: note.degree || null,
    row: Number.isInteger(note.row) ? note.row : null,
    col: Number.isInteger(note.col) ? note.col : null,
    physicalPadId: note.physicalPadId != null ? String(note.physicalPadId) : null,
    sourceId: note.sourceId != null ? String(note.sourceId) : null,
    deviceId: note.deviceId != null ? String(note.deviceId) : null,
    rawNote: Number.isFinite(Number(note.rawNote)) ? Number(note.rawNote) : null,
    mappedMidi: Number.isFinite(Number(note.mappedMidi)) ? Number(note.mappedMidi) : Number(note.midi),
    positionConfidence: note.positionConfidence === 'exact' || note.positionConfidence === 'reconstructed'
      ? note.positionConfidence : 'none',
  };
}

function padWebObservedPayloadLayer(layer) {
  if (!layer) return null;
  return {
    kind: layer.kind || null,
    name: layer.name || null,
    degrees: Array.isArray(layer.degrees) ? layer.degrees.slice() : [],
    confidence: layer.confidence || 'none',
    positionConfidence: layer.positionConfidence || 'none',
    notes: Array.isArray(layer.notes) ? layer.notes.map(padWebObservedPayloadNote).filter(Boolean) : [],
  };
}

// Canonical bridge for Web and Desktop Push. This is deliberately plain data:
// naming, localisation, HTML, and platform-specific labels are consumers' work.
function padBuildObservedShellUstPayload(input) {
  input = input || {};
  var empty = {
    schema: 'pad-observed-shell-ust',
    version: 1,
    available: false,
    reason: null,
    chord: { name: null, rootPC: null, quality: null },
    shell: null,
    ust: null,
    positionEvidence: 'none',
    sourceConfidence: 'none',
    tensions: [],
    register: null,
  };
  if (typeof padAnalyzeObservedShellUst !== 'function') {
    empty.reason = 'pad-core-observed-api-unavailable';
    return empty;
  }

  var chord = input.chord || {};
  if (!Number.isFinite(Number(chord.rootPC)) || !chord.quality) {
    empty.reason = 'chord-context-incomplete';
    return empty;
  }

  var notes = padWebNormalizeObservedSources(input.midiNotes || [], input.sourceNotes || []);
  var analysis = padAnalyzeObservedShellUst({
    chord: {
      rootPC: Number(chord.rootPC),
      quality: chord.quality,
      name: chord.name || null,
    },
    notes: notes,
  });

  return {
    schema: 'pad-observed-shell-ust',
    version: 1,
    available: true,
    reason: null,
    chord: { name: analysis.chord.name || null, rootPC: analysis.chord.rootPC, quality: analysis.chord.quality || null },
    shell: padWebObservedPayloadLayer(analysis.shell),
    ust: padWebObservedPayloadLayer(analysis.ust),
    positionEvidence: analysis.positionEvidence || 'none',
    // This expresses the provenance of the held sources independently from the
    // shell/UST inference confidence (physical vs register).
    sourceConfidence: analysis.positionEvidence || 'none',
    tensions: [],
    register: null,
  };
}

// Core owns chord/tension/register semantics. This boundary accepts only its
// structured output and deliberately does not infer labels from a chord name.
function padWebAttachCoreStructure(payload, structure) {
  payload = payload || {};
  structure = structure || {};
  var labels = Array.isArray(structure.tensionLabels) ? structure.tensionLabels : [];
  var intervals = Array.isArray(structure.tensionIntervals) ? structure.tensionIntervals : [];
  var validLabel = function(label) { return typeof label === 'string' && label.length > 0 && label.length <= 16 && /^(?:[b#]?(?:5|6|7|9|11|13)|add9|sus4|aug)$/.test(label); };
  var validInterval = function(interval) { return Number.isInteger(interval) && interval >= 0 && interval <= 127; };
  payload.tensions = labels.length <= 8 && labels.length === intervals.length && labels.every(validLabel)
    && intervals.every(validInterval) ? labels.map(function(label, index) {
      return { label: label, interval: Number(intervals[index]) };
    }) : [];
  var register = structure.register;
  payload.register = register && typeof register.explicit === 'boolean' && Array.isArray(register.intervals)
    && register.intervals.length <= 8 && register.intervals.every(validInterval)
    ? { explicit: register.explicit, intervals: register.intervals.map(Number) } : null;
  return payload;
}

function padWebBuildCanonicalChordPayload(input) {
  input = input || {};
  var payload = padBuildObservedShellUstPayload(input);
  return padWebAttachCoreStructure(payload, input.coreStructure || null);
}

// Compatibility alias for existing Web callers. It now returns the canonical data
// payload; callers must not use this as a presentation model.
function padWebObservedStructureModel(input) {
  return padBuildObservedShellUstPayload(input);
}

function padWebHasPhysicalPosition(sourceNotes) {
  return Array.isArray(sourceNotes) && sourceNotes.some(function(source) {
    if (!source) return false;
    return source.positionConfidence === 'exact'
      || source.positionConfidence === 'reconstructed'
      || (Number.isInteger(source.row) && Number.isInteger(source.col));
  });
}

var padWebLatestObservedShellUstPayload = null;

function padWebSetLatestObservedShellUstPayload(payload) {
  // The Desktop bridge reads this JSON-safe snapshot; it never asks Web to
  // reconstruct a theory label from DOM text or recalculate the analysis.
  padWebLatestObservedShellUstPayload = payload || null;
  return padWebLatestObservedShellUstPayload;
}

function padWebGetLatestObservedShellUstPayload() {
  return padWebLatestObservedShellUstPayload;
}

function padWebFormatObservedUstInlineFromPayload(payload, legacyText) {
  var formatFraction = typeof formatDetectedUstFractionHtml === 'function'
    ? formatDetectedUstFractionHtml : function(text) { return text || ''; };
  if (!payload || !payload.available) return formatFraction(legacyText || '');
  if (!payload.ust || payload.ust.kind !== 'quartal') {
    // Physical evidence may reject a legacy quartal subset, but never suppress a
    // separate legacy triadic interpretation.
    if (payload.shell && payload.shell.positionConfidence !== 'none' && /^UST:\s*Q/.test(legacyText || '')) return '';
    return formatFraction(legacyText || '');
  }
  var baseQuality = payload.chord && payload.chord.quality;
  var chordName = payload.chord && payload.chord.name || '';
  var rootName = typeof chordRootDisplayName === 'function' ? chordRootDisplayName(chordName) : '';
  var suffix = typeof detectedUstBaseQualitySuffix === 'function'
    ? detectedUstBaseQualitySuffix(baseQuality) : baseQuality;
  var baseName = rootName ? rootName + suffix : chordName;
  var text = 'UST: ' + padWebEscapeHtml(payload.ust.name);
  if (payload.ust.degrees && payload.ust.degrees.length) text += ' [' + payload.ust.degrees.map(padWebEscapeHtml).join(',') + ']';
  text += ' / ' + padWebEscapeHtml(baseName);
  return formatFraction(text);
}

function padWebFormatObservedUstInlineHtml(midiNotes, rootPC, chordName, sourceNotes, payload) {
  var legacyText = typeof formatDetectedUstText === 'function'
    ? formatDetectedUstText(midiNotes, rootPC, chordName)
    : '';
  var formatFraction = typeof formatDetectedUstFractionHtml === 'function'
    ? formatDetectedUstFractionHtml
    : function(text) { return text || ''; };
  var baseQuality = typeof detectedUstBaseQuality === 'function'
    ? detectedUstBaseQuality(chordName)
    : '';

  if (!baseQuality) return formatFraction(legacyText);

  payload = payload || padBuildObservedShellUstPayload({
    chord: { rootPC: rootPC, quality: baseQuality, name: chordName }, midiNotes: midiNotes, sourceNotes: sourceNotes,
  });

  // Quartal naming is authoritative from the structured observed analysis. In
  // particular, the physical upper F-Bb-Eb over Cm7 is Q4; a lower shell C may
  // never be borrowed to manufacture legacy Q1.
  return padWebFormatObservedUstInlineFromPayload(payload, legacyText);
}

function padWebFormatObservedStructureHtml(payload) {
  if (!payload || !payload.available) return '';
  var label = padWebEscapeHtml(typeof t === 'function' ? t('help.observed_chord') : 'Chord');
  var shellLabel = padWebEscapeHtml(typeof t === 'function' ? t('help.observed_shell') : 'Shell');
  var ustLabel = padWebEscapeHtml(typeof t === 'function' ? t('help.observed_ust') : 'UST');
  var parts = [];
  if (payload.chord && payload.chord.name) parts.push(label + ': ' + padWebEscapeHtml(payload.chord.name));
  if (payload.shell) parts.push(shellLabel + ': ' + (payload.shell.degrees || []).map(padWebEscapeHtml).join(','));
  if (payload.ust) parts.push(ustLabel + ': ' + padWebEscapeHtml(payload.ust.name) + ' [' + (payload.ust.degrees || []).map(padWebEscapeHtml).join(',') + ']');
  return parts.length ? '<div class="midi-observed-structure">' + parts.join(' · ') + '</div>' : '';
}

if (typeof window !== 'undefined') {
  window.padWebNormalizeObservedSources = padWebNormalizeObservedSources;
  window.padBuildObservedShellUstPayload = padBuildObservedShellUstPayload;
  window.padWebBuildCanonicalChordPayload = padWebBuildCanonicalChordPayload;
  window.padWebObservedStructureModel = padWebObservedStructureModel;
  window.padWebAttachCoreStructure = padWebAttachCoreStructure;
  window.padWebSetLatestObservedShellUstPayload = padWebSetLatestObservedShellUstPayload;
  window.padWebGetLatestObservedShellUstPayload = padWebGetLatestObservedShellUstPayload;
  window.padWebHasPhysicalPosition = padWebHasPhysicalPosition;
  window.padWebFormatObservedUstInlineHtml = padWebFormatObservedUstInlineHtml;
  window.padWebFormatObservedUstInlineFromPayload = padWebFormatObservedUstInlineFromPayload;
  window.padWebFormatObservedStructureHtml = padWebFormatObservedStructureHtml;

  // theory.js is already loaded when the browser MIDI bootstrap loads this adapter.
  // Replace only the inline presentation entry point; raw legacy triadic helpers stay
  // intact and are used as the fallback inside padWebFormatObservedUstInlineHtml().
  if (!window.__padObservedUstFormatterInstalled && typeof window.formatDetectedUstInlineHtml === 'function') {
    window.formatDetectedUstInlineHtml = function(notes, rootPC, chordName, sourceNotes, payload) {
      return padWebFormatObservedUstInlineHtml(notes, rootPC, chordName, sourceNotes, payload);
    };
    window.__padObservedUstFormatterInstalled = true;
  }
}

if (typeof module !== 'undefined') module.exports = {
  padWebNormalizeObservedSources,
  padWebEscapeHtml,
  padBuildObservedShellUstPayload,
  padWebBuildCanonicalChordPayload,
  padWebObservedStructureModel,
  padWebAttachCoreStructure,
  padWebSetLatestObservedShellUstPayload,
  padWebGetLatestObservedShellUstPayload,
  padWebHasPhysicalPosition,
  padWebFormatObservedUstInlineHtml,
  padWebFormatObservedUstInlineFromPayload,
  padWebFormatObservedStructureHtml,
};
