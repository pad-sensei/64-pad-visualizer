#!/usr/bin/env node
/*
 * Folk/Open guitar voicing review pack generator.
 *
 * The source references are public chord/progression pages. We do not copy
 * their diagram images; this script stores only common shape strings and
 * generates our own review diagrams from 64 Pad Explorer's guitar engine.
 */

const fs = require('fs');
const path = require('path');

Object.assign(globalThis, require('../pad-core/data.js'));
const theory = require('../pad-core/theory.js');
Object.assign(globalThis, theory);

const OUT_FILE = path.resolve(__dirname, '../docs/folk-open-voicing-review.html');
const TUNING_HIGH_TO_LOW = [64, 59, 55, 50, 45, 40]; // e B G D A E
const STRING_NAMES_LOW_TO_HIGH = ['E', 'A', 'D', 'G', 'B', 'e'];
const STRING_NAMES_HIGH_TO_LOW = ['e', 'B', 'G', 'D', 'A', 'E'];

const FOLK_WEIGHTS = {
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

const PC = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const QUALITIES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dom7: [0, 4, 7, 10],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
};

const SOURCES = [
  {
    label: 'Chordly folk progressions',
    url: 'https://chordly.com/tools/chord-progressions/folk',
    note: 'Uses G/C/D/A/E as classic open-string folk guitar keys; G-C-D, G-Em-C-D, etc.',
  },
  {
    label: 'Guitar-chord.org open chords',
    url: 'https://www.guitar-chord.org/open-chords.html',
    note: 'Defines open chords and lists open-position C/D/E/G/A families.',
  },
  {
    label: 'Connect Guitar folk guitar',
    url: 'https://connectguitar.com/how-to-play-folk-guitar/',
    note: 'Treats G, C, D, A, E and progressions like G-C-D / A-D-E as folk basics.',
  },
  {
    label: 'Guitar Chords Library key pages',
    url: 'https://guitarchordslibrary.org/chords/key',
    note: 'Useful cross-check for guitar-friendly keys and diatonic chord families.',
  },
  {
    label: 'Fender B7 open position',
    url: 'https://www.fender.com/articles/chords/learn-how-to-play-b7-guitar-chord',
    note: 'Open B7 x21202 is treated as a frequent open-position B7, used in country, blues-inflected rock, and blues contexts.',
  },
  {
    label: 'Tabs4Acoustic Esus4',
    url: 'https://www.tabs4acoustic.com/en/Esus4-guitar-chord%2C206.html',
    note: 'Esus4 022200 lists 2-3-4 and 1-2-3 as fingering options.',
  },
  {
    label: 'Guitar Chords Library A7',
    url: 'https://guitarchordslibrary.org/chords/a7',
    note: 'A7 x02020 is presented as a simple two-finger open chord used in rock and folk.',
  },
  {
    label: 'Guitar-chord.org Gmaj7',
    url: 'https://www.guitar-chord.org/gmaj7.html',
    note: 'Gmaj7 320002 is listed as a popular open-position form; barre and alternate forms are separate candidates.',
  },
];

const HUMAN_REVIEW_RULES = [
  'Open strings are not inherently difficult. Many-open-string shapes can be easy and idiomatic in folk/open and blues.',
  'Flag open-string forms only when they require awkward selective muting or when a fretted finger interferes with a string that must ring open.',
  'Blues needs two lanes: Chicago / old-school blues can use open strings, while modern blues tends to avoid open strings and is closer to closed-position funk/soul handling.',
  'Finger numbers are review data. They are useful for future guitar-specific UI, but human-confirmed fingering should override the current automatic guess when they differ.',
  'Muted strings need a muting actor. For each x string, record whether it is handled by thumb, fingertip, finger pad, adjacent-finger touch, or picking-hand control.',
];

