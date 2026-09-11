import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('Push Web MIDI output routing parity', () => {
  const source = fs.readFileSync(new URL('../../midi.js', import.meta.url), 'utf8');
  const portContract = fs.readFileSync(new URL('../../push-midi-port-contract.js', import.meta.url), 'utf8');

  it('recognizes prefix-less CoreMIDI Push ports used by Keys standalone', () => {
    expect(portContract).toContain("lower === 'live port'");
    expect(portContract).toContain("lower === 'user port'");
    expect(portContract).toContain("lower === 'external port'");
    expect(source).toContain('padWebIsPushMidiPortName(input.name)');
    expect(source).toContain('window.padWebPushPortContract.isPushPortName(name)');
  });

  it('fans Push LEDs to all matching outputs and selects Live as primary', () => {
    expect(source).toContain('_pushLedOutputs = pushOutputs.slice();');
    expect(source).toContain('pushLivePort || pushUserPort || pushOutputs[0] || null');
    expect(source).toContain('padWebSendPushLedMessage([0x90, note, color])');
    expect(source).toContain('_pushLedOutputs.forEach(add);');
  });

  it('clears stale firmware-owned state at output acquisition', () => {
    expect(source).toContain('padWebHardClearPushOutputs(_pushLedOutputs);');
    expect(source).toContain('output.send([0x80 | channel, serialNote, 0])');
    expect(source).toContain('output.send([0xb0, cc, 0])');
  });
});
