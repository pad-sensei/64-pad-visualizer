import { describe, it, expect } from 'vitest';

// All functions available via globalThis (setup.js)

describe('pitchClass', () => {
  it('returns 0-11 for standard MIDI range', () => {
    expect(pitchClass(60)).toBe(0);  // C4
    expect(pitchClass(61)).toBe(1);  // C#4
    expect(pitchClass(72)).toBe(0);  // C5
    expect(pitchClass(36)).toBe(0);  // C1
  });

  it('handles modular arithmetic correctly', () => {
    for (let midi = 0; midi < 128; midi++) {
      const pc = pitchClass(midi);
      expect(pc).toBeGreaterThanOrEqual(0);
      expect(pc).toBeLessThan(12);
    }
  });

  it('handles negative values via double-mod', () => {
    // pitchClass uses ((midi % 12) + 12) % 12
    expect(pitchClass(-1)).toBe(11);
    expect(pitchClass(-12)).toBe(0);
  });
});

describe('noteName', () => {
  it('maps MIDI to correct note+octave', () => {
    expect(noteName(60)).toBe('C3');   // MIDI 60 = C3 (floor(60/12)-2=3)
    expect(noteName(36)).toBe('C1');
    expect(noteName(69)).toBe('A3');
    expect(noteName(127)).toBe('G8');
  });

  it('uses flat notation in C major (jazz convention)', () => {
    expect(noteName(61)).toBe('Db3');
    expect(noteName(63)).toBe('Eb3');
  });
});

describe('formatDetectedNoteDegreeText', () => {
  it('shows note names and detected chord degrees in separate bottom-to-top lists', () => {
    const notes = [60, 64, 70, 74, 78, 81];
    expect(formatDetectedNoteDegreeText(notes, 0, 'C7(9,#11,13)'))
      .toBe('Note: C E Bb D F# A  Degree: 1 3 b7 9 #11 13');
  });

  it('uses #9 when the major third is also present', () => {
    expect(formatDetectedNoteDegreeText([60, 63, 64, 70], 0, 'C7(#9)'))
      .toBe('Note: C D# E Bb  Degree: 1 #9 3 b7');
  });

  it('uses chord quality to distinguish b5 from #11 when the natural 5th is omitted', () => {
    expect(formatDetectedNoteDegreeText([60, 64, 70, 78], 0, 'C7(#11)'))
      .toBe('Note: C E Bb F#  Degree: 1 3 b7 #11');
    expect(formatDetectedNoteDegreeText([60, 63, 70, 78], 0, 'Cm7(b5)'))
      .toBe('Note: C Eb Bb Gb  Degree: 1 m3 b7 b5');
  });

  it('spells detected notes from the chord root and degree in flat keys', () => {
    expect(formatDetectedNoteDegreeText([61, 65, 71, 75, 80], 1, 'Db7(9)'))
      .toBe('Note: Db F Cb Eb Ab  Degree: 1 3 b7 9 5');
  });
});

