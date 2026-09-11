// Push surface shutdown contract shared by the Web preview.
// Desktop shutdown is two-stage: clear the visible pad state first, then perform
// the exhaustive all-channel/all-CC hardware sweep. Browser teardown has a much
// shorter execution window, so preserve that ordering and make the 64-pad clear
// the first, smallest, highest-priority operation.
function uniqueOutputs(outputs) {
  return [...new Set((outputs || []).filter(Boolean))];
}

export function fastClearPushPads(outputs) {
  const unique = uniqueOutputs(outputs);
  for (const output of unique) {
    // Drop any scheduled colour writes before queueing the shutdown zeros.
    try { output.clear?.(); } catch (_) {}
    for (let note = 36; note <= 99; note++) {
      // Push pad LEDs are painted by Note On velocity values. Velocity 0 is the
      // direct inverse of the Web paint path and mirrors Desktop clearPushLEDs().
      output.send([0x90, note, 0]);
    }
  }
  return {
    outputs: unique.length,
    padZeros: unique.length * 64,
  };
}

// Mirrors Desktop hardClearPushLEDs(): every pad gets Note Off on all channels
// and every CC is reset to zero on channel 1. This is the second-stage sweep.
export function hardClearPushMidiOutputs(outputs) {
  const unique = uniqueOutputs(outputs);
  for (const output of unique) {
    for (let channel = 0; channel < 16; channel++) {
      for (let note = 36; note <= 99; note++) {
        output.send([0x80 | channel, note, 0]);
      }
    }
    for (let cc = 0; cc <= 127; cc++) {
      output.send([0xb0, cc, 0]);
    }
  }
  return {
    outputs: unique.length,
    noteOffs: unique.length * 16 * 64,
    ccResets: unique.length * 128,
  };
}
