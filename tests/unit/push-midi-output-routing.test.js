import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('Push Web MIDI output routing parity', () => {
  const source = fs.readFileSync(new URL('../../midi.js', import.meta.url), 'utf8');
  const portContract = fs.readFileSync(new URL('../../push-midi-port-contract.js', import.meta.url), 'utf8');

  it('recognizes prefix-less setup ports but keeps Live as operational', () => {
    expect(portContract).toContain("lower === 'live port'");
    expect(portContract).toContain("lower === 'user port'");
    expect(portContract).toContain("lower === 'external port'");
    expect(portContract).toContain('isPushOperationalPortName');
    expect(source).toContain('padWebPushPortContract.selectPushOperationalOutput(_pushSetupOutputs)');
  });

  it('routes ordinary Push LED traffic only to the operational Live output', () => {
    expect(source).toContain('_pushSetupOutputs = pushSetupOutputs.slice();');
    expect(source).toContain('_pushLedOutputs = midiOutput ? [midiOutput] : [];');
    expect(source).toContain('padWebSendPushLedMessage([0x90, note, color])');
    expect(source).not.toContain('_pushLedOutputs = pushOutputs.slice();');
  });

  it('clears stale firmware-owned state only on operational outputs', () => {
    expect(source).toContain('padWebHardClearPushOutputs(_pushLedOutputs);');
    expect(source).toContain('output.send([0x80 | channel, serialNote, 0])');
    expect(source).toContain('output.send([0xb0, cc, 0])');
  });
});
