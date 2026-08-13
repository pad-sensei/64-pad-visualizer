// Launchpad Programmer-mode position adapter.
// The fixed maps below are deliberately per model: model/layout identity is
// required before a raw MIDI note is treated as a physical grid position.
(function(root) {
  function fixedProgrammerGrid() {
    var notes = [];
    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 8; col++) notes.push((row + 1) * 10 + col + 1);
    }
    return notes;
  }

  function model(deviceHeader, programmerLayout, capabilities, programmerModeMessage, programmerExitMessage) {
    var gridNotes = fixedProgrammerGrid();
    var positionByNote = {};
    gridNotes.forEach(function(note, index) {
      positionByNote[note] = { row: Math.floor(index / 8), col: index % 8 };
    });
    return {
      deviceHeader: deviceHeader,
      programmerLayout: programmerLayout,
      programmerModeMessage: programmerModeMessage,
      programmerExitMessage: programmerExitMessage,
      capabilities: capabilities,
      gridNotes: gridNotes,
      positionForNote: function(rawPad) { return positionByNote[rawPad] || null; },
      noteForPosition: function(row, col) {
        return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < 8 && col >= 0 && col < 8
          ? gridNotes[row * 8 + col] : null;
      },
    };
  }

  var LAUNCHPAD_MODELS = {
    'launchpad-x': model(0x0c, 0x7f, { velocity: true, pressure: true }, [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0c, 0x00, 0x7f, 0xF7], [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0c, 0x0e, 0x00, 0xF7]),
    'launchpad-mini-mk3': model(0x0d, 0x7f, { velocity: false, pressure: false }, [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0d, 0x00, 0x7f, 0xF7], [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0d, 0x0e, 0x00, 0xF7]),
    'launchpad-pro-mk3': model(0x0e, 0x11, { velocity: true, pressure: true }, [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, 0x11, 0x00, 0xF7], [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, 0x00, 0x00, 0xF7]),
  };

  // Web MIDI port names published by Novation for these interfaces. Do not use
  // broad "Launchpad" matching: Custom layouts and other generations are raw.
  var OFFICIAL_PORT_MODELS = {
    'lpx midi': 'launchpad-x',
    'launchpad x midi': 'launchpad-x',
    'lpminimk3 midi': 'launchpad-mini-mk3',
    'launchpad mini mk3 midi': 'launchpad-mini-mk3',
    'lppromk3 midi': 'launchpad-pro-mk3',
    'launchpad pro mk3 midi': 'launchpad-pro-mk3',
  };

  function officialLaunchpadModelForPort(port) {
    if (!port || typeof port.name !== 'string') return null;
    return OFFICIAL_PORT_MODELS[port.name.trim().toLowerCase()] || null;
  }

  // `inquiryFamily` is intentionally not consulted. It identifies an inquiry
  // family, not a particular physical model. Callers must supply an independently
  // established model identity and the matching device header/layout readback.
  function resolveLaunchpadProgrammerIdentity(identity) {
    if (!identity || typeof identity !== 'object') return null;
    var config = LAUNCHPAD_MODELS[identity.model];
    if (!config || identity.deviceHeader !== config.deviceHeader || identity.layout !== config.programmerLayout) return null;
    return {
      model: identity.model,
      deviceHeader: config.deviceHeader,
      layout: config.programmerLayout,
      capabilities: config.capabilities,
      config: config,
    };
  }

  function launchpadSourceMetadata(input, status, rawPad, mappedMidi, identity) {
    var deviceId = input && input.id != null ? String(input.id)
      : (input && input.name ? String(input.name) : 'web-midi');
    var channel = Number.isInteger(status) ? status & 0x0f : 0;
    var recognized = resolveLaunchpadProgrammerIdentity(identity);
    var position = recognized && recognized.config.positionForNote(rawPad);
    var row = position ? position.row : null;
    var col = position ? position.col : null;
    var physicalPadId = position ? 'r' + row + 'c' + col : null;
    return {
      deviceId: deviceId,
      sourceId: deviceId + ':' + channel + ':' + (physicalPadId || String(rawPad)),
      channel: channel,
      rawPad: rawPad,
      rawNote: rawPad,
      mappedMidi: mappedMidi,
      row: row,
      col: col,
      physicalPadId: physicalPadId,
      positionConfidence: position ? 'exact' : 'none',
    };
  }

  function isVerifiedLaunchpadProgrammerGridNote(input, rawPad) {
    var recognized = resolveLaunchpadProgrammerIdentity(input && input.launchpadProgrammerIdentity);
    return !!(recognized && recognized.config.positionForNote(rawPad));
  }

  var api = { LAUNCHPAD_MODELS: LAUNCHPAD_MODELS, officialLaunchpadModelForPort: officialLaunchpadModelForPort, resolveLaunchpadProgrammerIdentity: resolveLaunchpadProgrammerIdentity, launchpadSourceMetadata: launchpadSourceMetadata, isVerifiedLaunchpadProgrammerGridNote: isVerifiedLaunchpadProgrammerGridNote };
  Object.assign(root, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
