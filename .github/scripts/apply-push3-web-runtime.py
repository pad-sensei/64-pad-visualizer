from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} anchor missing')
    return text.replace(old, new, 1)

p = Path('midi.js')
s = p.read_text()
s = replace_once(
    s,
    "navigator.requestMIDIAccess().then(access => {",
    "padWebPushPortContract.requestMidiAccess(navigator).then(access => {",
    'Web MIDI request',
)
s = replace_once(
    s,
    "      for (const input of access.inputs.values()) {\n        const opt = document.createElement('option');",
    "      for (const input of access.inputs.values()) {\n        if (input.state === 'disconnected') continue;\n        const opt = document.createElement('option');",
    'device list',
)
old = """      const selectedId = select.value;
      let connected = false;
      let connectedName = '';

      for (const input of access.inputs.values()) {
        if (selectedId !== 'all' && input.id !== selectedId) continue;
        connected = true;
        connectedName = input.name;
        // Per-input Push detection: シリアル→4度変換をデバイス単位で適用
        const isPush = padWebIsPushMidiPortName(input.name);
"""
new = """      const selectedId = select.value;
      const inputCluster = padWebPushPortContract.collectInputCluster(access, selectedId);
      const inputIds = new Set(inputCluster.map(function(input) { return input.id; }));
      const pushInputs = inputCluster.filter(function(input) { return padWebIsPushMidiPortName(input.name); });
      let connected = inputCluster.length > 0;
      let connectedName = pushInputs.length > 0 ? (pushInputs[0].name || '')
        : (inputCluster.length > 0 ? (inputCluster[0].name || '') : '');
      try {
        window.__64PE_PUSH_MIDI_DIAG__ = {
          selectedId: selectedId,
          boundInputs: inputCluster.map(function(input) { return input.name || input.id || ''; }),
          pushInputs: pushInputs.map(function(input) { return input.name || input.id || ''; }),
          sysexEnabled: access.sysexEnabled === true,
        };
      } catch (_) {}

      for (const input of access.inputs.values()) {
        if (!inputIds.has(input.id)) continue;
        // Per-input Push detection: シリアル→4度変換をデバイス単位で適用
        const isPush = padWebIsPushMidiPortName(input.name);
"""
s = replace_once(s, old, new, 'selected input loop')
s = replace_once(
    s,
    "        var isPush = padWebIsPushMidiPortName(connectedName);",
    "        var isPush = pushInputs.length > 0;",
    'Push LED detection',
)
old = """          _pushLedOutputs = pushOutputs.slice();
          var pushLivePort = pushOutputs.find(function(output) { return /live/i.test(output.name || ''); }) || null;
"""
new = """          _pushLedOutputs = pushOutputs.slice();
          var pedalInit = padWebPushPortContract.initializePush3PedalMode(access, _pushLedOutputs);
          try { window.__64PE_PUSH_MIDI_DIAG__.pedalMode = pedalInit; } catch (_) {}
          var pushLivePort = pushOutputs.find(function(output) { return /live/i.test(output.name || ''); }) || null;
"""
s = replace_once(s, old, new, 'Push output acquisition')
old = """    refreshDeviceList();
    connectInputs();
    access.onstatechange = () => {
      refreshDeviceList();
      connectInputs();
    };
"""
new = """    refreshDeviceList();
    connectInputs();
    let _midiTopologySignature = padWebPushPortContract.topologySignature(access);
    access.onstatechange = () => {
      const nextSignature = padWebPushPortContract.topologySignature(access);
      if (nextSignature === _midiTopologySignature) return;
      _midiTopologySignature = nextSignature;
      refreshDeviceList();
      connectInputs();
    };
"""
s = replace_once(s, old, new, 'MIDI statechange')
old = """function padWebIsPushMidiPortName(name) {
  var n = String(name || '').trim();
  var lower = n.toLowerCase();
  // Pad Sensei Keys standalone evidence: CoreMIDI may expose Push ports
  // only as Live/User/External Port without an Ableton/Push prefix.
  return /push/i.test(n)
    || /ableton/i.test(n)
    || lower === 'live port'
    || lower === 'user port'
    || lower === 'external port';
}

function padWebCollectPushMidiOutputs(access) {
  var outputs = [];
  if (!access || !access.outputs) return outputs;
  for (const output of access.outputs.values()) {
    if (padWebIsPushMidiPortName(output.name)) outputs.push(output);
  }
  return outputs;
}
"""
new = """function padWebIsPushMidiPortName(name) {
  return !!(window.padWebPushPortContract && window.padWebPushPortContract.isPushPortName(name));
}

function padWebCollectPushMidiOutputs(access) {
  return window.padWebPushPortContract
    ? window.padWebPushPortContract.collectPushOutputs(access)
    : [];
}
"""
s = replace_once(s, old, new, 'Push port helpers')
s = s.replace('// Auto-match MIDI output for LED control (HPS exclusive)',
              '// Auto-match MIDI output for standard Push LED/control ownership')
