// ========================================
// DATA & CONSTANTS — 64 Pad Explorer (App-specific)
// Theory constants (SCALES, KEY_SPELLINGS, BUILDER_QUALITIES, etc.)
// are imported from pad-core/data.js via script tag.
// ========================================

// DOMContentLoaded utility (body-end scripts may fire after DOMContentLoaded)
function onReady(fn) {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

const IS_DEV = location.pathname.indexOf('64-pad-dev') !== -1;

// ======== GRID DESTRUCTURING (from pad-core GRID) ========
const { ROWS, COLS, BASE_MIDI, ROW_INTERVAL, COL_INTERVAL, PAD_SIZE, PAD_GAP, MARGIN } = GRID;

// ======== ADAPTER: pcName (bridges AppState → pad-core) ========
function getParentMajorKey(scaleIdx, key) { return padGetParentMajorKey(scaleIdx, key); }
function pcName(pc, contextKey) {
  // If user has explicitly toggled ♯/♭ preference, use it
  if (typeof _rootUseFlats !== 'undefined' && _rootUseFlats !== null) {
    return _rootUseFlats ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
  }
  // Otherwise, auto-detect from key context
  const parentKey = contextKey !== undefined ? contextKey : padGetParentMajorKey(AppState.scaleIdx, AppState.key);
  return KEY_SPELLINGS[parentKey][pc];
}

// ======== STATE ========
const AppState = {
  key: 0,
  mode: 'chord',  // 'scale' | 'chord' | 'input'
  scaleIdx: 0,
  octaveShift: 0, // -1, 0, +1, +2 — shifts entire grid like Push's octave up/down
  semitoneShift: 0, // -11 to +11 — fine-tune for 32-pad mode
  showParentScales: false, // Parent Scale panel toggle
  psSortMode: 'practical', // 'practical' | 'diatonic'
  diatonicMode: 'tetrad',  // 'tetrad' | 'triad'
  showMinorVariants: false, // 3 minor scales parallel display
  showSecDom: false,        // Secondary dominants display
  showParallelKey: false,   // Parallel key (同主調) display
  showHarmonicFn: false,    // T/SD/D harmonic function coloring
  // Velocity sensitivity (Push 3-style parameters)
  velThreshold: 0,   // 0-64: minimum input velocity, below = no sound
  velDrive: 0,       // -64 to +64: curve rise (+soft=loud, -need harder touch)
  velCompand: 0,     // -64 to +64: dynamic range compress(+)/expand(-)
  velRange: 127,     // 1-127: max output velocity
  showTips: true,    // startup tips for returning users
  showBadges: true,  // voicing box badge (A, B, C…) visibility
  colorOff: true,    // single-color mode: root keeps its color, every other lit pad is one color. Default ON.
  showAllPositions: false, // chord mode: false=basic form (one shape) only, true=all grid positions (overview + voicing boxes). The single source of truth for screen all-positions AND Push chord overview. Default OFF.
  performAllPositions: false, // Perform view DISPLAY ONLY (audio always plays slot.midiNotes verbatim): false=collapse the played voicing to ONE compact educational position near the recorded register (grey shape over blue/orange scale bg + degree/tension labels + "1/N" badge, like chord basic form), true=show ONLY the exact recorded MIDI pitches in grey over the same scale background. Beginner default OFF (one shape). Toggled by the Perform memory-row button #btn-perform-same-notes (active=same notes ON); not a 表示設定 panel field.
  padCFixed: false,  // Pad OS: lock pad display to C Major scale (urinami 2026-04-14)
  pushScaleRootColor: 3, // Push 3 palette index: scale root
  pushScaleToneColor: 122, // Push 3 palette index: scale tone
  pushPressedColor: 25, // Push 3 palette index: held/same-note highlight
  pushMemorySlotColor: 45, // Push 3 palette index: saved Memory slot
  pushPerformActiveColor: 9, // Push 3 palette index: active Perform slot
  pushLedColorSettingsVersion: 2,
};

const BuilderState = {
  step: 0,       // 0=not started, 1=root, 2=quality, 3=tension, 4=onchord
  root: null,     // 0-11
  quality: null,  // {name, label, pcs}
  tension: null,  // {label, mods}
  bass: null,     // 0-11 for slash chord
  bassInputMode: false, // true when piano keyboard is used for bass selection
};

const VoicingState = {
  omit5: false,
  rootless: false,
  omit3: false,
  shell: null,           // null, '137', '173'
  inversion: 0,          // 0=root, 1=1st, 2=2nd, 3=3rd
  drop: null,            // null, 'drop2', 'drop3'
  selectedBoxIdx: null,  // selected bounding box index for staff display
  lastBoxes: [],         // [{midiNotes: [...], alternatives: [...], currentAlt: n}, ...] stored from last render
  cycleIndices: {},      // { boxIdx: alternativeIdx } - tracks cycling state per box
  _preservePosition: false, // flag: find nearest box after chord change (transpose/inversion/drop)
  basicOctave: 0,        // basic-form mode: octaves the shown shape is shifted up/down on the grid (Shift+Up/Down). View-only, not serialized; clamped to grid each render.
  basicPosIdx: 0,        // basic-form mode: which same-register pad arrangement is shown (Space cycles). View-only; reset on chord change, clamped each render.
};

const PlainState = {
  activeNotes: new Set(),        // MIDIノート（クリックでon/off）
  memory: Array(16).fill(null),  // [{midiNotes: number[], chordName: string}] × 16
  currentSlot: null,             // 現在選択中スロット (0-15)
  subMode: 'idle',               // 'idle' | 'capture' | 'edit'
  captureIndex: 0,               // 次にキャプチャするスロット番号
};

const PerformState = {
  activePad: null,              // 現在再生中のパッドインデックス
  onePosIdx: 0,                 // perform one-position view: which compact pad arrangement is shown (badge cycles). View-only, display only — never re-triggers playback; reset to 0 on each slot tap, clamped each render.
};

// ======== GUITAR/BASS POSITION STATE (v3.19) ========
const GuitarPositionState = {
  alternatives: [],   // padEnumGuitarChordForms results
  currentAlt: 0,      // currently displayed index
  enabled: false,     // true only in Chord mode + chord confirmed
  _lastKey: null,     // cache key for recalc detection
  groups: [],         // [{label, forms:[...]}, ...]
  currentGroupIdx: 0,
  currentAltInGroup: 0,
};
const BassPositionState = {
  alternatives: [],
  currentAlt: 0,
  enabled: false,
  _lastKey: null,
  groups: [],
  currentGroupIdx: 0,
  currentAltInGroup: 0,
};

// ======== TASTY STATE (HPS exclusive) ========
const TastyState = {
  hpsUnlocked: false,    // URL parameter check
  enabled: false,        // TASTY mode active
  recipes: null,         // loaded from tasty-recipes.json
  voicings: null,        // loaded from tasty-voicings.json (129 recipes)
  currentCategory: null, // 'major' | 'dominant' | 'minor'
  currentMatches: [],    // voicing entries matching current category
  currentIndex: -1,      // which voicing is active (-1 = none)
  originalQuality: null, // BuilderState.quality before TASTY
  originalTension: null, // BuilderState.tension before TASTY
  midiNotes: [],         // current voicing MIDI notes
  outOfRange: [],        // MIDI notes outside pad range
  degreeMap: {},         // {midiNote: degreeString} — recipe degree per note
  topNote: null,         // highest MIDI note in current voicing
  topFilter: null,       // top-note degree filter (e.g. '1', '3', 'b7') or null = all
  padPositions: [],      // compact pad positions from padFindCompactPositions
};

// ======== STOCK VOICING STATE ========
const StockState = {
  hpsUnlocked: false,    // same gate as TASTY (?hps)
  enabled: false,        // STOCK mode active
  data: null,            // loaded from stock-voicings.json
  currentCategory: null, // 'major' | 'dominant' | 'minor' | 'halfDiminished' | 'diminished' | 'suspended'
  currentSubtype: null,  // e.g. 'Maj7', 'Min7', 'Dom7'
  currentMatches: [],    // voicing entries matching current chord type
  currentIndex: -1,      // which voicing is active (-1 = none)
  lhMidi: [],            // left hand MIDI notes
  rhMidi: [],            // right hand MIDI notes
  degreeMap: {},         // {midiNote: degreeString}
  padPositions: [],      // compact pad positions from padFindCompactPositions
};

// ======== BANK STATE (v2.50) ========
const BankState = {
  banks: [],         // [{id, name, memory: Array(16)}]
  activeBankId: null,
};

function getActiveBank() {
  return BankState.banks.find(b => b.id === BankState.activeBankId) || BankState.banks[0];
}

function cloneVoicingMeta(meta) {
  return meta ? Object.assign({}, meta) : null;
}

function makeMemorySlot(midiNotes, chordName, voicingMeta) {
  const slot = { midiNotes: [...midiNotes], chordName };
  const meta = cloneVoicingMeta(voicingMeta);
  if (meta) slot.voicingMeta = meta;
  return slot;
}

function cloneMemorySlot(slot) {
  return slot ? makeMemorySlot(slot.midiNotes || [], slot.chordName || '', slot.voicingMeta || null) : null;
}

function syncMemoryToActiveBank() {
  const bank = getActiveBank();
  if (bank) bank.memory = PlainState.memory.map(cloneMemorySlot);
}

function loadBankMemory() {
  const bank = getActiveBank();
  if (bank) PlainState.memory = bank.memory.map(cloneMemorySlot);
}

// ======== SETTINGS PERSISTENCE ========
function readToggleState(id, fallback) {
  try {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (el) return el.classList.contains('active');
  } catch(_) {}
  return !!fallback;
}

function saveAppSettings() {
  try {
    try { syncMemoryToActiveBank(); } catch(_) {}
    const s = {
      key: AppState.key,
      mode: AppState.mode,
      scaleIdx: AppState.scaleIdx,
      octaveShift: AppState.octaveShift,
      showGuitar: readToggleState('inst-toggle-guitar', typeof showGuitar !== 'undefined' ? showGuitar : false),
      showBass: readToggleState('inst-toggle-bass', typeof showBass !== 'undefined' ? showBass : false),
      showPiano: readToggleState('inst-toggle-piano', typeof showPiano !== 'undefined' ? showPiano : false),
      linkMode: readToggleState('inst-toggle-link', typeof linkMode !== 'undefined' ? linkMode : false),
      showStaff: typeof showStaff !== 'undefined' ? showStaff : false,
      showCircle: typeof showCircle !== 'undefined' ? showCircle : true,
      showSound: typeof showSound !== 'undefined' ? showSound : true,
      guitarLabelMode: typeof guitarLabelMode !== 'undefined' ? guitarLabelMode : 'name',
      velThreshold: AppState.velThreshold,
      velDrive: AppState.velDrive,
      velCompand: AppState.velCompand,
      velRange: AppState.velRange,
      semitoneShift: AppState.semitoneShift,
      diatonicMode: AppState.diatonicMode,
      showMinorVariants: AppState.showMinorVariants,
      showSecDom: AppState.showSecDom,
      showParallelKey: AppState.showParallelKey,
      showParentScales: AppState.showParentScales,
      showHarmonicFn: AppState.showHarmonicFn,
      banks: typeof BankState !== 'undefined' ? BankState.banks : [],
      activeBankId: typeof BankState !== 'undefined' ? BankState.activeBankId : null,
      showTips: AppState.showTips,
      showBadges: AppState.showBadges,
      padCFixed: AppState.padCFixed,
      colorOff: AppState.colorOff,
      showAllPositions: AppState.showAllPositions,
      performAllPositions: AppState.performAllPositions,
      pushScaleRootColor: AppState.pushScaleRootColor,
      pushScaleToneColor: AppState.pushScaleToneColor,
      pushPressedColor: AppState.pushPressedColor,
      pushMemorySlotColor: AppState.pushMemorySlotColor,
      pushPerformActiveColor: AppState.pushPerformActiveColor,
      pushLedColorSettingsVersion: AppState.pushLedColorSettingsVersion,
    };
    const serialized = JSON.stringify(s);
    localStorage.setItem('64pad-settings', serialized);
    if (typeof _juceInvoke === 'function') _juceInvoke('saveDesktopSettings', serialized);
  } catch(_) {}
}

function loadAppSettings() {
  try {
    const raw = localStorage.getItem('64pad-settings');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.key !== undefined && s.key >= 0 && s.key <= 11) AppState.key = s.key;
    if (s.mode === 'plain') s.mode = 'input';
    if (s.mode && ['scale','chord','input'].includes(s.mode)) AppState.mode = s.mode;
    if (s.scaleIdx !== undefined && s.scaleIdx >= 0 && s.scaleIdx < SCALES.length) AppState.scaleIdx = s.scaleIdx;
    if (s.octaveShift !== undefined && s.octaveShift >= -1 && s.octaveShift <= 3) AppState.octaveShift = s.octaveShift;
    if (s.showGuitar !== undefined) showGuitar = s.showGuitar;
    if (s.showBass !== undefined) showBass = s.showBass;
    if (s.showPiano !== undefined) showPiano = s.showPiano;
    if (s.linkMode !== undefined) linkMode = s.linkMode;
    if (s.showStaff !== undefined) showStaff = s.showStaff;
    if (s.showCircle !== undefined) showCircle = s.showCircle;
    if (s.showSound !== undefined) showSound = s.showSound;
    if (s.guitarLabelMode) guitarLabelMode = s.guitarLabelMode;
    if (s.velThreshold !== undefined) AppState.velThreshold = s.velThreshold;
    if (s.velDrive !== undefined) AppState.velDrive = s.velDrive;
    if (s.velCompand !== undefined) AppState.velCompand = s.velCompand;
    if (s.velRange !== undefined) AppState.velRange = s.velRange;
    if (s.semitoneShift !== undefined && s.semitoneShift >= -11 && s.semitoneShift <= 11) AppState.semitoneShift = s.semitoneShift;
    if (s.diatonicMode === 'triad' || s.diatonicMode === 'tetrad') AppState.diatonicMode = s.diatonicMode;
    if (s.showMinorVariants !== undefined) AppState.showMinorVariants = s.showMinorVariants;
    if (s.showSecDom !== undefined) AppState.showSecDom = s.showSecDom;
    if (s.showParallelKey !== undefined) AppState.showParallelKey = s.showParallelKey;
    if (s.showParentScales !== undefined) AppState.showParentScales = s.showParentScales;
    if (s.showHarmonicFn !== undefined) AppState.showHarmonicFn = s.showHarmonicFn;
    if (s.showTips === false) AppState.showTips = false;
    if (s.showBadges !== undefined) AppState.showBadges = s.showBadges;
    if (s.padCFixed === true) AppState.padCFixed = true;
    if (s.colorOff !== undefined) AppState.colorOff = s.colorOff === true;
    if (s.showAllPositions !== undefined) AppState.showAllPositions = s.showAllPositions === true;
    else if (s.pushVoicingOverview === true) AppState.showAllPositions = true; // migrate retired pushVoicingOverview key
    if (s.performAllPositions !== undefined) AppState.performAllPositions = s.performAllPositions === true;
    if (s.pushLedColorSettingsVersion === AppState.pushLedColorSettingsVersion) {
      if (s.pushScaleRootColor !== undefined && s.pushScaleRootColor >= 0 && s.pushScaleRootColor <= 127) AppState.pushScaleRootColor = s.pushScaleRootColor;
      if (s.pushScaleToneColor !== undefined && s.pushScaleToneColor >= 0 && s.pushScaleToneColor <= 127) AppState.pushScaleToneColor = s.pushScaleToneColor;
      if (s.pushPressedColor !== undefined && s.pushPressedColor >= 0 && s.pushPressedColor <= 127) AppState.pushPressedColor = s.pushPressedColor;
      if (s.pushMemorySlotColor !== undefined && s.pushMemorySlotColor >= 0 && s.pushMemorySlotColor <= 127) AppState.pushMemorySlotColor = s.pushMemorySlotColor;
      if (s.pushPerformActiveColor !== undefined && s.pushPerformActiveColor >= 0 && s.pushPerformActiveColor <= 127) AppState.pushPerformActiveColor = s.pushPerformActiveColor;
    }
    if (typeof _juceInvoke === 'function') _juceInvoke('setPushHeldColor', AppState.pushPressedColor);
    // Migration: banks
    if (Array.isArray(s.banks) && s.banks.length > 0) {
      BankState.banks = s.banks;
      BankState.activeBankId = s.activeBankId || s.banks[0].id;
    } else if (Array.isArray(s.memory) && s.memory.length === 16) {
      BankState.banks = [{ id: 'default', name: 'Bank 1', memory: s.memory }];
      BankState.activeBankId = 'default';
    } else {
      BankState.banks = [{ id: 'default', name: 'Bank 1', memory: Array(16).fill(null) }];
      BankState.activeBankId = 'default';
    }
    loadBankMemory();
  } catch(_) {}
}

