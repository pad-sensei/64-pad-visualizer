import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isPushPortName,
  isPushOperationalPortName,
  isPush3PortName,
  collectInputCluster,
  collectPushOutputs,
  selectPushOperationalOutput,
  detectPushGeneration,
  topologySignature,
  requestMidiAccess,
} = require('../../push-midi-port-contract.js');

function port(id, name, state = 'connected') { return { id, name, state }; }
function access(inputs, outputs = [], sysexEnabled = false) {
  return {
    inputs: new Map(inputs.map(p => [p.id, p])),
    outputs: new Map(outputs.map(p => [p.id, p])),
    sysexEnabled,
  };
}

describe('Push Web MIDI Live-Port ownership', () => {
  it('collapses Push Live/User/External to the operational Live input', () => {
    const a = access([
      port('p-live', 'Ableton Push 3 Live Port'),
      port('p-user', 'Ableton Push 3 User Port'),
      port('p-ext', 'Ableton Push 3 External Port'),
      port('keys', 'Roland A-88 MK2'),
    ]);
    expect(collectInputCluster(a, 'p-user').map(p => p.id)).toEqual(['p-live']);
    expect(collectInputCluster(a, 'p-ext').map(p => p.id)).toEqual(['p-live']);
    expect(collectInputCluster(a, 'keys').map(p => p.id)).toEqual(['keys']);
    expect(collectInputCluster(a, 'all').map(p => p.id)).toEqual(['p-live', 'keys']);
  });

  it('supports generic CoreMIDI names while keeping only Live operational', () => {
    expect(isPushPortName('Live Port')).toBe(true);
    expect(isPushPortName('User Port')).toBe(true);
    expect(isPushPortName('External Port')).toBe(true);
    expect(isPushOperationalPortName('Live Port')).toBe(true);
    expect(isPushOperationalPortName('User Port')).toBe(false);
    expect(isPush3PortName('Ableton Push 3 Live Port')).toBe(true);
    expect(isPush3PortName('Ableton Push 2 Live Port')).toBe(false);
  });

  it('keeps setup fan-out but selects only Live for ordinary output', () => {
    const outputs = [
      port('live', 'Live Port'),
      port('user', 'User Port'),
      port('ext', 'External Port'),
    ];
    const a = access([], outputs, true);
    expect(collectPushOutputs(a).map(p => p.id)).toEqual(['live', 'user', 'ext']);
    expect(selectPushOperationalOutput(outputs).id).toBe('live');
    expect(detectPushGeneration(outputs)).toEqual({ generation: 3, evidence: 'generic-live-user-external-topology' });
  });

  it('does not treat implicit port-open connection churn as topology drift', () => {
    const input = port('p-live', 'Ableton Push 3 Live Port');
    input.connection = 'closed';
    const a = access([input]);
    const before = topologySignature(a);
    input.connection = 'open';
    expect(topologySignature(a)).toBe(before);
    input.state = 'disconnected';
    expect(topologySignature(a)).not.toBe(before);
  });

  it('requests SysEx first and falls back to ordinary Web MIDI without losing notes', async () => {
    const normal = access([]);
    const nav = {
      requestMIDIAccess: vi.fn(opts => opts?.sysex ? Promise.reject(new Error('denied')) : Promise.resolve(normal)),
    };
    await expect(requestMidiAccess(nav)).resolves.toBe(normal);
    expect(nav.requestMIDIAccess).toHaveBeenNthCalledWith(1, { sysex: true });
    expect(nav.requestMIDIAccess).toHaveBeenCalledTimes(2);
  });

  it('does not expose or send a Push 3 Pedal/CV configuration write', () => {
    expect('initializePush3PedalMode' in require('../../push-midi-port-contract.js')).toBe(false);
    const source = require('fs').readFileSync(new URL('../../push-midi-port-contract.js', import.meta.url), 'utf8');
    expect(source).not.toContain('0x37, 0x26, 0x50');
  });
});