describe('formatDetectedUstText', () => {
  it('does not infer UST for sus bases without a third', () => {
    expect(formatDetectedUstText([55, 65, 69, 72], 7, 'G7sus4(9)'))
      .toBe('');
  });

  it('does not infer minor upper-structure triads for sus bases without a third', () => {
    expect(formatDetectedUstText([55, 65, 68, 72], 7, 'G7sus4(b9)'))
      .toBe('');
  });

  it('distinguishes dominant seventh and major seventh bases', () => {
    expect(formatDetectedUstText([60, 62, 64, 66, 69, 71], 0, 'CMaj7(9,#11,13)'))
      .toBe('UST: D△ [9,#11,13] / C△7');
    expect(formatDetectedUstText([60, 62, 64, 66, 69, 70], 0, 'C7(9,#11,13)'))
      .toBe('UST: D△ [9,#11,13] / C7');
  });

  it('does not infer non-standard bVII major UST on dominant bases', () => {
    expect(formatDetectedUstText([60, 64, 70, 74, 77], 0, 'C7(9,11)'))
      .toBe('');
  });

  it('keeps UST spelling aligned with flat-key chord roots', () => {
    expect(formatDetectedUstText([61, 65, 71, 75, 79, 82], 1, 'Db7(9,#11,13)'))
      .toBe('UST: Eb△ [9,#11,13] / Db7');
  });

  it('prefers upper triads with more tensions over lower-structure slash readings', () => {
    expect(formatDetectedUstText([55, 59, 65, 69, 72, 76], 7, 'G7(9,11,13)'))
      .toBe('UST: Am [9,11,13] / G7');
  });

  it('uses the standard bV major UST for dominant b9 #11 colors', () => {
    expect(formatDetectedUstText([67, 71, 77, 80, 85, 88, 91], 7, 'G7(b9,#11,13)'))
      .toBe('UST: Db△ [#11,b7,b9] / G7');
  });

  it('shows the standard V major UST on major seventh bases', () => {
    expect(formatDetectedUstText([60, 64, 67, 71, 74], 0, 'CMaj7(9)'))
      .toBe('UST: G△ [5,7,9] / C△7');
  });

  it('shows the jazz major seventh sharp-five UST', () => {
    expect(formatDetectedUstText([60, 64, 71, 76, 80, 83], 0, 'CMaj7(#5)'))
      .toBe('UST: E△ [3,#5,7] / C△7');
  });

  it('shows quartal UST only when the actual stack is fourth-based', () => {
    expect(formatDetectedUstText([60, 64, 71, 74, 79, 84], 0, 'CMaj7(9)'))
      .toBe('UST: Q2 [9,5,1] / C△7');
    expect(formatDetectedUstText([60, 64, 67, 71, 74], 0, 'CMaj7(9)'))
      .toBe('UST: G△ [5,7,9] / C△7');
  });

  it('keeps minor seventh bases minor when they are UST targets', () => {
    expect(formatDetectedUstText([50, 53, 60, 64, 67], 2, 'Dm7(9,11)'))
      .toBe('UST: C△ [b7,9,11] / Dm7');
  });

  it('prefers the bVII major triad over the Vm reading on minor 7(9,11)', () => {
    expect(formatDetectedUstText([60, 63, 67, 70, 74, 77], 0, 'Cm7(9,11)'))
      .toBe('UST: Bb△ [b7,9,11] / Cm7');
  });

  it('shows quartal UST on minor seventh and half-diminished bases', () => {
    expect(formatDetectedUstText([60, 63, 70, 72, 77, 82], 0, 'Cm7(11)'))
      .toBe('UST: Q1 [1,11,b7] / Cm7');
    expect(formatDetectedUstText([60, 63, 66, 70, 72, 77, 82], 0, 'Cm7(b5,11)'))
      .toBe('UST: Q1 [1,11,b7] / Cm7(b5)');
  });

  it('does not treat half-diminished chords as minor UST targets', () => {
    expect(formatDetectedUstText([50, 53, 60, 65], 2, 'Dm7(b5)'))
      .toBe('');
  });

  it('does not infer UST without a seventh shell', () => {
    expect(formatDetectedUstText([60, 62, 64, 67, 69], 0, 'C6(9)'))
      .toBe('');
  });

  it('does not infer dominant UST when the major seventh is also present', () => {
    expect(formatDetectedUstText([67, 77, 78, 81, 83, 86], 7, 'G7(9)'))
      .toBe('');
  });

  it('does not infer UST when the dominant third is missing', () => {
    expect(formatDetectedUstText([55, 65, 69, 72, 76], 7, 'G7sus4(9,13)'))
      .toBe('');
  });
});

describe('padFindCompactPositions', () => {
  it('prefers playable shell clusters when degree metadata is available', () => {
    const midiNotes = [55, 59, 65, 70, 75, 79];
    const degreeMap = { 55: '1', 59: '3', 65: 'b7', 70: '#9', 75: '#5', 79: '1' };
    const result = padFindCompactPositions(midiNotes, 8, 8, 48, 5, degreeMap);
    const byMidi = new Map(result.map(p => [p.midi, p]));
    const shell = [byMidi.get(55), byMidi.get(59), byMidi.get(65)];
    const rows = shell.map(p => p.row);
    const cols = shell.map(p => p.col);
    expect(Math.max(...rows) - Math.min(...rows) + 1).toBeLessThanOrEqual(3);
    expect(Math.max(...cols) - Math.min(...cols) + 1).toBeLessThanOrEqual(2);
  });
});

