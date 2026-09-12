from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    count = s.count(old)
    assert count == 1, (path, count, old[:120])
    p.write_text(s.replace(old, new))

# Human Gate finding: Chord construction works, but normal Chord screen hides the
# Standalone entry labels. Restore only those two labels; keep their existing actions.
replace_once(
    'push-display-webusb-app.js',
    "        : ['', 'Tasty', 'Stock', 'Guitar', '', 'Tension', 'Key', 'Scale']);",
    "        : ['Root', 'Tasty', 'Stock', 'Guitar', 'Quality', 'Tension', 'Key', 'Scale']);",
)

# Delivery identity for the changed display runtime.
for path in ['index.html', 'sw.js']:
    p = Path(path)
    s = p.read_text()
    old = 'push-display-webusb-app.js?v=webusb-20260913-a04'
    new = 'push-display-webusb-app.js?v=webusb-20260913-a04c'
    assert s.count(old) == 1, (path, s.count(old))
    p.write_text(s.replace(old, new))

replace_once(
    'sw.js',
    "var CACHE_NAME = '64pad-v180-preview-20260913-entry-a04b';",
    "var CACHE_NAME = '64pad-v180-preview-20260913-entry-a04c';",
)

# Lock the normal Chord surface labels and delivery identity.
p = Path('tests/unit/push-display-exposure.test.js')
s = p.read_text()
s = s.replace('push-display-webusb-app.js?v=webusb-20260913-a04', 'push-display-webusb-app.js?v=webusb-20260913-a04c')
s = s.replace("var CACHE_NAME = '64pad-v180-preview-20260913-entry-a04b';", "var CACHE_NAME = '64pad-v180-preview-20260913-entry-a04c';")
marker = "  it('invalidates the preview through its SW generation while retaining matching asset URLs', () => {\n"
assert marker in s
insert = """  it('shows Standalone Root and Quality entry labels on the normal Chord screen', () => {\n    expect(app).toContain(\"['Root', 'Tasty', 'Stock', 'Guitar', 'Quality', 'Tension', 'Key', 'Scale']\");\n  });\n\n"""
s = s.replace(marker, insert + marker, 1)
p.write_text(s)

# Keep integration delivery string assertions synchronized if present.
p = Path('tests/unit/push-web-cc-integration.test.js')
s = p.read_text()
s = s.replace('push-display-webusb-app.js?v=webusb-20260913-a04', 'push-display-webusb-app.js?v=webusb-20260913-a04c')
p.write_text(s)
