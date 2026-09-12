from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    assert s.count(old) == 1, (path, s.count(old), old[:80])
    p.write_text(s.replace(old, new))

replace_once(
    'tests/unit/push-chord-entry-display.test.js',
    "  c.ensureAudioResumed=()=>{}; c.t=k=>k; c.padWebSendPushButtonLed=()=>{};\n",
    "  c.ensureAudioResumed=()=>{}; c.playMidiNotes=()=>{}; c.t=k=>k; c.padWebSendPushButtonLed=()=>{};\n",
)

p = Path('tests/unit/push-display-exposure.test.js')
s = p.read_text()
old = 'push-display-webusb-app.js?v=webusb-20260912-s1'
new = 'push-display-webusb-app.js?v=webusb-20260913-a04'
assert s.count(old) == 2, ('tests/unit/push-display-exposure.test.js', s.count(old), old)
p.write_text(s.replace(old, new))

p = Path('tests/unit/push-web-cc-integration.test.js')
s = p.read_text()
replacements = [
    ('push-web-control.js?v=1.8.0-chord-lower-s1', 'push-web-control.js?v=1.8.0-entry-a04'),
    ('midi.js?v=1.8.0-chord-pad-led', 'midi.js?v=1.8.0-entry-a04'),
]
for old, new in replacements:
    count = s.count(old)
    assert count >= 1, ('tests/unit/push-web-cc-integration.test.js', count, old)
    s = s.replace(old, new)
p.write_text(s)