describe('baseMidi', () => {
  it('returns BASE_MIDI at default octaveShift', () => {
    AppState.octaveShift = 0;
    expect(baseMidi()).toBe(BASE_MIDI);
  });

  it('shifts by 12 per octave', () => {
    AppState.octaveShift = 1;
    expect(baseMidi()).toBe(BASE_MIDI + 12);
    AppState.octaveShift = -1;
    expect(baseMidi()).toBe(BASE_MIDI - 12);
    AppState.octaveShift = 0; // reset
  });

  it('allows octave range changes while TASTY or STOCK is active', () => {
    const originalGetElementById = document.getElementById;
    document.getElementById = () => ({ textContent: '', disabled: false });
    try {
      AppState.octaveShift = 0;
      TastyState.enabled = true;
      StockState.enabled = false;
      expect(setOctaveShift(1)).toBe(true);
      expect(AppState.octaveShift).toBe(1);

      TastyState.enabled = false;
      StockState.enabled = true;
      expect(setOctaveShift(0)).toBe(true);
      expect(AppState.octaveShift).toBe(0);
    } finally {
      TastyState.enabled = false;
      StockState.enabled = false;
      AppState.octaveShift = 0;
      document.getElementById = originalGetElementById;
    }
  });
});

describe('midiNote', () => {
  it('computes MIDI from row/col', () => {
    AppState.octaveShift = 0;
    // row=0,col=0 → baseMidi + 0*5 + 0*1 = 36
    expect(midiNote(0, 0)).toBe(36);
    // row=1,col=0 → 36 + 5 = 41
    expect(midiNote(1, 0)).toBe(41);
    // row=0,col=1 → 36 + 1 = 37
    expect(midiNote(0, 1)).toBe(37);
  });
});

describe('calcVoicingOffsets', () => {
  it('preserves pitch class set through inversions', () => {
    const pcs = [0, 4, 7]; // major triad
    for (let inv = 0; inv <= 2; inv++) {
      const { voiced } = calcVoicingOffsets(pcs, inv, null);
      const resultPCS = new Set(voiced.map(v => ((v % 12) + 12) % 12));
      expect(resultPCS).toEqual(new Set([0, 4, 7]));
    }
  });

  it('preserves pitch class set through Drop2', () => {
    const pcs = [0, 4, 7, 11]; // Maj7
    const { voiced } = calcVoicingOffsets(pcs, 0, 'drop2');
    const resultPCS = new Set(voiced.map(v => ((v % 12) + 12) % 12));
    expect(resultPCS).toEqual(new Set([0, 4, 7, 11]));
  });

  it('preserves pitch class set through Drop3', () => {
    const pcs = [0, 4, 7, 11]; // Maj7
    const { voiced } = calcVoicingOffsets(pcs, 0, 'drop3');
    const resultPCS = new Set(voiced.map(v => ((v % 12) + 12) % 12));
    expect(resultPCS).toEqual(new Set([0, 4, 7, 11]));
  });

  it('returns offsets relative to lowest note', () => {
    const pcs = [0, 4, 7];
    const { offsets } = calcVoicingOffsets(pcs, 0, null);
    expect(offsets[0]).toBe(0); // lowest is always 0
  });

  it('1st inversion moves root up an octave', () => {
    const pcs = [0, 4, 7];
    const { voiced } = calcVoicingOffsets(pcs, 1, null);
    // After 1st inversion: [4, 7, 12] (0 moved to 12)
    expect(voiced).toEqual([4, 7, 12]);
  });
});

describe('getBassCase', () => {
  it('identifies chord tone bass', () => {
    // E (pc=4) as bass of C major (pcs=[0,4,7])
    const result = getBassCase(4, 0, [0, 4, 7]);
    expect(result.isChordTone).toBe(true);
    expect(result.inversionIndex).toBeGreaterThanOrEqual(0);
  });

  it('identifies non-chord tone bass', () => {
    // D (pc=2) as bass of C major (pcs=[0,4,7])
    const result = getBassCase(2, 0, [0, 4, 7]);
    expect(result.isChordTone).toBe(false);
    expect(result.inversionIndex).toBeNull();
  });
});

