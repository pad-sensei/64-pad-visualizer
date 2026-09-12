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
replace_once(
    'tests/unit/push-display-exposure.test.js',
    'push-display-webusb-app.js?v=webusb-20260912-s1',
    'push-display-webusb-app.js?v=webusb-20260913-a04',
)
