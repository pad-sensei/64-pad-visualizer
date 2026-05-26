import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// All constants available via globalThis (setup.js)
const stockVoicings = JSON.parse(readFileSync(new URL('../../data/stock-voicings.json', import.meta.url), 'utf8'));

describe('SCALES', () => {
  it('contains 31 scales', () => {
    expect(SCALES).toHaveLength(31);
  });

  it('each scale has valid pcs (0-11, sorted, no duplicates)', () => {
    SCALES.forEach((scale, idx) => {
      // All pcs in range
      scale.pcs.forEach(pc => {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThan(12);
      });
      // Sorted
      for (let i = 1; i < scale.pcs.length; i++) {
        expect(scale.pcs[i]).toBeGreaterThan(scale.pcs[i - 1]);
      }
      // No duplicates (sorted + strictly increasing → guaranteed)
      expect(new Set(scale.pcs).size).toBe(scale.pcs.length);
    });
  });

  it('each scale has required properties', () => {
    SCALES.forEach(scale => {
      expect(scale).toHaveProperty('id');
      expect(scale).toHaveProperty('name');
      expect(scale).toHaveProperty('pcs');
      expect(scale).toHaveProperty('cn');
      expect(typeof scale.id).toBe('number');
      expect(typeof scale.name).toBe('string');
      expect(Array.isArray(scale.pcs)).toBe(true);
    });
  });

  it('all scales start with 0 (root)', () => {
    SCALES.forEach(scale => {
      expect(scale.pcs[0]).toBe(0);
    });
  });

  it('diatonic modes have 7 notes', () => {
    // First 7 scales (cat=○) are diatonic
    SCALES.filter(s => s.cat === '○').forEach(scale => {
      expect(scale.pcs).toHaveLength(7);
    });
  });
});

describe('BUILDER_QUALITIES', () => {
  it('is a 4x3 grid', () => {
    expect(BUILDER_QUALITIES).toHaveLength(4);
    BUILDER_QUALITIES.forEach(row => {
      expect(row).toHaveLength(3);
    });
  });

  it('each quality has name, label, and valid pcs', () => {
    BUILDER_QUALITIES.flat().forEach(q => {
      expect(q).toHaveProperty('name');
      expect(q).toHaveProperty('label');
      expect(q).toHaveProperty('pcs');
      expect(typeof q.name).toBe('string');
      expect(typeof q.label).toBe('string');
      // pcs are sorted and in range
      q.pcs.forEach(pc => {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThan(12);
      });
      for (let i = 1; i < q.pcs.length; i++) {
        expect(q.pcs[i]).toBeGreaterThan(q.pcs[i - 1]);
      }
    });
  });

  it('all qualities start with root (0)', () => {
    BUILDER_QUALITIES.flat().forEach(q => {
      expect(q.pcs[0]).toBe(0);
    });
  });
});

