from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    count = s.count(old)
    assert count == 1, (path, count, old[:120])
    p.write_text(s.replace(old, new))

# CONFIRM-1: Standalone confirms an unselected Root as C before advancing.
replace_once(
    'push-web-control.js',
    """    if (controlState.entryStep === 'root') {\n      var root = index === undefined ? controlState.entryRoot : index;\n      if (root < 0 || root > 11) return true;\n""",
    """    if (controlState.entryStep === 'root') {\n      var root = index === undefined ? controlState.entryRoot : index;\n      if (root === null || root === undefined) root = 0;\n      if (root < 0 || root > 11) return true;\n""",
)

# CONFIRM-2: preserve signed relative Jog magnitude like Standalone.
replace_once(
    'push-web-control.js',
    """      else controlState.entryRoot = wrap(controlState.entryRoot + (delta < 0 ? -1 : 1), 12);\n""",
    """      else controlState.entryRoot = wrap(controlState.entryRoot + delta, 12);\n""",
)
replace_once(
    'push-web-control.js',
    """      controlState.entryQualityIndex = wrap(controlState.entryQualityIndex + (delta < 0 ? -1 : 1), Math.max(1, list.length));\n""",
    """      controlState.entryQualityIndex = wrap(controlState.entryQualityIndex + delta, Math.max(1, list.length));\n""",
)

# Delivery identity for the changed runtime asset.
for path in ['index.html', 'sw.js']:
    p = Path(path)
    s = p.read_text()
    old = 'push-web-control.js?v=1.8.0-entry-a04'
    new = 'push-web-control.js?v=1.8.0-entry-a04b'
    assert s.count(old) == 1, (path, old, s.count(old))
    p.write_text(s.replace(old, new))
replace_once(
    'sw.js',
    "var CACHE_NAME = '64pad-v180-preview-20260913-entry-a04';",
    "var CACHE_NAME = '64pad-v180-preview-20260913-entry-a04b';",
)

# Existing identity-contract tests follow the new exact asset URL/cache generation.
p = Path('tests/unit/push-web-cc-integration.test.js')
s = p.read_text()
old = 'push-web-control.js?v=1.8.0-entry-a04'
new = 'push-web-control.js?v=1.8.0-entry-a04b'
assert s.count(old) == 3, ('tests/unit/push-web-cc-integration.test.js', s.count(old), old)
p.write_text(s.replace(old, new))
replace_once(
    'tests/unit/push-display-exposure.test.js',
    '64pad-v180-preview-20260913-entry-a04',
    '64pad-v180-preview-20260913-entry-a04b',
)

# Add regressions for both audit CONFIRMs.
p = Path('tests/unit/push-chord-entry-display.test.js')
s = p.read_text()
marker = """  it('display renderer consumes chordEntry rows/title/detail instead of inventing another entry state',()=>{\n"""
assert s.count(marker) == 1
insert = r'''  it('Jog press with no Root selected confirms C before advancing to Quality',()=>{
    const b=browser(); b.logical(21,0);
    expect(b.read('[BuilderState.root,padWebPushControlState.entryRoot]')).toEqual([null,null]);
    b.logical(34,0);
    expect(b.read('[BuilderState.root,padWebPushControlState.entryRoot,padWebPushControlState.entryStep]')).toEqual([0,0,'quality']);
    expect(b.snap().title).toBe('Select Quality');
  });
  it('preserves signed relative Jog magnitude for Root and Quality after the null first step',()=>{
    const b=browser(); b.logical(21,0);
    b.logical(30,1); // null -> C, same as Standalone first-step rule
    b.logical(30,3);
    expect(b.read('padWebPushControlState.entryRoot')).toBe(3);
    b.logical(21,3); // commit D#/Eb and enter Quality
    expect(b.read('padWebPushControlState.entryStep')).toBe('quality');
    b.run('padWebPushControlState.entryQualityIndex=0');
    b.logical(30,3);
    expect(b.read('padWebPushControlState.entryQualityIndex')).toBe(3);
    b.logical(30,-2);
    expect(b.read('padWebPushControlState.entryQualityIndex')).toBe(1);
  });
'''
p.write_text(s.replace(marker, insert + marker))