describe('applyOnChordBass', () => {
  it('inserts bass note below voiced intervals', () => {
    // Voiced: [0, 4, 7] (root position C major intervals)
    // Bass: E (pc=4), root=C (pc=0) → bassIv=4
    // Already has 4 as lowest? No, lowest is 0. bassIv=4, lowestPC=0 → different
    const result = applyOnChordBass([0, 4, 7], 0, 4);
    // Bass E should be below 0, so bassVal starts at 4, goes below 0 → -8
    expect(result[0]).toBeLessThan(0);
    // All original notes should be present
    expect(result).toContain(0);
    expect(result).toContain(4);
    expect(result).toContain(7);
  });

  it('returns unchanged if lowest is already bass', () => {
    // voiced=[4, 7, 12], rootPC=0, bassPC=4 → lowestPC = ((4%12)+12)%12 = 4 = bassIv
    const result = applyOnChordBass([4, 7, 12], 0, 4);
    expect(result).toEqual([4, 7, 12]);
  });
});

describe('getShellIntervals', () => {
  it('returns R-3-7 for 137 shell (Maj7)', () => {
    const result = getShellIntervals([0, 4, 7, 11], '137', 0, null);
    expect(result).toContain(0);   // root
    expect(result).toContain(4);   // M3
    expect(result).toContain(11);  // M7
    expect(result).toHaveLength(3);
  });

  it('returns R-7-3(+12) for 173 shell (Maj7)', () => {
    const result = getShellIntervals([0, 4, 7, 11], '173', 0, null);
    expect(result).toContain(0);   // root
    expect(result).toContain(11);  // M7
    expect(result).toContain(16);  // M3 + 12
    expect(result).toHaveLength(3);
  });

  it('returns null if no 3rd found', () => {
    // sus4 chord: [0, 5, 7] — no 3rd
    const result = getShellIntervals([0, 5, 7], '137', 0, null);
    expect(result).toBeNull();
  });

  it('returns null if no 7th found', () => {
    // Major triad: [0, 4, 7] — no 7th
    const result = getShellIntervals([0, 4, 7], '137', 0, null);
    expect(result).toBeNull();
  });

  it('uses 6th as 7th for 6th chords', () => {
    // 6th chord: [0, 4, 7, 9] — 9 treated as 7th (no 10 or 11)
    const result = getShellIntervals([0, 4, 7, 9], '137', 0, null);
    expect(result).not.toBeNull();
    expect(result).toContain(9);
  });

  it('includes compound intervals from fullPCS', () => {
    // Maj7(9): fullPCS has 14 (= 2+12, compound 9th)
    const result = getShellIntervals([0, 4, 7, 11], '137', 0, [0, 4, 7, 11, 14]);
    expect(result).toContain(14);
  });
});

describe('applyTension', () => {
  it('sus4 replaces 3rd with 4th', () => {
    const result = applyTension([0, 4, 7], { replace3: 5 });
    expect(result).toContain(5);
    expect(result).not.toContain(4);
    expect(result).not.toContain(3);
  });

  it('aug replaces 5th with #5', () => {
    const result = applyTension([0, 4, 7], { sharp5: true });
    expect(result).toContain(8);
    expect(result).not.toContain(7);
  });

  it('b5 replaces 5th with b5', () => {
    const result = applyTension([0, 4, 7, 10], { flat5: true });
    expect(result).toContain(6);
    expect(result).not.toContain(7);
  });

  it('add tensions as compound intervals (+12)', () => {
    const result = applyTension([0, 4, 7, 10], { add: [2] }); // add 9
    expect(result).toContain(14); // 2 + 12 = 14
  });

  it('does not duplicate existing pitch classes', () => {
    // If 2 (mod 12) already exists, don't add again
    const result = applyTension([0, 2, 4, 7], { add: [2] });
    const count2 = result.filter(p => p % 12 === 2).length;
    expect(count2).toBe(1);
  });
});