describe('TASTY functional chord display', () => {
  it('uses only the three functional seventh families', () => {
    expect(getTastyCategory({ pcs: [0, 4, 7, 11] })).toBe('major');
    expect(getTastyCategory({ pcs: [0, 3, 7, 10] })).toBe('minor');
    expect(getTastyCategory({ pcs: [0, 4, 7, 10] })).toBe('dominant');
    expect(getTastyCategory({ pcs: [0, 4, 7, 9] })).toBe(null);
    expect(getTastyCategory({ pcs: [0, 3, 7, 11] })).toBe(null);
    expect(getTastyCategory({ pcs: [0, 3, 6, 10] })).toBe(null);
  });

  it('keeps TASTY labels fixed even when the voicing includes tensions', () => {
    expect(getTastyFunctionQualityName({ name: 'Maj7(9)', pcs: [0, 4, 7, 11, 2] })).toBe('Maj7');
    expect(getTastyFunctionQualityName({ name: 'm7(11)', pcs: [0, 3, 7, 10, 5] })).toBe('m7');
    expect(getTastyFunctionQualityName({ name: '7(9,13)', pcs: [0, 4, 7, 10, 2, 9] })).toBe('7');
  });

  it('raises playback by octaves only when the voicing is too low', () => {
    expect(getPracticalVoicingAudioNotes([36, 43, 52, 59, 62], { low: 43 })).toEqual([48, 55, 64, 71, 74]);
    expect(getPracticalVoicingAudioNotes([48, 55, 64, 71, 74], { low: 43 })).toEqual([48, 55, 64, 71, 74]);
    expect(getPracticalVoicingAudioNotes([59, 70, 75, 82, 94], { low: 43 })).toEqual([59, 70, 75, 82, 94]);
  });

  it('keeps HPS playback above Ableton C2 without lowering high voicings', () => {
    expect(getTastyPlaybackNotes([48, 55, 64, 71])).toEqual([48, 55, 64, 71]);
    expect(getStockPlaybackNotes([43, 50, 59, 64])).toEqual([55, 62, 71, 76]);
    expect(getStockPlaybackNotes([60, 67, 76, 83])).toEqual([60, 67, 76, 83]);
  });

  it('shows the active HPS voicing index and description before notes', () => {
    expect(formatActiveVoicingSummary({
      kind: 'Stock',
      count: '10/15',
      sourceName: 'Kenny Barron Voicing',
      noteText: 'D A F C G',
      degreeText: '1 5 b3 b7 11',
    })).toBe('STOCK 10/15 · Kenny Barron Voicing\nNote: D A F C G\nDegree: 1 5 b3 b7 11');
  });

  it('fits TASTY voicings to a visible pad octave range', () => {
    AppState.octaveShift = -1;
    AppState.semitoneShift = 0;
    expect(getTastyFitOctaveShift([48, 55, 64, 71, 74])).toBe(1);

    AppState.octaveShift = 0;
    expect(getTastyFitOctaveShift([72, 79, 88, 95])).toBe(3);

    AppState.octaveShift = 1;
    expect(getTastyFitOctaveShift([48, 55, 64, 71, 74])).toBe(1);
    AppState.octaveShift = 0;
  });

  it('fits STOCK left/right hand voicings to a visible pad octave range', () => {
    AppState.octaveShift = 2;
    AppState.semitoneShift = 0;
    expect(getStockFitOctaveShift([36, 43, 52, 59])).toBe(0);

    AppState.octaveShift = -1;
    expect(getStockFitOctaveShift([47, 54, 64, 71, 83])).toBe(1);

    AppState.octaveShift = 0;
  });
});

describe('Stock voicing quality mapping', () => {
  it('supports builder major seventh names used by the UI', () => {
    expect(getStockMapping({ name: 'Maj7' })).toEqual({ cat: 'major', sub: 'Maj7' });
    expect(getStockMapping({ name: 'Maj7(9)' })).toEqual({ cat: 'major', sub: 'Maj9' });
  });

  it('keeps extended families clickable from the builder', () => {
    expect(getStockMapping({ name: 'm7(9,11)' })).toEqual({ cat: 'minor', sub: 'Min11' });
    expect(getStockMapping({ name: '7(b9,#11,13)' })).toEqual({ cat: 'dominant', sub: 'Dom7' });
    expect(getStockMapping({ name: '7sus4(9,13)' })).toEqual({ cat: 'suspended', sub: 'Sus4' });
  });

  it('includes separate builder tension selection when mapping stock families', () => {
    expect(getStockMapping(
      { name: 'Maj7', pcs: [0, 4, 7, 11] },
      { label: '9', mods: { add: [2] } },
    )).toEqual({ cat: 'major', sub: 'Maj9' });
    expect(getStockMapping(
      { name: '7', pcs: [0, 4, 7, 10] },
      { label: 'sus4\n(9)', mods: { replace3: 5, add: [2] } },
    )).toEqual({ cat: 'suspended', sub: 'Sus4' });
    expect(getStockMapping(
      { name: 'm7(b5)', pcs: [0, 3, 6, 10] },
      { label: '(9)\n(11)', mods: { add: [2, 5] } },
    )).toEqual({ cat: 'halfDiminished', sub: 'Min11b5' });
  });
});