function showSaveToast() {
  const toast = document.getElementById('slot-save-toast');
  if (toast) {
    toast.textContent = typeof t === 'function' ? t('notify.settings_saved') : 'Settings saved';
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
  }
}

function resetVoicingSelection() {
  VoicingState.selectedBoxIdx = null;
  VoicingState.cycleIndices = {};
  VoicingState.basicPosIdx = 0;  // basic-form: back to the compact arrangement on chord/voicing change
}

// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  SCALES, NOTE_NAMES_SHARP, NOTE_NAMES_FLAT, FLAT_MAJOR_KEYS, KEY_SPELLINGS,
  BUILDER_QUALITIES, TENSION_ROWS, SCALE_AVAIL_TENSIONS,
  GRID, ROWS, COLS, BASE_MIDI, ROW_INTERVAL, COL_INTERVAL, PAD_SIZE, PAD_GAP, MARGIN,
  SCALE_DEGREE_NAMES, PC_TO_TENSION_NAME, TENSION_NAME_TO_PC,
  AppState, BuilderState, VoicingState, PlainState, PerformState, TastyState, StockState, BankState,
  GuitarPositionState, BassPositionState,
  resetVoicingSelection, getParentMajorKey, pcName, onReady, IS_DEV,
  getActiveBank, syncMemoryToActiveBank, loadBankMemory,
  GRID_32,
};
