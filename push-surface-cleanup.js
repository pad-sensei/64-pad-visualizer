// Push surface shutdown contract shared by the Web preview.
// Mirrors Desktop hardClearPushLEDs(): every pad gets Note Off on all
// channels and every CC is reset to zero on channel 1.
export function hardClearPushMidiOutputs(outputs) {
  const unique = [...new Set((outputs || []).filter(Boolean))];
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
