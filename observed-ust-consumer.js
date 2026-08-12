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

function padWebObservedStructureModel(input) {
  input = input || {};
  if (typeof padAnalyzeObservedShellUst !== 'function') {
    return { available: false, reason: 'pad-core-observed-api-unavailable', shell: null, ust: null };
  }

  var chord = input.chord || {};
  if (!Number.isFinite(Number(chord.rootPC)) || !chord.quality) {
    return { available: false, reason: 'chord-context-incomplete', shell: null, ust: null };
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
    available: true,
    reason: null,
    chord: analysis.chord,
    shell: analysis.shell,
    ust: analysis.ust,
    positionEvidence: analysis.positionEvidence,
    // Keep final educational wording/styling out of the data model. Human Gate owns
    // the Push-visible presentation; tests can still assert exact musical structure.
    labels: {
      shellDegrees: analysis.shell ? analysis.shell.degrees.slice() : [],
      ustName: analysis.ust ? analysis.ust.name : null,
      ustDegrees: analysis.ust ? analysis.ust.degrees.slice() : [],
    },
  };
}

function padWebHasPhysicalPosition(sourceNotes) {
  return Array.isArray(sourceNotes) && sourceNotes.some(function(source) {
    if (!source) return false;
    return source.positionConfidence === 'exact'
      || source.positionConfidence === 'reconstructed'
      || (Number.isInteger(source.row) && Number.isInteger(source.col));
  });
}

function padWebFormatObservedUstInlineHtml(midiNotes, rootPC, chordName, sourceNotes) {
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

  var model = padWebObservedStructureModel({
    chord: { rootPC: rootPC, quality: baseQuality, name: chordName },
    midiNotes: midiNotes,
    sourceNotes: sourceNotes,
  });

  // Quartal naming is authoritative from the structured observed analysis. In
  // particular, the physical upper F-Bb-Eb over Cm7 is Q4; a lower shell C may
  // never be borrowed to manufacture legacy Q1.
  if (model.available && model.ust && model.ust.kind === 'quartal') {
    var rootName = typeof chordRootDisplayName === 'function' ? chordRootDisplayName(chordName) : '';
    var suffix = typeof detectedUstBaseQualitySuffix === 'function'
      ? detectedUstBaseQualitySuffix(baseQuality)
      : baseQuality;
    var baseName = rootName ? rootName + suffix : chordName;
    var text = 'UST: ' + model.ust.name;
    if (model.ust.degrees && model.ust.degrees.length) text += ' [' + model.ust.degrees.join(',') + ']';
    text += ' / ' + baseName;
    return formatFraction(text);
  }

  // Exact/reconstructed grid evidence outranks a pitch-class subset guess. If the
  // legacy detector sees a quartal UST but pad-core rejects the actual physical
  // upper geometry, suppress only that quartal guess. Triadic UST behavior stays
  // on the existing path.
  if (padWebHasPhysicalPosition(sourceNotes)
      && model.available
      && model.shell
      && /^UST:\s*Q/.test(legacyText)) {
    return '';
  }

  return formatFraction(legacyText);
}

if (typeof window !== 'undefined') {
  window.padWebNormalizeObservedSources = padWebNormalizeObservedSources;
  window.padWebObservedStructureModel = padWebObservedStructureModel;
  window.padWebHasPhysicalPosition = padWebHasPhysicalPosition;
  window.padWebFormatObservedUstInlineHtml = padWebFormatObservedUstInlineHtml;

  // theory.js is already loaded when the browser MIDI bootstrap loads this adapter.
  // Replace only the inline presentation entry point; raw legacy triadic helpers stay
  // intact and are used as the fallback inside padWebFormatObservedUstInlineHtml().
  if (!window.__padObservedUstFormatterInstalled && typeof window.formatDetectedUstInlineHtml === 'function') {
    window.formatDetectedUstInlineHtml = function(notes, rootPC, chordName, sourceNotes) {
      return padWebFormatObservedUstInlineHtml(notes, rootPC, chordName, sourceNotes);
    };
    window.__padObservedUstFormatterInstalled = true;
  }
}

if (typeof module !== 'undefined') module.exports = {
  padWebNormalizeObservedSources,
  padWebObservedStructureModel,
  padWebHasPhysicalPosition,
  padWebFormatObservedUstInlineHtml,
};