describe('Stock voicing display and builder selection', () => {
  it('spells major stock tritone colors as #11, not b5', () => {
    Object.values(stockVoicings.major).flat().forEach(entry => {
      const text = [entry.name, entry.label, ...(entry.LH || []), ...(entry.RH || [])].join(' ');
      expect(text).not.toContain('b5');
    });
  });

  it('keeps 6-family Stock names explicit without turning 6 into 13', () => {
    (stockVoicings.major.Maj6 || []).forEach(entry => {
      const degrees = [...(entry.LH || []), ...(entry.RH || [])];
      if (degrees.includes('6') && degrees.includes('9') && degrees.includes('#11')) {
        expect(entry.name).toContain('6(9,#11)');
      }
    });
  });

  it('transposes stock entry names to the current root', () => {
    expect(stockEntryNameToDisplay('F', 'Maj7(9)')).toBe('FMaj7(9)');
    expect(stockEntryNameToDisplay('F', 'Cmaj9(#11)')).toBe('FMaj9(#11)');
    expect(stockEntryNameToDisplay('F', 'C6(9)')).toBe('F6(9)');
    expect(stockEntryNameToDisplay('F', 'Maj6(9,#11)')).toBe('F6(9,#11)');
    expect(stockEntryNameToDisplay('E', 'Min6(9)')).toBe('Em6(9)');
    expect(stockEntryNameToDisplay('F', 'Cm11(b5)')).toBe('Fm11(b5)');
    expect(stockEntryNameToDisplay('F', 'C13(sus4)')).toBe('F13(sus4)');
    expect(stockEntryNameToDisplay('F', 'Dom13 (Type A)')).toBe('F13 (Type A)');
  });

  it('reads dominant stock altered fifths as explicit tensions', () => {
    expect(stockDominantDisplayNameFromDegrees('G', {
      name: 'Aug7(9)',
      LH: ['1', 'b7'],
      RH: ['3', '#5', '9']
    })).toBe('G7(9,b13)');

    expect(stockDominantDisplayNameFromDegrees('G', {
      name: 'C13(#11)',
      LH: ['1', 'b7'],
      RH: ['9', '#11', '13']
    })).toBe('G7(9,#11,13)');
  });

  it('keeps the dominant third in altered UST stock voicings', () => {
    const entry = stockVoicings.dominant.UST.find(v => v.id === 'ust-3');
    expect(entry.name).toBe('C7(#9,b13)');
    expect(entry.RH).toEqual(['#9', '#5', '3']);
    expect(stockDominantDisplayNameFromDegrees('G', entry)).toBe('G7(#9,b13)');
    expect(formatVoicingNoteDegreeText([55, 65, 70, 75, 83], entry.LH.concat(entry.RH), 'G', { dominant: true }))
      .toBe('Note: G F A# Eb B  Degree: 1 b7 #9 b13 3');
  });

  it('does not apply dominant stock naming to half-diminished voicings', () => {
    const prevStock = {
      enabled: StockState.enabled,
      currentIndex: StockState.currentIndex,
      currentMatches: StockState.currentMatches,
      currentCategory: StockState.currentCategory
    };
    const prevRoot = BuilderState.root;
    StockState.enabled = true;
    StockState.currentIndex = 0;
    StockState.currentCategory = 'halfDiminished';
    StockState.currentMatches = [{
      name: 'Cm7(b5)',
      LH: ['1', 'b5'],
      RH: ['b3', 'b7', 'b9']
    }];
    BuilderState.root = 7;
    expect(getStockChordDisplayName()).toBe('Gm7(b5)');
    Object.assign(StockState, prevStock);
    BuilderState.root = prevRoot;
  });

  it('spells Stock voicing notes from the selected builder root', () => {
    expect(formatVoicingNoteDegreeParts([46, 50, 53, 57], ['1', '3', '5', '7'], 'Bb').noteText)
      .toBe('Bb D F A');
    expect(formatVoicingNoteDegreeText([58, 62, 65, 68], ['1', '3', '5', 'b7'], 'Bb'))
      .toBe('Note: Bb D F Ab  Degree: 1 3 5 b7');
    expect(formatVoicingTopText([58, 62, 65, 68], { 68: 'b7' }, 'Bb'))
      .toBe('Top: b7(Ab)');
    expect(formatVoicingNoteDegreeText([44, 50, 59, 66, 69], ['1', 'b5', 'b3', 'b7', 'b9'], 'Ab'))
      .toBe('Note: Ab Ebb Cb Gb Bbb  Degree: 1 b5 m3 b7 b9');
    expect(formatVoicingNoteDegreeText([48, 51, 54, 57], ['1', 'b3', 'b5', 'bb7'], 'C'))
      .toBe('Note: C Eb Gb A  Degree: 1 m3 b5 6');
    expect(pcNameForChordDegree(9, 'C', 'bb7')).toBe('A');
  });

  it('spells #5 as b13 in dominant voicing display context', () => {
    expect(formatVoicingNoteDegreeText([55, 59, 65, 70, 75], ['1', '3', 'b7', '#9', '#5'], 'G', { dominant: true }))
      .toBe('Note: G B F A# Eb  Degree: 1 3 b7 #9 b13');
    expect(formatVoicingNoteDegreeText([60, 64, 68], ['1', '3', '#5'], 'C'))
      .toBe('Note: C E G#  Degree: 1 3 #5');
  });

  it('maps stock chord types back to builder quality and tension labels', () => {
    expect(getStockBuilderSelectionFromName('Maj7(9)')).toMatchObject({
      quality: expect.objectContaining({ name: 'Maj7' }),
      tensionLabel: '9',
    });
    expect(getStockBuilderSelectionFromName('Maj7(13)')).toMatchObject({
      quality: expect.objectContaining({ name: 'Maj7' }),
      tensionLabel: '13',
    });
    expect(getStockBuilderSelectionFromName('Maj6(9,#11)')).toMatchObject({
      quality: expect.objectContaining({ name: '6' }),
      tensionLabel: '(9)\n(#11)',
    });
    expect(getStockBuilderSelectionFromName('C6(9)')).toMatchObject({
      quality: expect.objectContaining({ name: '6' }),
      tensionLabel: '9',
    });
    expect(getStockBuilderSelectionFromName('Min6(9)')).toMatchObject({
      quality: expect.objectContaining({ name: 'm6' }),
      tensionLabel: '9',
    });
    expect(getStockBuilderSelectionFromName('C13(#11)')).toMatchObject({
      quality: expect.objectContaining({ name: '7' }),
      tensionLabel: '(9)\n(#11)\n(13)',
    });
    expect(getStockBuilderSelectionFromName('Aug7(9)')).toMatchObject({
      quality: expect.objectContaining({ name: '7' }),
      tensionLabel: '(9)\n(b13)',
    });
    expect(getStockBuilderSelectionFromName('Dom13 (Type A)')).toMatchObject({
      quality: expect.objectContaining({ name: '7' }),
      tensionLabel: '(9,13)',
    });
    expect(getStockBuilderSelectionFromName('7sus4(9)')).toMatchObject({
      quality: expect.objectContaining({ name: '7' }),
      tensionLabel: 'sus4\n(9)',
    });
  });

  it('uses degree fallback when stock shorthand names do not map to visible tension buttons', () => {
    expect(getStockBuilderSelection({
      name: 'C7(11)',
      LH: ['1', '5'],
      RH: ['b7', '9', '11'],
    })).toMatchObject({
      quality: expect.objectContaining({ name: '7' }),
      tensionLabel: '11',
    });
    expect(getStockBuilderSelection({
      name: 'Cm11(b5)',
      LH: ['1', 'b5'],
      RH: ['b7', '9', '11'],
    })).toMatchObject({
      quality: expect.objectContaining({ name: 'm7(b5)' }),
      tensionLabel: '11',
    });
    expect(getStockBuilderSelection({
      name: 'Cm7(b5,11)(omit3)',
      LH: ['1', 'b5'],
      RH: ['b7', '11'],
    })).toMatchObject({
      quality: expect.objectContaining({ name: 'm7(b5)' }),
      tensionLabel: '(11)',
    });
  });
});