describe('getDiatonicTetrads', () => {
  it('returns 7 tetrads for 7-note scales', () => {
    const cMajor = SCALES[0].pcs; // [0,2,4,5,7,9,11]
    const tetrads = getDiatonicTetrads(cMajor, 0); // Key = C
    expect(tetrads).toHaveLength(7);
  });

  it('returns empty for non-7-note scales', () => {
    const pentatonic = SCALES[21].pcs; // 5 notes
    expect(getDiatonicTetrads(pentatonic, 0)).toEqual([]);
  });

  it('C Major diatonic tetrads have correct qualities', () => {
    const tetrads = getDiatonicTetrads(SCALES[0].pcs, 0);
    // I=Maj7, ii=m7, iii=m7, IV=Maj7, V=7, vi=m7, vii=m7(b5)
    const names = tetrads.map(t => t.quality.name);
    expect(names[0]).toBe('Maj7');       // CMaj7
    expect(names[1]).toBe('m7');          // Dm7
    expect(names[2]).toBe('m7');          // Em7
    expect(names[3]).toBe('Maj7');       // FMaj7
    expect(names[4]).toBe('7');           // G7
    expect(names[5]).toBe('m7');          // Am7
    expect(names[6]).toBe('m7(b5)');      // Bm7(b5)
  });

  it('each tetrad has required properties', () => {
    const tetrads = getDiatonicTetrads(SCALES[0].pcs, 0);
    tetrads.forEach(t => {
      expect(t).toHaveProperty('rootPC');
      expect(t).toHaveProperty('pcs');
      expect(t).toHaveProperty('quality');
      expect(t).toHaveProperty('chordName');
      expect(t).toHaveProperty('degree');
      expect(t.rootPC).toBeGreaterThanOrEqual(0);
      expect(t.rootPC).toBeLessThan(12);
    });
  });

  it('C Major root PCs follow scale degrees', () => {
    const tetrads = getDiatonicTetrads(SCALES[0].pcs, 0);
    const rootPCs = tetrads.map(t => t.rootPC);
    expect(rootPCs).toEqual([0, 2, 4, 5, 7, 9, 11]); // C D E F G A B
  });
});

describe('findParentScales', () => {
  it('returns results for Dm7 (rootPC=2, intervals=0,3,7,10)', () => {
    AppState.scaleIdx = 0;
    AppState.key = 0;
    const results = findParentScales(2, new Set([0, 3, 7, 10]), 0);
    expect(results.length).toBeGreaterThan(0);
    // Should include Dorian
    const scaleNames = results.map(r => r.scaleName);
    expect(scaleNames).toContain('Dorian');
  });

  it('returns results for G7 (rootPC=7, intervals=0,4,7,10)', () => {
    const results = findParentScales(7, new Set([0, 4, 7, 10]), 0);
    expect(results.length).toBeGreaterThan(0);
    // Should include Mixolydian
    const scaleNames = results.map(r => r.scaleName);
    expect(scaleNames).toContain('Mixolydian');
  });

  it('strict matches come before omit5 matches', () => {
    const results = findParentScales(0, new Set([0, 4, 7, 10]), 0);
    const firstOmit5Idx = results.findIndex(r => r.omit5Match);
    if (firstOmit5Idx >= 0) {
      // All strict matches should come before omit5
      results.slice(0, firstOmit5Idx).forEach(r => {
        expect(r.omit5Match).toBe(false);
      });
    }
  });
});

describe('fifthsDistance', () => {
  it('adjacent keys on circle of fifths = 1', () => {
    expect(fifthsDistance(0, 7)).toBe(1);  // C to G
    expect(fifthsDistance(0, 5)).toBe(1);  // C to F
  });

  it('tritone = 6 (maximum distance)', () => {
    expect(fifthsDistance(0, 6)).toBe(6);  // C to F#
  });

  it('same key = 0', () => {
    expect(fifthsDistance(0, 0)).toBe(0);
    expect(fifthsDistance(7, 7)).toBe(0);
  });

  it('is symmetric', () => {
    for (let a = 0; a < 12; a++) {
      for (let b = 0; b < 12; b++) {
        expect(fifthsDistance(a, b)).toBe(fifthsDistance(b, a));
      }
    }
  });
});

describe('getParentMajorKey', () => {
  it('Ionian returns key as-is', () => {
    // Ionian (id=0, cat=○, num=1): parent = key - 0 = key
    expect(getParentMajorKey(0, 0)).toBe(0);  // C Ionian → C
    expect(getParentMajorKey(0, 2)).toBe(2);  // D Ionian → D
  });

  it('Dorian returns relative major', () => {
    // D Dorian → parent = C major
    expect(getParentMajorKey(1, 2)).toBe(0);  // D Dorian → C
  });

  it('handles Harmonic Minor modes', () => {
    // Harmonic Minor (id=7, cat=■, num=1)
    // A HM → parent = (A - 0 + 12) % 12 = 9 → relative major = (9+3)%12 = 0 = C
    expect(getParentMajorKey(7, 9)).toBe(0);
  });
});

