from pathlib import Path
import sys


def add_tests(root: Path) -> None:
    p = root / 'tests/unit/push-web-control.test.js'
    s = p.read_text()
    marker = '\n});\n'
    if not s.endswith(marker):
        raise RuntimeError('unexpected push-web-control test footer')
    addition = r'''

  it('preserves signed relative magnitude for D-pad completed-chord semitone moves', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { root: 10, quality: { name: 'maj7', pcs: [0, 4, 7, 11] }, tension: '9', bass: 2 };

    expect(handleLogical(35, 3)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(1);
    expect(globalThis.BuilderState.bass).toBe(5);

    expect(handleLogical(35, -4)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(9);
    expect(globalThis.BuilderState.bass).toBe(1);
  });

  it('preserves signed relative magnitude on the chord-root encoder path', () => {
    globalThis.AppState = { mode: 'chord' };
    globalThis.BuilderState = { root: 1, quality: { name: 'm7', pcs: [0, 3, 7, 10] }, tension: null, bass: 8 };

    expect(handleLogical(56, 5)).toBe(true);
    expect(globalThis.BuilderState.root).toBe(6);
    expect(globalThis.BuilderState.bass).toBe(1);
  });
'''
    if "preserves signed relative magnitude for D-pad" in s:
        raise RuntimeError('signed delta tests already present')
    p.write_text(s[:-len(marker)] + addition + marker)


def apply_product(root: Path) -> None:
    p = root / 'push-web-control.js'
    s = p.read_text()
    old = """  function nudgeChordRoot(delta) {\n    if (!runtime.BuilderState || runtime.BuilderState.root === null || runtime.BuilderState.root === undefined || !runtime.BuilderState.quality) return false;\n    var step = delta < 0 ? -1 : 1;\n    if (runtime.TastyState && runtime.TastyState.enabled) call('disableTasty');\n    if (runtime.StockState && runtime.StockState.enabled) call('disableStock');\n    runtime.BuilderState.root = wrap(runtime.BuilderState.root + step, 12);\n    if (runtime.BuilderState.bass !== null && runtime.BuilderState.bass !== undefined) {\n      runtime.BuilderState.bass = wrap(runtime.BuilderState.bass + step, 12);\n    }\n"""
    new = """  function nudgeChordRoot(delta) {\n    if (!runtime.BuilderState || runtime.BuilderState.root === null || runtime.BuilderState.root === undefined || !runtime.BuilderState.quality) return false;\n    if (runtime.TastyState && runtime.TastyState.enabled) call('disableTasty');\n    if (runtime.StockState && runtime.StockState.enabled) call('disableStock');\n    runtime.BuilderState.root = wrap(runtime.BuilderState.root + delta, 12);\n    if (runtime.BuilderState.bass !== null && runtime.BuilderState.bass !== undefined) {\n      runtime.BuilderState.bass = wrap(runtime.BuilderState.bass + delta, 12);\n    }\n"""
    if s.count(old) != 1:
        raise RuntimeError('unexpected nudgeChordRoot source')
    p.write_text(s.replace(old, new))

    old_cache = '64pad-v180-preview-20260912-semitone-5'
    new_cache = '64pad-v180-preview-20260912-semitone-delta-6'
    sw = root / 'sw.js'
    ss = sw.read_text()
    if ss.count(old_cache) != 1:
        raise RuntimeError('unexpected sw cache identity')
    sw.write_text(ss.replace(old_cache, new_cache))

    exp = root / 'tests/unit/push-display-exposure.test.js'
    es = exp.read_text()
    if old_cache not in es:
        raise RuntimeError('expected cache identity not present in exposure test')
    exp.write_text(es.replace(old_cache, new_cache))


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in {'tests', 'product'}:
        raise SystemExit('usage: apply-semitone-delta-f460.py tests|product ROOT')
    root = Path(sys.argv[2]).resolve()
    (add_tests if sys.argv[1] == 'tests' else apply_product)(root)
