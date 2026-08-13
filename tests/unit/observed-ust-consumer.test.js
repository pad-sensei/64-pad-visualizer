import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const observed = require('../../pad-core/observed-structure.js');
Object.assign(globalThis, observed);
const {
  padWebNormalizeObservedSources,
  padBuildObservedShellUstPayload,
  padWebEscapeHtml,
  padWebFormatObservedStructureHtml,
  padWebFormatObservedUstInlineFromPayload,
  padWebSetLatestObservedShellUstPayload,
  padWebGetLatestObservedShellUstPayload,
  padWebAttachCoreStructure,
  padWebBuildCanonicalChordPayload,
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
  pushSource(48, 0, 0, 'shell-c'),
  pushSource(51, 0, 3, 'shell-eb'),
  pushSource(58, 1, 5, 'shell-bb'),
  pushSource(65, 3, 2, 'upper-f'),
  pushSource(70, 4, 2, 'upper-bb'),
  pushSource(75, 5, 2, 'upper-eb'),
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
  it('accepts only structured core tensions and register evidence without chord-name parsing', () => {
    const base = padBuildObservedShellUstPayload({
      chord: { rootPC: 0, quality: 'dim7', name: 'Cdim7(11,13)' }, midiNotes: [60, 63, 66, 69],
    });
    const payload = padWebAttachCoreStructure(base, {
      tensionLabels: ['11', '13'], tensionIntervals: [17, 21],
      register: { explicit: true, intervals: [21] },
    });
    expect(payload).toMatchObject({
      schema: 'pad-observed-shell-ust', version: 1,
      tensions: [{ label: '11', interval: 17 }, { label: '13', interval: 21 }],
      register: { explicit: true, intervals: [21] },
    });
    expect(JSON.stringify(payload)).not.toContain('9');
  });

  it('puts a detected core candidate into the canonical payload without label inference', () => {
    const payload = padWebBuildCanonicalChordPayload({
      chord: { rootPC: 0, quality: 'dim7', name: 'Cdim7(9,11)' }, midiNotes: [48, 51, 54, 57, 62, 65],
      coreStructure: {
        tensionLabels: ['9', '11'], tensionIntervals: [14, 17],
        register: { explicit: false, intervals: [] },
      },
    });
    expect(payload.tensions).toEqual([{ label: '9', interval: 14 }, { label: '11', interval: 17 }]);
    expect(payload.register).toEqual({ explicit: false, intervals: [] });
  });

  it('keeps a dim7 candidate structured even when UST quality has no fallback', () => {
    const payload = padWebBuildCanonicalChordPayload({
      chord: { rootPC: 0, quality: 'dim7', name: 'Cdim7(11)' }, midiNotes: [48, 51, 54, 57, 65],
      coreStructure: {
        tensionLabels: ['11'], tensionIntervals: [17], register: { explicit: false, intervals: [] },
      },
    });
    expect(payload).toMatchObject({
      available: true, chord: { quality: 'dim7', name: 'Cdim7(11)' },
      tensions: [{ label: '11', interval: 17 }],
    });
  });

  it('uses actual core dim7 candidate structure for 11 and 9,11 without inventing 13', () => {
    const single11 = padDetectChord([48, 51, 54, 57, 65])[0];
    const double911 = padDetectChord([48, 51, 54, 57, 62, 65])[0];
    for (const candidate of [single11, double911]) {
      const payload = padWebBuildCanonicalChordPayload({
        chord: { rootPC: candidate.rootPC, quality: candidate.quality, name: candidate.name },
        midiNotes: [], coreStructure: candidate,
      });
      expect(payload.tensions.map(t => t.label)).not.toContain('13');
      expect(payload.register).toEqual({ explicit: false, intervals: [] });
    }
    expect(single11.name).toBe('Cdim7(11)');
    expect(double911.name).toBe('Cdim7(9,11)');
  });

  it('keeps the core dim7 natural 7 extension in the structured payload', () => {
    const candidate = padDetectChord([48, 51, 54, 57, 71])[0];
    expect(candidate.name).toBe('Cdim7(7)');
    const payload = padWebBuildCanonicalChordPayload({
      chord: { rootPC: candidate.rootPC, quality: candidate.quality, name: candidate.name },
      midiNotes: [], coreStructure: candidate,
    });
    expect(payload.tensions).toEqual([{ label: '7', interval: 23 }]);
  });

  it('drops malformed core structure rather than inventing tension or register evidence', () => {
    const payload = padWebAttachCoreStructure({ schema: 'pad-observed-shell-ust', version: 1 }, {
      tensionLabels: [11], tensionIntervals: ['21'], register: { explicit: 'true', intervals: ['21'] },
    });
    expect(payload.tensions).toEqual([]);
    expect(payload.register).toBeNull();
  });

  it('rejects out-of-contract core structure bounds and labels', () => {
    const payload = padWebAttachCoreStructure({ schema: 'pad-observed-shell-ust', version: 1 }, {
      tensionLabels: ['not-a-tension'], tensionIntervals: [128],
      register: { explicit: false, intervals: Array(9).fill(21) },
    });
    expect(payload.tensions).toEqual([]);
    expect(payload.register).toBeNull();
  });
  it('escapes payload and translated display text without changing its plain content', () => {
    const payload = {
      available: true,
      chord: { name: '<img src=x onerror=alert(1)>', rootPC: 0, quality: 'm7' },
      shell: { degrees: ['<b>R</b>'] },
      ust: { name: '<svg/onload=alert(1)>', degrees: ['<i>11</i>'] },
    };
    const previousT = globalThis.t;
    globalThis.t = () => '<img src=x onerror=alert(1)>';
    try {
      const html = padWebFormatObservedStructureHtml(payload);
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<svg');
      expect(html).toContain('&lt;img');
      expect(html).toContain('&lt;svg');
      expect(padWebEscapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    } finally {
      if (previousT === undefined) delete globalThis.t;
      else globalThis.t = previousT;
    }
  });
  it('builds a versioned JSON-safe payload for the physical Cm7 Q4 fixture', () => {
    const sources = canonicalCm7Q4();
    const payload = padBuildObservedShellUstPayload({
      chord: { rootPC: 0, quality: 'm7', name: 'Cm7' },
      sourceNotes: sources,
    });

    expect(payload).toMatchObject({
      schema: 'pad-observed-shell-ust',
      version: 1,
      chord: { name: 'Cm7', rootPC: 0, quality: 'm7' },
      shell: { degrees: ['R', 'm3', 'b7'], confidence: 'physical', positionConfidence: 'exact' },
      ust: { kind: 'quartal', name: 'Q4', degrees: ['11', 'b7', 'm3'], confidence: 'physical', positionConfidence: 'exact' },
      positionEvidence: 'exact',
      sourceConfidence: 'exact',
    });
    expect(payload.ust.notes.map(note => note.physicalPadId)).toEqual(['upper-f', 'upper-bb', 'upper-eb']);
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    expect(JSON.stringify(payload)).not.toContain('Q1');
  });

  it('formats an already-built payload without another analysis and exposes that exact snapshot', () => {
    const original = globalThis.padAnalyzeObservedShellUst;
    let calls = 0;
    globalThis.padAnalyzeObservedShellUst = function(input) { calls += 1; return original(input); };
    try {
      const payload = padBuildObservedShellUstPayload({
        chord: { rootPC: 0, quality: 'm7', name: 'Cm7' }, sourceNotes: canonicalCm7Q4(),
      });
      expect(calls).toBe(1);
      expect(padWebFormatObservedUstInlineFromPayload(payload)).toContain('Q4');
      expect(calls).toBe(1);
      expect(padWebGetLatestObservedShellUstPayload()).toBe(null);
      expect(padWebSetLatestObservedShellUstPayload(payload)).toBe(payload);
      expect(padWebGetLatestObservedShellUstPayload()).toBe(payload);
    } finally {
      globalThis.padAnalyzeObservedShellUst = original;
      padWebSetLatestObservedShellUstPayload(null);
    }
  });

  it('keeps a precomputed legacy triadic UST when canonical quartal is absent', () => {
    const payload = { available: true, chord: { name: 'Cm7' }, shell: { positionConfidence: 'exact' }, ust: null };
    const html = padWebFormatObservedUstInlineFromPayload(payload, 'UST: Dm (II) [9,11,13] / Cm7');
    expect(html).toContain('Dm (II) [9,11,13]');
    expect(html).toContain('Cm7');
  });

  it('keeps Q4 when a higher duplicate root is also held', () => {
    const sources = canonicalCm7Q4();
    sources.push(pushSource(60, 2, 2, 'upper-c'));
    const payload = padBuildObservedShellUstPayload({
      chord: { rootPC: 0, quality: 'm7', name: 'Cm7' }, sourceNotes: sources,
    });
    expect(payload.ust).toMatchObject({ name: 'Q4', degrees: ['11', 'b7', 'm3'] });
  });

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
    expect(model.shell.degrees).toEqual(['R', 'm3', 'b7']);
    expect(model.ust.name).toBe('Q4');
    expect(model.ust.degrees).toEqual(['11', 'b7', 'm3']);
    expect(model.ust.confidence).toBe('physical');
    expect(model.ust.notes.map(n => n.physicalPadId)).toEqual(['upper-f', 'upper-bb', 'upper-eb']);
    expect(model.ust.notes.some(n => n.physicalPadId === 'shell-c')).toBe(false);
  });

  it('does not pretend generic MIDI has absolute pad position', () => {
    const normalized = padWebNormalizeObservedSources([48, 51, 58, 65, 70, 75], []);
    expect(normalized.every(n => n.row === null && n.col === null && n.positionConfidence === 'none')).toBe(true);

    const model = padWebObservedStructureModel({
      chord: { rootPC: 0, quality: 'm7', name: 'Cm7' },
      midiNotes: [48, 51, 58, 65, 70, 75],
      sourceNotes: [],
    });
    expect(model.ust.name).toBe('Q4');
    expect(model.ust.confidence).toBe('register');
    expect(padBuildObservedShellUstPayload({
      chord: { rootPC: 0, quality: 'm7', name: 'Cm7' },
      midiNotes: [48, 51, 58, 65, 70, 75],
    })).toMatchObject({ sourceConfidence: 'none', ust: { confidence: 'register', positionConfidence: 'none' } });
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