s = s.replace('// HPS exclusive feature (?hps gate): Push LED control without Ableton',
              '// Standard Push LED control without Ableton (v1.8.0)')
p.write_text(s)

p = Path('push-display-webusb-app.js')
s = p.read_text()
old = """    // WebUSB display is opt-in and independent from automatic Web MIDI pad/CC ownership.
    // Hiding the tab may release only the display transport; it must never clear pad LEDs.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void probe.stop('Push display paused because this tab was hidden.');
    }, { capture: true });
    // Actual page teardown still clears both transports best-effort.
"""
new = """    // WebUSB display is opt-in and independent from automatic Web MIDI pad/CC ownership.
    // Do not intentionally stop merely because the tab becomes hidden: the Push display
    // needs its keepalive stream and visibility changes must not tear down a live session.
    // Actual page teardown still clears both transports best-effort.
"""
s = replace_once(s, old, new, 'display visibility lifecycle')
s = replace_once(s, "'./push-display-webusb.js?v=webusb-20260911-9'", "'./push-display-webusb.js?v=webusb-20260911-10'", 'display transport import')
p.write_text(s)

p = Path('push-display-webusb.js')
s = p.read_text()
s = replace_once(s, 'maxRecoveries = 4', 'maxRecoveries = 12', 'display recovery budget')
p.write_text(s)

p = Path('index.html')
s = p.read_text()
anchor = '<script src="push-midi-cc-map.js?v=1.8.0"></script>'
if 'push-midi-port-contract.js' not in s:
    s = replace_once(s, anchor, '<script src="push-midi-port-contract.js?v=1.8.0"></script>\n' + anchor, 'port contract load')
s = s.replace('midi.js?v=6.7.56', 'midi.js?v=6.7.57')
s = s.replace('push-display-webusb-app.js?v=webusb-20260911-9', 'push-display-webusb-app.js?v=webusb-20260911-10')
p.write_text(s)

p = Path('sw.js')
s = p.read_text()
s = s.replace('64pad-v180-preview-20260911-push23-2', '64pad-v180-preview-20260911-push3runtime-1')
anchor = "  'push-midi-cc-map.js?v=1.8.0',"
if 'push-midi-port-contract.js' not in s:
    s = replace_once(s, anchor, "  'push-midi-port-contract.js?v=1.8.0',\n" + anchor, 'port contract cache')
s = s.replace("'midi.js?v=6.7.56'", "'midi.js?v=6.7.57'")
s = s.replace("'push-display-webusb.js?v=webusb-20260911-9'", "'push-display-webusb.js?v=webusb-20260911-10'")
s = s.replace("'push-display-webusb-app.js?v=webusb-20260911-9'", "'push-display-webusb-app.js?v=webusb-20260911-10'")
p.write_text(s)

p = Path('tests/unit/push-web-cc-integration.test.js')
s = p.read_text()
s = replace_once(
    s,
    "    expect(html.indexOf('push-midi-cc-map.js?v=1.8.0')).toBeGreaterThan(0);",
    "    expect(html.indexOf('push-midi-port-contract.js?v=1.8.0')).toBeGreaterThan(0);\n    expect(html.indexOf('push-midi-cc-map.js?v=1.8.0')).toBeGreaterThan(html.indexOf('push-midi-port-contract.js?v=1.8.0'));",
    'integration script order',
)
s = replace_once(
    s,
    "    expect(sw).toContain(\"'push-midi-cc-map.js?v=1.8.0'\");",
    "    expect(sw).toContain(\"'push-midi-port-contract.js?v=1.8.0'\");\n    expect(sw).toContain(\"'push-midi-cc-map.js?v=1.8.0'\");",
    'integration cache contract',
)
insert = """

  it('owns the complete Push MIDI port cluster and initializes Push 3 pedal mode', () => {
    expect(midi).toContain('padWebPushPortContract.collectInputCluster(access, selectedId)');
    expect(midi).toContain('pushInputs.length > 0');
    expect(midi).toContain('padWebPushPortContract.initializePush3PedalMode(access, _pushLedOutputs)');
    expect(midi).toContain('padWebPushPortContract.topologySignature(access)');
  });
"""
s = replace_once(s, "\n  it('keeps native-only Device action a browser no-op'", insert + "\n  it('keeps native-only Device action a browser no-op'", 'integration runtime test')
p.write_text(s)
