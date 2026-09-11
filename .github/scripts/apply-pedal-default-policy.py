from pathlib import Path
import re


def replace_once(path, old, new, label):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'{label} anchor missing in {path}')
    p.write_text(s.replace(old, new, 1))


# MIDI diagnostics + runtime: preserve the hardware's existing Pedal/CV mode.
replace_once(
    'midi.js',
    "  var pedal = d.pedalMode ? JSON.stringify(d.pedalMode) : '-';",
    "  var pedal = d.pedalPolicy || '-';",
    'pedal diagnostic value',
)
replace_once(
    'midi.js',
    """          var pushSetupOutputs = padWebCollectPushMidiOutputs(access);\n          _pushSetupOutputs = pushSetupOutputs.slice();\n          var pedalInit = padWebPushPortContract.initializePush3PedalMode(access, _pushSetupOutputs);\n          midiOutput = padWebPushPortContract.selectPushOperationalOutput(_pushSetupOutputs);\n""",
    """          var pushSetupOutputs = padWebCollectPushMidiOutputs(access);\n          _pushSetupOutputs = pushSetupOutputs.slice();\n          // Do not rewrite Push 3 Pedal/CV jack configuration on page load.\n          // Real hardware already delivers Pedal 2 as CC64 by default; the 2026-09-11\n          // audible failure was downstream in audio-core, not in MIDI transport.\n          midiOutput = padWebPushPortContract.selectPushOperationalOutput(_pushSetupOutputs);\n""",
    'automatic pedal init',
)
replace_once(
    'midi.js',
    """            operationalOutput: midiOutput ? (midiOutput.name || midiOutput.id || '') : '',\n            pedalMode: pedalInit,\n""",
    """            operationalOutput: midiOutput ? (midiOutput.name || midiOutput.id || '') : '',\n            pedalPolicy: 'hardware-default-preserved-no-pedal-cv-sysex',\n""",
    'pedal diagnostic patch',
)

# Permanent negative contract: the public Web consumer must never silently rewrite
# a user's Push 3 Pedal/CV jack configuration.
p = Path('tests/unit/push-midi-port-contract.test.js')
s = p.read_text()
s = s.replace('  initializePush3PedalMode,\n', '')
pattern = re.compile(
    r"\n  it\('sends inquiry to setup outputs and Push 3 pedal mode only to Live', \(\) => \{.*?\n  \}\);\n\n"
    r"  it\('still sends universal inquiry when Push 3 generation is not confirmed', \(\) => \{.*?\n  \}\);",
    re.S,
)
replacement = """
  it('does not expose or send a Push 3 Pedal/CV configuration write', () => {
    expect('initializePush3PedalMode' in require('../../push-midi-port-contract.js')).toBe(false);
    const source = require('fs').readFileSync(new URL('../../push-midi-port-contract.js', import.meta.url), 'utf8');
    expect(source).not.toContain('0x37, 0x26, 0x50');
    expect(source).toContain('hardware configuration write');
  });"""
s2, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit('pedal tests anchor missing')
p.write_text(s2)

replace_once(
    'tests/unit/push-web-cc-integration.test.js',
    "  it('owns the complete Push MIDI port cluster and initializes Push 3 pedal mode', () => {\n    expect(midi).toContain('padWebPushPortContract.collectInputCluster(access, selectedId)');\n    expect(midi).toContain('pushInputs.length > 0');\n    expect(midi).toContain('padWebPushPortContract.initializePush3PedalMode(access, _pushSetupOutputs)');\n    expect(midi).toContain('padWebPushPortContract.topologySignature(access)');\n  });",
    "  it('owns the complete Push MIDI port cluster without rewriting Pedal/CV hardware', () => {\n    expect(midi).toContain('padWebPushPortContract.collectInputCluster(access, selectedId)');\n    expect(midi).toContain('pushInputs.length > 0');\n    expect(midi).not.toContain('initializePush3PedalMode');\n    expect(midi).toContain(\"pedalPolicy: 'hardware-default-preserved-no-pedal-cv-sysex'\");\n    expect(portContract).not.toContain('0x37, 0x26, 0x50');\n    expect(midi).toContain('padWebPushPortContract.topologySignature(access)');\n  });",
    'integration pedal contract',
)

# Cache/version identity must move with both changed runtime files.
replace_once(
    'index.html',
    '<script src="push-midi-port-contract.js?v=1.8.0-liveport2"></script>',
    '<script src="push-midi-port-contract.js?v=1.8.0-liveport3"></script>',
    'index port contract version',
)
replace_once(
    'index.html',
    '<script src="midi.js?v=6.7.59"></script>',
    '<script src="midi.js?v=6.7.60"></script>',
    'index midi version',
)
replace_once(
    'sw.js',
    "var CACHE_NAME = '64pad-v180-preview-20260911-buttonled-1';",
    "var CACHE_NAME = '64pad-v180-preview-20260911-pedal-default-1';",
    'sw cache name',
)
replace_once(
    'sw.js',
    "'push-midi-port-contract.js?v=1.8.0-liveport2'",
    "'push-midi-port-contract.js?v=1.8.0-liveport3'",
    'sw port contract version',
)
replace_once(
    'sw.js',
    "'midi.js?v=6.7.59'",
    "'midi.js?v=6.7.60'",
    'sw midi version',
)

# Integration test asset expectations follow the product cache identity.
replace_once(
    'tests/unit/push-web-cc-integration.test.js',
    "push-midi-port-contract.js?v=1.8.0-liveport2",
    "push-midi-port-contract.js?v=1.8.0-liveport3",
    'test port asset version 1',
)
# There are three more occurrences after the first replacement.
p = Path('tests/unit/push-web-cc-integration.test.js')
s = p.read_text().replace('push-midi-port-contract.js?v=1.8.0-liveport2', 'push-midi-port-contract.js?v=1.8.0-liveport3')
s = s.replace('midi.js?v=6.7.59', 'midi.js?v=6.7.60')
p.write_text(s)

# Output-routing source contract should explicitly lock out setup-port pedal writes.
p = Path('tests/unit/push-midi-output-routing.test.js')
s = p.read_text()
anchor = """  it('routes Push button feedback and blink protocol through the same Live-only transport', () => {\n"""
addition = """  it('never uses setup outputs to rewrite Push Pedal/CV hardware', () => {\n    expect(source).not.toContain('initializePush3PedalMode');\n    expect(source).toContain(\"pedalPolicy: 'hardware-default-preserved-no-pedal-cv-sysex'\");\n    expect(portContract).not.toContain('0x37, 0x26, 0x50');\n  });\n\n"""
if anchor not in s:
    raise SystemExit('output routing insertion anchor missing')
p.write_text(s.replace(anchor, addition + anchor, 1))
