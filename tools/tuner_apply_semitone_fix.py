#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
mode = sys.argv[2]

if mode == 'tests':
    p = root / 'tests/unit/push-web-control.test.js'
    s = p.read_text()
    old = "  'getBuilderPCS', 'cycleTasty', 'cycleStock',\n];"
    new = "  'getBuilderPCS', 'cycleTasty', 'cycleStock', 'selectRoot',\n  'disableTasty', 'disableStock', 'resetVoicingSelection',\n  'updateKeyButtons', 'updateRootButtons', 'renderParentScales',\n];"
    assert s.count(old) == 1
    s = s.replace(old, new)
    pos = s.rfind('\n});\n')
    assert pos >= 0
    tests = r'''

  it('nudges a completed chord by semitone without resetting its chord state', () => {
    const quality = { name: 'm7', pcs: [0, 3, 7, 10] };
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = {
      root: 11, quality, tension: '9', bass: 4,
      _fromDiatonic: true, _diatonicScaleIdx: 0,
      _fromSecDom: true, _secDomTargetIsMajor: true,
    };
    let selectRootCalls = 0;
    let resetCalls = 0;
    globalThis.selectRoot = (root) => {
      selectRootCalls += 1;
      globalThis.BuilderState.root = root;
      globalThis.BuilderState.quality = null;
      globalThis.BuilderState.tension = null;
      globalThis.BuilderState.bass = null;
    };
    globalThis.resetVoicingSelection = () => { resetCalls += 1; };

    expect(handleLogical(35, 1)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(0);
    expect(globalThis.BuilderState.bass).toBe(5);
    expect(globalThis.BuilderState.quality).toBe(quality);
    expect(globalThis.BuilderState.tension).toBe('9');
    expect(globalThis.BuilderState._fromDiatonic).toBe(false);
    expect(globalThis.BuilderState._diatonicScaleIdx).toBeUndefined();
    expect(globalThis.BuilderState._fromSecDom).toBe(false);
    expect(globalThis.BuilderState._secDomTargetIsMajor).toBeUndefined();
    expect(selectRootCalls).toBe(0);
    expect(resetCalls).toBe(1);
  });

  it('matches Standalone by leaving active voicing engines before chord semitone nudge', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { root: 0, quality: { name: '7', pcs: [0, 4, 7, 10] }, tension: null, bass: null };
    globalThis.TastyState = { enabled: true };
    globalThis.StockState = { enabled: true };
    globalThis.disableTasty = () => { globalThis.TastyState.enabled = false; };
    globalThis.disableStock = () => { globalThis.StockState.enabled = false; };

    expect(handleLogical(35, -1)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(11);
    expect(globalThis.TastyState.enabled).toBe(false);
    expect(globalThis.StockState.enabled).toBe(false);
  });
'''
    p.write_text(s[:pos] + tests + s[pos:])
    raise SystemExit(0)

if mode == 'source':
    p = root / 'push-web-control.js'
    s = p.read_text()
    old = '''  function nudgeChordRoot(delta) {
    if (!runtime.BuilderState || runtime.BuilderState.root === null || runtime.BuilderState.root === undefined) return false;
    var next = wrap(runtime.BuilderState.root + (delta < 0 ? -1 : 1), 12);
    if (typeof global.selectRoot === 'function') {
      global.selectRoot(next);
    } else {
      runtime.BuilderState.root = next;
      if (runtime.BuilderState.bass !== null && runtime.BuilderState.bass !== undefined) {
        runtime.BuilderState.bass = wrap(runtime.BuilderState.bass + (delta < 0 ? -1 : 1), 12);
      }
    }
    refresh();
    return true;
  }
'''
    new = '''  function nudgeChordRoot(delta) {
    if (!runtime.BuilderState || runtime.BuilderState.root === null || runtime.BuilderState.root === undefined || !runtime.BuilderState.quality) return false;
    var step = delta < 0 ? -1 : 1;
    if (runtime.TastyState && runtime.TastyState.enabled) call('disableTasty');
    if (runtime.StockState && runtime.StockState.enabled) call('disableStock');
    runtime.BuilderState.root = wrap(runtime.BuilderState.root + step, 12);
    if (runtime.BuilderState.bass !== null && runtime.BuilderState.bass !== undefined) {
      runtime.BuilderState.bass = wrap(runtime.BuilderState.bass + step, 12);
    }
    // Match Standalone: semitone navigation keeps the completed chord intact.
    // selectRoot() is an entry action and would clear quality/tension/bass.
    runtime.BuilderState._fromDiatonic = false;
    runtime.BuilderState._diatonicScaleIdx = undefined;
    runtime.BuilderState._fromSecDom = false;
    runtime.BuilderState._secDomTargetIsMajor = undefined;
    call('resetVoicingSelection');
    refresh();
    return true;
  }
'''
    assert s.count(old) == 1
    p.write_text(s.replace(old, new))

    p = root / 'sw.js'
    s = p.read_text()
    old_cache = "var CACHE_NAME = '64pad-v180-preview-20260912-display-active-4';"
    new_cache = "var CACHE_NAME = '64pad-v180-preview-20260912-semitone-5';"
    assert s.count(old_cache) == 1
    p.write_text(s.replace(old_cache, new_cache))

    p = root / 'tests/unit/push-display-exposure.test.js'
    s = p.read_text()
    old_expect = "    expect(sw).toContain(\"var CACHE_NAME = '64pad-v180-preview-20260912-display-active-4';\");\n    expect(sw).not.toContain(\"var CACHE_NAME = '64pad-v180-preview-20260912-display-state-3';\");"
    new_expect = "    expect(sw).toContain(\"var CACHE_NAME = '64pad-v180-preview-20260912-semitone-5';\");\n    expect(sw).not.toContain(\"var CACHE_NAME = '64pad-v180-preview-20260912-display-active-4';\");"
    assert s.count(old_expect) == 1
    p.write_text(s.replace(old_expect, new_expect))
    raise SystemExit(0)

raise SystemExit('usage: helper <product-dir> tests|source')
