import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const sourceRoot = process.cwd();
function element(tag) {
  const attrs = new Map();
  return { tag, children: [], style: {},
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k) ?? null; },
    appendChild(e) { this.children.push(e); }, addEventListener() {},
  };
}
export function dm7({ all = false, fixed = true, inversion = 0, root = 2, colorOff = true, quality = { name: 'm7', pcs: [0, 3, 7, 10] }, position = 0, renderFile = 'render.js' } = {}) {
  const c = vm.createContext({
    location: { pathname: '/', search: '' },
    document: { readyState: 'loading', addEventListener() {}, createElementNS: (_, tag) => element(tag), getElementById: () => null },
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null }, t: s => s,
    memoryViewMode: null, instrumentInputActive: false,
    _instrumentPadSet: null, _instrumentMidiSet: null,
    _voicingReflectMode: false, _guitarSyncSource: null, _stockReflectMode: false,
    _selectedPS: null, _psAutoSelect: false, padExtNotes: new Set(),
    svg: element('svg'),
  });
  c.window = c;
  for (const file of ['pad-core/data.js', 'pad-core/theory.js', 'pad-core/render.js',
    'data.js', 'theory.js', 'plain.js', 'builder.js', 'launchpad-programmer.js', 'render.js']) {
    const actualFile = file === 'render.js' ? renderFile : file;
    vm.runInContext(fs.readFileSync(path.resolve(sourceRoot, actualFile), 'utf8'), c, { filename: actualFile });
  }
  vm.runInContext(`
    AppState.mode = 'chord'; AppState.key = 0; AppState.scaleIdx = 0;
    AppState.colorOff = ${colorOff}; AppState.padCFixed = ${fixed}; AppState.showAllPositions = ${all};
    BuilderState.root = ${root}; BuilderState.quality = ${JSON.stringify(quality)}; VoicingState.basicPosIdx = ${position};
    VoicingState.inversion = ${inversion};
    var actualNotes = getCurrentChordMidiNotes();
    var arrangements = basicFormArrangements();
    var padState = computeRenderState();
  `, c);
  const source = fs.readFileSync(path.resolve(sourceRoot, renderFile), 'utf8');
  const start = source.indexOf('  // Basic-form default:');
  const end = source.indexOf("  if (AppState.mode === 'scale' && typeof doubleStopActive", start);
  vm.runInContext(source.slice(start, end), c);
  vm.runInContext('renderPads(svg, padState)', c);
  const read = expr => JSON.parse(vm.runInContext('JSON.stringify(' + expr + ')', c));
  return { c, read,
    rerender() {
      vm.runInContext('actualNotes = getCurrentChordMidiNotes(); arrangements = basicFormArrangements(); padState = computeRenderState();', c);
      c.svg.children = [];
      vm.runInContext(source.slice(start, end), c);
      vm.runInContext('renderPads(svg, padState)', c);
    },
    get pads() { return c.svg.children.filter(e => e.tag === 'rect' && e.getAttribute('class') === 'pad'); },
  };
}
