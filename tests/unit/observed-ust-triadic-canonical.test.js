import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../../pad-core/observed-structure.js'));
const {
  padWebParseLegacyTriadicUstLayer,
  padBuildObservedShellUstPayload,
  padWebFormatObservedUstInlineFromPayload,
} = require('../../observed-ust-consumer.js');

function withLegacyFormatter(text, fn) {
  const previous = {
    formatDetectedUstText: globalThis.formatDetectedUstText,
    formatDetectedUstFractionHtml: globalThis.formatDetectedUstFractionHtml,
    detectedUstBaseQualitySuffix: globalThis.detectedUstBaseQualitySuffix,
    chordRootDisplayName: globalThis.chordRootDisplayName,
  };
  Object.assign(globalThis, {
    formatDetectedUstText: () => text,
    formatDetectedUstFractionHtml: value => value,
    detectedUstBaseQualitySuffix: quality => quality || '',
    chordRootDisplayName: () => 'C',
  });
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

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
  pushSource(48, 0, 0, 'shell-c'),
  pushSource(51, 0, 3, 'shell-eb'),
  pushSource(58, 1, 5, 'shell-bb'),
  pushSource(65, 3, 2, 'upper-f'),
  pushSource(70, 4, 2, 'upper-bb'),
  pushSource(75, 5, 2, 'upper-eb'),
];

describe('triadic UST canonical bridge', () => {
  it('parses authored triadic UST text but rejects legacy Q guesses', () => {
    expect(padWebParseLegacyTriadicUstLayer('UST: D△ (II) [9,#11,13] / C7')).toEqual({
      kind: 'triad',
      name: 'D△ (II)',
      base: 'C7',
      degrees: ['9', '#11', '13'],
      confidence: 'register',
      positionConfidence: 'none',
      notes: [],
    });
    expect(padWebParseLegacyTriadicUstLayer('UST: Q1 [1,11,b7] / Cm7')).toBeNull();
  });

  it('carries an ordinary triadic UST in the JSON-safe canonical payload', () => {
    const payload = withLegacyFormatter('UST: D△ (II) [9,#11,13] / C7', () =>
      padBuildObservedShellUstPayload({
        chord: { rootPC: 0, quality: '7', name: 'C7' },
        midiNotes: [48, 52, 58, 62, 66, 69],
      }));

    expect(payload.ust).toMatchObject({
      kind: 'triad',
      name: 'D△ (II)',
      base: 'C7',
      degrees: ['9', '#11', '13'],
    });
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    expect(withLegacyFormatter('', () => padWebFormatObservedUstInlineFromPayload(payload)))
      .toContain('D△ (II) [9,#11,13] / C7');
  });

  it('keeps exact physical quartal analysis authoritative over legacy triadic text', () => {
    const payload = withLegacyFormatter('UST: Dm (II) [9,11,13] / Cm7', () =>
      padBuildObservedShellUstPayload({
        chord: { rootPC: 0, quality: 'm7', name: 'Cm7' },
        sourceNotes: canonicalCm7Q4(),
      }));

    expect(payload.ust).toMatchObject({
      kind: 'quartal',
      name: 'Q4',
      base: 'Cm7',
      degrees: ['11', 'b7', 'm3'],
      confidence: 'physical',
      positionConfidence: 'exact',
    });
  });
});