describe('pcName', () => {
  it('returns flat names for C major (jazz convention)', () => {
    AppState.scaleIdx = 0; // Ionian
    AppState.key = 0;      // C (parent=C, jazz convention uses flats)
    expect(pcName(0)).toBe('C');
    expect(pcName(1)).toBe('Db');
  });

  it('returns flat names for flat keys', () => {
    AppState.scaleIdx = 0;
    AppState.key = 5;      // F (parent=F)
    expect(pcName(1)).toBe('Db');
    expect(pcName(3)).toBe('Eb');
  });
});

describe('folk/open guitar reference ranking', () => {
  const tuning = [64, 59, 55, 50, 45, 40];
  const folkWeights = {
    rootBass: 100,
    fifthBass: 20,
    rootStr6: 40,
    rootStr5: 35,
    rootStr4: 20,
    top4: 10,
    guideTone: 30,
    openStr: 55,
    stringCount: 35,
    avgFret: 12,
    span: 10,
    gaps: 20,
    fullFret: 0,
    closedAForm: 0,
    major7OpenCluster: 0,
  };

  function shapeFromHighToLow(frets) {
    return frets.slice().reverse().map((fret) => (
      fret === null || fret === undefined ? 'x' : fret.toString(36)
    )).join('');
  }

  it('keeps the common Cadd9 folk grip ahead of generated open-string guesses', () => {
    const forms = padEnumGuitarChordForms([0, 4, 7, 14], 0, tuning, 21, 4, {
      maxResults: 5,
      weights: folkWeights,
    });

    expect(forms.length).toBeGreaterThan(0);
    expect(shapeFromHighToLow(forms[0].frets)).toBe('x32033');
  });

  it('keeps core folk/open seed forms in the top range', () => {
    const cases = [
      { name: 'G', root: 7, pcs: [0, 4, 7], refs: ['320003', '320033'] },
      { name: 'C', root: 0, pcs: [0, 4, 7], refs: ['x32010'] },
      { name: 'D', root: 2, pcs: [0, 4, 7], refs: ['xx0232'] },
      { name: 'Em', root: 4, pcs: [0, 3, 7], refs: ['022000'] },
      { name: 'Am', root: 9, pcs: [0, 3, 7], refs: ['x02210'] },
      { name: 'A7', root: 9, pcs: [0, 4, 7, 10], refs: ['x02020'] },
      { name: 'B7', root: 11, pcs: [0, 4, 7, 10], refs: ['x21202'] },
      { name: 'Esus4', root: 4, pcs: [0, 5, 7], refs: ['022200'] },
    ];

    cases.forEach(({ name, root, pcs, refs }) => {
      const forms = padEnumGuitarChordForms(pcs, root, tuning, 21, 4, {
        maxResults: 5,
        weights: folkWeights,
      });
      const topShapes = forms.slice(0, 3).map((form) => shapeFromHighToLow(form.frets));
      expect(topShapes, name).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^(${refs.join('|')})$`))]));
    });
  });
});

describe('source-derived guitar genre seeds', () => {
  const tuning = [64, 59, 55, 50, 45, 40];
  const neoSoulWeights = {
    rootBass: 15,
    fifthBass: 0,
    rootStr6: 10,
    rootStr5: 20,
    rootStr4: 60,
    top4: 140,
    guideTone: 80,
    openStr: 0,
    stringCount: 15,
    avgFret: 4,
    span: 20,
    gaps: 25,
    fullFret: 10,
    closedAForm: 40,
    major7OpenCluster: 120,
  };

  function shapeFromHighToLow(frets) {
    return frets.slice().reverse().map((fret) => (
      fret === null || fret === undefined ? 'x' : fret.toString(36)
    )).join('');
  }

  it('installs at least 50 source-derived movable guitar forms', () => {
    let count = 0;
    Object.values(PAD_GUITAR_FORM_KNOWLEDGE.standard).forEach((byShape) => {
      Object.values(byShape).forEach((meta) => {
        if (meta.sourceSeedId) count += 1;
      });
    });

    expect(count).toBeGreaterThanOrEqual(50);
  });

  it('installs Wes-style jazz block chord seeds across keys', () => {
    let count = 0;
    Object.values(PAD_GUITAR_FORM_KNOWLEDGE.standard).forEach((byShape) => {
      Object.values(byShape).forEach((meta) => {
        if (meta.genreBonuses && meta.genreBonuses.jazz) count += 1;
      });
    });

    expect(count).toBeGreaterThanOrEqual(100);
  });

  it('installs Bossa source shell seeds across keys', () => {
    let count = 0;
    Object.values(PAD_GUITAR_FORM_KNOWLEDGE.standard).forEach((byShape) => {
      Object.values(byShape).forEach((meta) => {
        if (meta.genreBonuses && meta.genreBonuses.bossa) count += 1;
      });
    });

    expect(count).toBeGreaterThanOrEqual(80);
  });

  it('uses Misch neo-soul source grips when the Neo Soul preset is active', () => {
    const cases = [
      { name: 'Dm7', root: 2, pcs: [0, 3, 7, 10], expected: 'x57565' },
      { name: 'G7', root: 7, pcs: [0, 4, 7, 10], expected: '353433' },
      { name: 'Cmaj7', root: 0, pcs: [0, 4, 7, 11], expected: 'x3545x' },
    ];

    cases.forEach(({ name, root, pcs, expected }) => {
      const forms = padEnumGuitarChordForms(pcs, root, tuning, 21, 4, {
        maxResults: 12,
        weights: neoSoulWeights,
        noOpen: true,
        genre: 'neoSoul',
      });
      const shapes = forms.slice(0, 8).map((form) => shapeFromHighToLow(form.frets));
      expect(shapes, name).toContain(expected);
    });
  });

  it('uses Bossa source shell grips when the Bossa preset is active', () => {
    const bossaWeights = {
      rootBass: 70,
      fifthBass: 60,
      openStr: 25,
      top4: 60,
      guideTone: 40,
      avgFret: 12,
      stringCount: 35,
    };
    const cases = [
      { name: 'Dm7', root: 2, pcs: [0, 3, 7, 10], expected: 'x5356x' },
      { name: 'G7', root: 7, pcs: [0, 4, 7, 10], expected: '3x343x' },
      { name: 'Cmaj7', root: 0, pcs: [0, 4, 7, 11], expected: 'x3545x' },
      { name: 'C6(9)', root: 0, pcs: [0, 4, 7, 9, 14], expected: 'x3223x' },
      { name: 'Dm9', root: 2, pcs: [0, 3, 7, 10, 14], expected: 'x5355x' },
      { name: 'G13', root: 7, pcs: [0, 4, 10, 21], expected: '3x345x' },
      { name: 'Cm7(b5)', root: 0, pcs: [0, 3, 6, 10], expected: 'x3434x' },
      { name: 'Cdim7', root: 0, pcs: [0, 3, 6, 9], expected: 'x3424x' },
    ];

    cases.forEach(({ name, root, pcs, expected }) => {
      const forms = padEnumGuitarChordForms(pcs, root, tuning, 21, 4, {
        maxResults: 12,
        weights: bossaWeights,
        genre: 'bossa',
      });
      const shapes = forms.slice(0, 8).map((form) => shapeFromHighToLow(form.frets));
      expect(shapes, name).toContain(expected);
    });
  });

  it('uses Wes-style block chord source grips when the Jazz preset is active', () => {
    const jazzWeights = {
      rootBass: 60,
      fifthBass: 0,
      rootStr6: 20,
      rootStr5: 30,
      rootStr4: 40,
      top4: 100,
      guideTone: 50,
      openStr: 0,
      stringCount: 20,
      avgFret: 6,
      span: 10,
      gaps: 15,
      fullFret: 20,
    };
    const cases = [
      { name: 'Cmaj7', root: 0, pcs: [0, 4, 7, 11], expected: 'x3545x' },
      { name: 'Dm7', root: 2, pcs: [0, 3, 7, 10], expected: 'x5756x' },
      { name: 'G7', root: 7, pcs: [0, 4, 7, 10], expected: '353433' },
      { name: 'Bm7b5', root: 11, pcs: [0, 3, 6, 10], expected: 'x2323x' },
      { name: 'G13', root: 7, pcs: [0, 4, 10, 21], expected: '3x345x' },
    ];

    cases.forEach(({ name, root, pcs, expected }) => {
      const forms = padEnumGuitarChordForms(pcs, root, tuning, 21, 4, {
        maxResults: 12,
        weights: jazzWeights,
        genre: 'jazz',
      });
      const shapes = forms.slice(0, 8).map((form) => shapeFromHighToLow(form.frets));
      expect(shapes, name).toContain(expected);
    });
  });
});