const REVIEW_CHORDS = [
  {
    key: 'G',
    title: 'G major: one sharp, core folk key',
    chords: [
      chord('G', 'major', ['320003', '320033'], 'I'),
      chord('C', 'major', ['x32010'], 'IV', {
        notes: ['Human check: open-position C family is acceptable; do not reject a usable shape because it contains open strings.'],
      }),
      chord('D', 'major', ['xx0232'], 'V'),
      chord('Em', 'minor', ['022000'], 'vi'),
      chord('Am', 'minor', ['x02210'], 'ii'),
      chord('Bm7', 'min7', ['x20202', 'x24232'], 'iii7 / practical minor color'),
      chord('D7', 'dom7', ['xx0212'], 'V7'),
      chord('Cadd9', 'add9', ['x32033'], 'IV add9 / Britpop, jangle, folk-rock color', { tier: 'secondary' }),
      chord('Gmaj7', 'maj7', ['320002'], 'Imaj7 color', {
        acceptedTopShapes: ['354433'],
        notes: ['Human check: 354433 is OK. Fingering note: the 1st string is played with the index finger, not treated as a full barre.'],
        humanFingering: ['354433: high E uses finger 1, not a full barre.'],
      }),
    ],
  },
  {
    key: 'D',
    title: 'D major: two sharps, strong acoustic key',
    chords: [
      chord('D', 'major', ['xx0232'], 'I'),
      chord('G', 'major', ['320003', '320033'], 'IV'),
      chord('A', 'major', ['x02220'], 'V'),
      chord('Bm', 'minor', ['x24432'], 'vi'),
      chord('Em', 'minor', ['022000'], 'ii'),
      chord('F#m7', 'min7', ['242222', '2x222x'], 'iii7 / barre-prone'),
      chord('A7', 'dom7', ['x02020'], 'V7', {
        notes: ['Human check: x02020 can be fingered with fingers 2 and 3, and is still playable with other common fingerings.'],
        humanFingering: ['x02020: user-confirmed two-finger grip can use fingers 2 and 3.'],
        muting: ['x02020: in folk/blues, mute the 6th string with the fretting-hand thumb.'],
      }),
      chord('Dsus2', 'sus2', ['xx0230'], 'I sus2 color'),
      chord('Dsus4', 'sus4', ['xx0233'], 'I sus4 color'),
      chord('Dmaj7', 'maj7', ['xx0222'], 'Imaj7 color'),
    ],
  },
  {
    key: 'A',
    title: 'A major: three sharps, common guitar key',
    chords: [
      chord('A', 'major', ['x02220'], 'I'),
      chord('D', 'major', ['xx0232'], 'IV'),
      chord('E', 'major', ['022100'], 'V'),
      chord('F#m', 'minor', ['244222'], 'vi / barre-prone'),
      chord('Bm7', 'min7', ['x20202', 'x24232'], 'ii7'),
      chord('C#m7', 'min7', ['x46454'], 'iii7 / barre-prone'),
      chord('E7', 'dom7', ['020100', '022130'], 'V7'),
      chord('Asus2', 'sus2', ['x02200'], 'I sus2 color'),
      chord('Asus4', 'sus4', ['x02230'], 'I sus4 color'),
      chord('Amaj7', 'maj7', ['x02120'], 'Imaj7 color'),
    ],
  },
  {
    key: 'E',
    title: 'E major: four sharps, open low E center',
    chords: [
      chord('E', 'major', ['022100'], 'I'),
      chord('A', 'major', ['x02220'], 'IV'),
      chord('B7', 'dom7', ['x21202'], 'V7 / open substitute for B', {
        notes: ['Human check: x21202 fingering = 5th string finger 1, 4th string finger 2, 3rd string finger 3, 1st string finger 4.'],
        humanFingering: ['x21202: user-confirmed fingering = A string 1, D string 2, G string 3, high E string 4.'],
        muting: ['x21202: mute the 6th string with the middle finger in the current human review.'],
      }),
      chord('C#m7', 'min7', ['x46454'], 'vi7 / barre-prone'),
      chord('F#m7', 'min7', ['242222', '2x222x'], 'ii7 / barre-prone'),
      chord('G#m7', 'min7', ['464444'], 'iii7 / barre-prone'),
      chord('E7', 'dom7', ['020100', '022130'], 'I7 color'),
      chord('Esus4', 'sus4', ['022200'], 'I sus4 color', {
        notes: ['Human check: 022200 is not a barre. Use fingers 1,2,3 or 2,3,4 from the 5th string, then resolve to E. E7sus-family shapes should follow the same non-barre principle.'],
        humanFingering: ['022200: not a barre by default; use fingers 1,2,3 or 2,3,4 from the 5th string. E7sus-family shapes use the same idea.'],
        muting: ['022200: no muted strings in the reference shape.'],
      }),
      chord('Emaj7', 'maj7', ['021100'], 'Imaj7 color'),
    ],
  },
];

