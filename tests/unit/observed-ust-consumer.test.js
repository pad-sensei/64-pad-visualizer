import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const observed = require('../../pad-core/observed-structure.js');
Object.assign(globalThis, observed);
const {
  padWebNormalizeObservedSources,
  padWebObservedStructureModel,
  padWebFormatObservedUstInlineHtml,
} = require('../../observed-ust-consumer.js');

function pushSource(mappedMidi, row, col, physicalPadId) {
  return {
    deviceId: 'push-3',
    sourceId: `push-3:${physicalPadId}`,
    rawNote: 36 + row * 8 + col,
    mappedMidi,
    row,
    col,
    physicalPadId,
    positionConfidence: 'exact',
  };
}

const canonicalCm7Q4 = () => [
  pushSource(60, 0, 0, 'shell-c'),
  pushSource(63, 0, 3, 'shell-eb'),
  pushSource(70, 2, 0, 'shell-bb'),
  pushSource(77, 3, 2, 'upper-f'),
  pushSource(82, 4, 2, 'upper-bb'),
  pushSource(87, 5, 2, 'upper-eb'),
];

function withLegacyFormatter(stubs, fn) {
  const keys = [
    'formatDetectedUstText',
    'formatDetectedUstFractionHtml',
    'detectedUstBaseQuality',
    'chordRootDisplayName',
    'detectedUstBaseQualitySuffix',
  ];
  const previous = new Map(keys.map(key => [key, globalThis[key]]));
  Object.assign(globalThis, {
    formatDetectedUstText: () => '',
    formatDetectedUstFractionHtml: text => text ? `<fraction>${text}</fraction>` : '',
    detectedUstBaseQuality: () => 'm7',
    chordRootDisplayName: () => 'C',
    detectedUstBaseQualitySuffix: () => 'm7',
  }, stubs || {});
  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (previous.get(key) === undefined) delete globalThis[key];
      else globalThis[key] = previous.get(key);
    }
  }
}

describe('Web observed Shell/UST consumer', () => {
  it('preserves exact Push source metadata into the pad-core analysis', () => {
    const sources = canonicalCm7Q4();
    const normalized = padWebNormalizeObservedSources(sources.map(s => s.mappedMidi), sources);
    expect(normalized).toEqual(sources.map(s => expect.objectContaining({
      deviceId: s.deviceId,
      sourceId: s.sourceId,
      rawNote: s.rawNote,
      mappedMidi: s.mappedMidi,
      row: s.row,
      col: s.col,
      physicalPadId: s.physicalPadId,
      positionConfidence: 'exact',
    })));
  });

  it('reports the actual upper F-Bb-Eb as Q4 and never borrows the shell root', () => {
    const sources = canonicalCm7Q4();
    const model = padWebObservedStructureModel({
      chord: { rootPC: 0, quality: 'm7', name: 'Cm7' },
      midiNotes: sources.map(s => s.mappedMidi),
      sourceNotes: sources,
    });

    expect(model.available).toBe(true);
    expect(model.labels.shellDegrees).toEqual(['R', 'm3', 'b7']);
    expect(model.labels.ustName).toBe('Q4');
    expect(model.labels.ustDegrees).toEqual(['11', 'b7', 'm3']);
    expect(model.ust.confidence).toBe('physical');
    expect(model.ust.notes.map(n => n.physicalPadId)).toEqual(['upper-f', 'upper-bb', 'upper-eb']);
    expect(model.ust.notes.some(n => n.physicalPadId === 'shell-c')).toBe(false);
  });

  it('does not pretend generic MIDI has absolute pad position', () => {
    const normalized = padWebNormalizeObservedSources([60, 63, 70, 77, 82, 87], []);
    expect(normalized.every(n => n.row === null && n.col === null && n.positionConfidence === 'none')).toBe(true);

    const model = padWebObservedStructureModel({
      chord: { rootPC: 0, quality: 'm7', name: 'Cm7' },
      midiNotes: [60, 63, 70, 77, 82, 87],
      sourceNotes: [],
    });
    expect(model.ust.name).toBe('Q4');
    expect(model.ust.confidence).toBe('register');
  });

  it('never returns a Shell/UST source identity that was not actually held', () => {
    const sources = canonicalCm7Q4();
    const sourceIds = new Set(sources.map(s => s.sourceId));
    const model = padWebObservedStructureModel({
      chord: { rootPC: 0, quality: 'm7', name: 'Cm7' },
      sourceNotes: sources,
    });
    for (const layer of [model.shell, model.ust]) {
      for (const note of layer.notes) expect(sourceIds.has(note.sourceId)).toBe(true);
    }
  });

  it('formats physical Q4 from the structured model even when legacy pitch subsets prefer Q1', () => {
    const sources = canonicalCm7Q4();
    const html = withLegacyFormatter({
      formatDetectedUstText: () => 'UST: Q1 [1,11,b7] / Cm7',
    }, () => padWebFormatObservedUstInlineHtml(
      sources.map(s => s.mappedMidi), 0, 'Cm7(11)', sources
    ));

    expect(html).toContain('Q4 [11,b7,m3] / Cm7');
    expect(html).not.toContain('Q1');
  });

  it('suppresses a legacy quartal guess when exact physical upper geometry rejects it', () => {
    const sources = canonicalCm7Q4();
    const upperEb = sources.find(s => s.physicalPadId === 'upper-eb');
    upperEb.row = 4;
    upperEb.col = 7;

    const html = withLegacyFormatter({
      formatDetectedUstText: () => 'UST: Q1 [1,11,b7] / Cm7',
    }, () => padWebFormatObservedUstInlineHtml(
      sources.map(s => s.mappedMidi), 0, 'Cm7', sources
    ));

    expect(html).toBe('');
  });

  it('preserves legacy triadic UST formatting when the structured quartal layer is absent', () => {
    const sources = canonicalCm7Q4().slice(0, 3);
    const html = withLegacyFormatter({
      formatDetectedUstText: () => 'UST: Dm (II) [9,11,13] / Cm7',
    }, () => padWebFormatObservedUstInlineHtml(
      sources.map(s => s.mappedMidi), 0, 'Cm7', sources
    ));

    expect(html).toBe('<fraction>UST: Dm (II) [9,11,13] / Cm7</fraction>');
  });
});