describe('Chord detection practical guardrails', () => {
  it('does not expose b13 as a plain m7 detection family', () => {
    const plainMinorB13 = CHORD_DETECT_DB
      .map(chord => chord.name)
      .filter(name => /^m7/.test(name) && name.includes('b13') && !name.startsWith('m7(b5)'));

    expect(plainMinorB13).toEqual([]);
    expect(CHORD_DETECT_DB.map(chord => chord.name)).toContain('m7(b5)(b13)');
  });

  it('keeps jazz half-diminished omit3 voicings available', () => {
    expect(CHORD_DETECT_DB.map(chord => chord.name)).toContain('m7(b5,11)(omit3)');
  });
});

describe('TENSION_ROWS', () => {
  it('non-null entries have label and mods', () => {
    TENSION_ROWS.flat().forEach(t => {
      if (t === null) return;
      expect(t).toHaveProperty('label');
      expect(t).toHaveProperty('mods');
      expect(typeof t.label).toBe('string');
      expect(typeof t.mods).toBe('object');
    });
  });

  it('mods.add values are valid pitch classes', () => {
    TENSION_ROWS.flat().forEach(t => {
      if (!t || !t.mods.add) return;
      t.mods.add.forEach(pc => {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThan(12);
      });
    });
  });
});

describe('SCALE_AVAIL_TENSIONS', () => {
  it('covers all diatonic/HM/MM scales (indices 0-20)', () => {
    for (let i = 0; i <= 20; i++) {
      expect(SCALE_AVAIL_TENSIONS).toHaveProperty(String(i));
    }
  });

  it('avail and avoid contain valid tension names', () => {
    const validNames = new Set(Object.keys(TENSION_NAME_TO_PC));
    Object.values(SCALE_AVAIL_TENSIONS).forEach(sat => {
      if (sat.avail) {
        sat.avail.forEach(name => {
          expect(validNames.has(name)).toBe(true);
        });
      }
      if (sat.avoid) {
        sat.avoid.forEach(name => {
          expect(validNames.has(name)).toBe(true);
        });
      }
    });
  });
});

describe('DIATONIC_CHORD_DB', () => {
  it('has entries for all 12 pitch classes', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(DIATONIC_CHORD_DB[pc]).toBeDefined();
      expect(DIATONIC_CHORD_DB[pc].length).toBeGreaterThan(0);
    }
  });

  it('entries have required properties', () => {
    Object.values(DIATONIC_CHORD_DB).flat().forEach(entry => {
      expect(entry).toHaveProperty('parentKey');
      expect(entry).toHaveProperty('system');
      expect(entry).toHaveProperty('degreeNum');
      expect(entry).toHaveProperty('scaleName');
      expect(entry).toHaveProperty('scaleIdx');
      expect(entry).toHaveProperty('rootPC');
      expect(entry).toHaveProperty('quality');
    });
  });

  it('covers 3 systems + NM', () => {
    const systems = new Set();
    Object.values(DIATONIC_CHORD_DB).flat().forEach(e => systems.add(e.system));
    expect(systems.has('○')).toBe(true);   // Major
    expect(systems.has('■')).toBe(true);   // Harmonic Minor
    expect(systems.has('◆')).toBe(true);   // Melodic Minor
    expect(systems.has('NM')).toBe(true);  // Natural Minor
  });
});