function chord(name, quality, refs, role, options = {}) {
  const root = name.match(/^[A-G](?:#|b)?/)[0];
  return {
    name,
    root,
    rootPC: PC[root],
    intervals: QUALITIES[quality],
    quality,
    refs,
    role,
    tier: options.tier || 'core',
    acceptedTopShapes: options.acceptedTopShapes || [],
    notes: options.notes || [],
    humanFingering: options.humanFingering || [],
    muting: options.muting || [],
  };
}

function parseShapeLowToHigh(shape) {
  if (shape.length !== 6) throw new Error(`Expected 6-char guitar shape, got ${shape}`);
  const lowToHigh = shape.split('').map((ch) => {
    if (ch.toLowerCase() === 'x') return null;
    if (ch >= 'a' && ch <= 'z') return ch.charCodeAt(0) - 97 + 10;
    const n = Number(ch);
    if (!Number.isFinite(n)) throw new Error(`Bad fret char "${ch}" in ${shape}`);
    return n;
  });
  return lowToHigh.slice().reverse();
}

function shapeFromHighToLow(fretsHighToLow) {
  return fretsHighToLow.slice().reverse().map((f) => {
    if (f === null || f === undefined) return 'x';
    if (f >= 10) return String.fromCharCode(97 + f - 10);
    return String(f);
  }).join('');
}

function equalFrets(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function formatFingers(fingersHighToLow) {
  if (!Array.isArray(fingersHighToLow)) return 'n/a';
  return fingersHighToLow.slice().reverse().map((finger) => {
    if (finger === null || finger === undefined) return 'x';
    if (finger === 0) return 'o';
    return String(finger);
  }).join('');
}

function formatBarre(barre) {
  if (!barre) return 'no barre';
  return `barre ${barre.fret}fr ${STRING_NAMES_HIGH_TO_LOW[barre.from]}-${STRING_NAMES_HIGH_TO_LOW[barre.to]}`;
}

function formatMutes(mutes) {
  if (!Array.isArray(mutes) || mutes.length === 0) return 'none';
  return mutes.map((mute) => {
    const stringName = STRING_NAMES_HIGH_TO_LOW[mute.string] || `string ${mute.string}`;
    const actor = mute.actor || 'unknown';
    const context = mute.context ? ` (${mute.context})` : '';
    return `${stringName}: ${actor}${context}`;
  }).join(', ');
}

function ensureFingerData(form) {
  if (form.fingers) return form;
  const assigned = padAssignFingers(form.frets);
  return { ...form, fingers: assigned.fingers, barre: assigned.barre };
}

function getForms(item) {
  return padEnumGuitarChordForms(
    item.intervals,
    item.rootPC,
    TUNING_HIGH_TO_LOW,
    21,
    4,
    { maxResults: 10, weights: FOLK_WEIGHTS },
  );
}

function analyzeItem(item) {
  const refFrets = item.refs.map(parseShapeLowToHigh);
  const forms = getForms(item);
  const refMatches = item.refs.map((shape, idx) => {
    const rank = forms.findIndex((form) => equalFrets(form.frets, refFrets[idx]));
    return { shape, rank: rank >= 0 ? rank + 1 : null };
  });
  const bestRefRank = refMatches.reduce((best, match) => {
    if (!match.rank) return best;
    return best === null ? match.rank : Math.min(best, match.rank);
  }, null);
  const topShape = forms[0] ? shapeFromHighToLow(forms[0].frets) : '';
  const topIsReference = item.refs.includes(topShape);
  const topIsAccepted = item.acceptedTopShapes.includes(topShape);
  const issueSet = new Set();
  forms.slice(0, 3).forEach((form) => {
    (form.qualityIssues || []).forEach((issue) => issueSet.add(issue));
  });
  const issueNotes = Array.from(issueSet);

  const reviewFlags = [];
  if (bestRefRank === null) reviewFlags.push('reference missing from top 10');
  else if (bestRefRank > 3) reviewFlags.push(`reference rank ${bestRefRank}`);
  if (!topIsReference && !topIsAccepted) reviewFlags.push('engine top differs');
  const needsReview = item.tier !== 'secondary' && reviewFlags.length > 0;

  return { ...item, forms, refMatches, bestRefRank, topShape, topIsReference, topIsAccepted, issueNotes, reviewFlags, needsReview };
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function diagramSvg(fretsHighToLow, label, isReference, fingersHighToLow = null) {
  const frets = fretsHighToLow.slice().reverse();
  const fingers = Array.isArray(fingersHighToLow) ? fingersHighToLow.slice().reverse() : null;
  const sounding = frets.filter((f) => f !== null && f > 0);
  const minFret = sounding.length ? Math.min(...sounding) : 0;
  const maxFret = sounding.length ? Math.max(...sounding) : 4;
  const base = maxFret <= 4 ? 1 : minFret;
  const rows = 4;
  const width = 138;
  const height = 184;
  const left = 22;
  const top = 38;
  const gridW = 92;
  const gridH = 104;
  const stringGap = gridW / 5;
  const fretGap = gridH / rows;
  const accent = isReference ? '#f4b400' : '#56b4e9';

  const strings = [];
  for (let i = 0; i < 6; i += 1) {
    const x = left + stringGap * i;
    strings.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + gridH}" class="string"/>`);
  }
  const fretsLines = [];
  for (let r = 0; r <= rows; r += 1) {
    const y = top + fretGap * r;
    const cls = r === 0 && base === 1 ? 'nut' : 'fret';
    fretsLines.push(`<line x1="${left}" y1="${y}" x2="${left + gridW}" y2="${y}" class="${cls}"/>`);
  }
  const markers = frets.map((f, i) => {
    const x = left + stringGap * i;
    if (f === null) return `<text x="${x}" y="28" class="xo">x</text>`;
    if (f === 0) return `<text x="${x}" y="28" class="xo">o</text>`;
    const rel = f - base + 1;
    if (rel < 1 || rel > rows) return '';
    const y = top + fretGap * (rel - 0.5);
    const dotLabel = fingers && fingers[i] > 0 ? fingers[i] : f;
    return `<circle cx="${x}" cy="${y}" r="8.5" fill="${accent}"/><text x="${x}" y="${y + 4}" class="dotText">${dotLabel}</text>`;
  }).join('');
  const labels = STRING_NAMES_LOW_TO_HIGH.map((name, i) => {
    const x = left + stringGap * i;
    return `<text x="${x}" y="${height - 18}" class="stringLabel">${name}</text>`;
  }).join('');
  const baseText = base > 1 ? `<text x="${left + gridW + 8}" y="${top + 13}" class="base">${base}fr</text>` : '';

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${htmlEscape(label)}">
    <text x="${width / 2}" y="15" class="chordTitle">${htmlEscape(label)}</text>
    ${baseText}
    ${strings.join('')}
    ${fretsLines.join('')}
    ${markers}
    ${labels}
  </svg>`;
}

function renderFormCard(form, rank, isReference) {
  const formWithFingers = ensureFingerData(form);
  const shape = shapeFromHighToLow(form.frets);
  const issues = (form.qualityIssues || []).length ? form.qualityIssues.join(', ') : 'none';
  const muteText = form.referenceMeta ? `<br>mute ${formatMutes(form.referenceMeta.mutes)}` : '';
  const positionText = form.positionFamily ? `<br>${htmlEscape(form.positionFamily.label)} / ${form.movable ? 'movable' : 'fixed/open'}` : '';
  const meta = `issues ${issues}<br>fingers ${formatFingers(formWithFingers.fingers)} / ${formatBarre(formWithFingers.barre)}${muteText}${positionText}`;
  return `<div class="card ${isReference ? 'reference' : ''}">
    ${diagramSvg(form.frets, `${rank}. ${shape}`, isReference, formWithFingers.fingers)}
    <div class="meta">${meta}</div>
  </div>`;
}

function getReferenceFingerData(frets, item) {
  const meta = padGetGuitarFormKnowledge(
    frets,
    item.intervals,
    item.rootPC,
    TUNING_HIGH_TO_LOW,
    { tuningName: 'standard' },
  );
  if (meta && meta.fingerings && meta.fingerings.length > 0) {
    const fingering = meta.fingerings[0];
    return { fingers: fingering.fingers, barre: fingering.barre || null, meta };
  }
  const assigned = padAssignFingers(frets);
  return { fingers: assigned.fingers, barre: assigned.barre, meta: null };
}

function renderReferenceCard(shape, item) {
  const frets = parseShapeLowToHigh(shape);
  const assigned = getReferenceFingerData(frets, item);
  const muteText = assigned.meta ? `<br>mute ${formatMutes(assigned.meta.mutes)}` : '';
  const noteText = assigned.meta && assigned.meta.fingerings && assigned.meta.fingerings[0].note
    ? `<br>${htmlEscape(assigned.meta.fingerings[0].note)}`
    : '';
  return `<div class="card reference seed">
    ${diagramSvg(frets, `ref ${shape}`, true, assigned.fingers)}
    <div class="meta">web/common seed<br>fingers ${formatFingers(assigned.fingers)} / ${formatBarre(assigned.barre)}${muteText}${noteText}</div>
  </div>`;
}

function renderReport() {
  const generatedAt = new Date().toISOString();
  const analyzedGroups = REVIEW_CHORDS.map((group) => ({
    ...group,
    chords: group.chords.map(analyzeItem),
  }));

  const rows = analyzedGroups.flatMap((group) => group.chords.map((item) => {
    const matchText = item.refMatches.map((match) => `${match.shape}: ${match.rank ? `#${match.rank}` : '-'}`).join(', ');
    const rowClass = item.tier === 'secondary' ? 'secondary' : (item.needsReview ? 'needs' : 'ok');
    const flags = item.tier === 'secondary'
      ? `secondary context${item.reviewFlags.length ? `; ${item.reviewFlags.join('; ')}` : ''}`
      : (item.reviewFlags.join('; ') || 'ok');
    const noteHtml = item.notes.length ? `<br><span class="note">human: ${htmlEscape(item.notes.join(' / '))}</span>` : '';
    const techBits = [];
    if (item.humanFingering.length) techBits.push(`fingering: ${item.humanFingering.join(' / ')}`);
    if (item.muting.length) techBits.push(`muting: ${item.muting.join(' / ')}`);
    const techHtml = techBits.length ? `<br><span class="note">tech: ${htmlEscape(techBits.join(' | '))}</span>` : '';
    return `<tr class="${rowClass}">
      <td>${htmlEscape(group.key)}</td>
      <td>${htmlEscape(item.name)}</td>
      <td>${htmlEscape(item.role)}</td>
      <td>${htmlEscape(item.topShape)}</td>
      <td>${htmlEscape(matchText)}</td>
      <td>${htmlEscape(flags)}${item.issueNotes.length ? `<br><span class="note">issues: ${htmlEscape(item.issueNotes.join(', '))}</span>` : ''}${noteHtml}${techHtml}</td>
    </tr>`;
  })).join('\n');

  const sections = analyzedGroups.map((group) => {
    const items = group.chords.map((item) => {
      const topCards = item.forms.slice(0, 5).map((form, idx) => {
        const shape = shapeFromHighToLow(form.frets);
        return renderFormCard(form, idx + 1, item.refs.includes(shape));
      }).join('');
      const refCards = item.refs.map((shape) => renderReferenceCard(shape, item)).join('');
      const badgeClass = item.tier === 'secondary' ? 'secondaryBadge' : (item.needsReview ? 'needsBadge' : 'okBadge');
      const badgeText = item.tier === 'secondary' ? 'secondary' : (item.needsReview ? 'review' : 'ok');
      const summary = item.tier === 'secondary'
        ? `secondary context${item.reviewFlags.length ? `; ${item.reviewFlags.join('; ')}` : ''}`
        : (item.reviewFlags.join('; ') || 'reference shape appears in top range');
      const humanNotes = item.notes.length ? `<p class="humanNote">${htmlEscape(item.notes.join(' / '))}</p>` : '';
      const humanFingering = item.humanFingering.length ? `<p class="techNote"><strong>Fingering:</strong> ${htmlEscape(item.humanFingering.join(' / '))}</p>` : '';
      const muting = item.muting.length ? `<p class="techNote"><strong>Muting:</strong> ${htmlEscape(item.muting.join(' / '))}</p>` : '';
      return `<details ${item.needsReview ? 'open' : ''}>
        <summary>
          <strong>${htmlEscape(item.name)}</strong>
          <span>${htmlEscape(item.role)}</span>
          <span class="badge ${badgeClass}">${htmlEscape(badgeText)}</span>
          <span class="summaryText">${htmlEscape(summary)}${item.issueNotes.length ? ` / issues: ${htmlEscape(item.issueNotes.join(', '))}` : ''}</span>
        </summary>
        <h4>Reference seeds</h4>
        <div class="cards">${refCards}</div>
        <h4>64PE Folk/Open top 5</h4>
        <div class="cards">${topCards}</div>
        ${humanNotes}
        ${humanFingering}
        ${muting}
      </details>`;
    }).join('\n');
    return `<section>
      <h2>${htmlEscape(group.title)}</h2>
      ${items}
    </section>`;
  }).join('\n');

  const sourceList = SOURCES.map((source) => `<li><a href="${htmlEscape(source.url)}">${htmlEscape(source.label)}</a>: ${htmlEscape(source.note)}</li>`).join('\n');
  const ruleList = HUMAN_REVIEW_RULES.map((rule) => `<li>${htmlEscape(rule)}</li>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Folk/Open Guitar Voicing Review</title>
  <style>
    :root { color-scheme: dark; --bg:#181818; --panel:#242424; --line:#555; --text:#eee; --muted:#aaa; --blue:#56b4e9; --yellow:#f4b400; --red:#f26c64; --green:#009e73; }
    body { margin:0; padding:24px; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; line-height:1.5; }
    h1 { margin:0 0 8px; font-size:28px; }
    h2 { margin-top:32px; padding-bottom:8px; border-bottom:1px solid #3a3a3a; }
    h3, h4 { margin:16px 0 8px; }
    a { color:var(--blue); }
    .lead { max-width:960px; color:#d0d0d0; }
    table { width:100%; border-collapse:collapse; margin:20px 0 28px; font-size:13px; }
    th, td { border-bottom:1px solid #333; padding:8px; vertical-align:top; }
    th { text-align:left; background:#202020; position:sticky; top:0; }
    tr.needs td { background:rgba(242,108,100,.08); }
    tr.ok td { background:rgba(0,158,115,.06); }
    tr.secondary td { background:rgba(86,180,233,.06); }
    details { margin:14px 0; padding:12px; border:1px solid #3a3a3a; border-radius:8px; background:#202020; }
    summary { cursor:pointer; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    .summaryText { color:var(--muted); }
    .note { color:var(--muted); font-size:12px; }
    .humanNote { margin:12px 0 0; padding:10px 12px; border-left:4px solid var(--yellow); background:#2d2918; color:#e8e0c2; }
    .techNote { margin:8px 0 0; padding:8px 12px; border-left:4px solid var(--blue); background:#192633; color:#d8eaf5; }
    .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:700; }
    .needsBadge { background:var(--red); color:#111; }
    .okBadge { background:var(--green); color:#fff; }
    .secondaryBadge { background:var(--blue); color:#111; }
    .cards { display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start; }
    .card { width:154px; border:1px solid #3b3b3b; border-radius:8px; background:#282828; padding:8px 8px 10px; }
    .card.reference { border-color:var(--yellow); }
    .card.seed { background:#2d2918; }
    .meta { color:var(--muted); font-size:11px; min-height:34px; }
    svg { display:block; width:138px; height:184px; margin:0 auto 4px; }
    .string, .fret { stroke:var(--line); stroke-width:1.2; }
    .nut { stroke:#d0d0d0; stroke-width:5; }
    .chordTitle { fill:var(--text); font-size:13px; text-anchor:middle; font-weight:700; }
    .xo, .stringLabel, .base { fill:var(--muted); font-size:11px; text-anchor:middle; }
    .dotText { fill:#111; font-size:9px; text-anchor:middle; font-weight:700; }
    .sourceBox { background:var(--panel); border:1px solid #3a3a3a; border-radius:8px; padding:12px 16px; }
    @media (max-width: 760px) { body { padding:14px; } table { font-size:12px; } .card { width:145px; } }
  </style>
</head>
<body>
  <h1>Folk/Open Guitar Voicing Review</h1>
  <p class="lead">Generated ${htmlEscape(generatedAt)}. Yellow diagrams are web/common reference seeds. Blue diagrams are 64 Pad Explorer Folk/Open engine candidates. Open this file when deciding which folk/open shapes should rank high, low, or be excluded.</p>

  <div class="sourceBox">
    <h3>Source basis</h3>
    <ul>${sourceList}</ul>
    <h3>Human review rules</h3>
    <ul>${ruleList}</ul>
  </div>

  <h2>Review summary</h2>
  <table>
    <thead><tr><th>Key</th><th>Chord</th><th>Role</th><th>Engine top</th><th>Reference ranks</th><th>Flags</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  ${sections}
</body>
</html>
`;
}

fs.writeFileSync(OUT_FILE, renderReport(), 'utf8');
console.log(`Wrote ${OUT_FILE}`);
