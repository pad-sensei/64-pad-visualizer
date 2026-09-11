import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isPushPortName,
  isPush3PortName,
  collectInputCluster,
  topologySignature,
  requestMidiAccess,
  initializePush3PedalMode,
} = require('../../push-midi-port-contract.js');

function port(id, name, state = 'connected') { return { id, name, state }; }
function access(inputs, outputs = [], sysexEnabled = false) {
  return {
    inputs: new Map(inputs.map(p => [p.id, p])),
    outputs: new Map(outputs.map(p => [p.id, p])),
    sysexEnabled,
  };
}

describe('Push Web MIDI multi-port ownership', () => {
  it('treats one selected Push port as the full Live/User/External input cluster', () => {
    const a = access([
      port('p-live', 'Ableton Push 3 Live Port'),
      port('p-user', 'Ableton Push 3 User Port'),
      port('p-ext', 'Ableton Push 3 External Port'),
      port('keys', 'Roland A-88 MK2'),
    ]);
    expect(collectInputCluster(a, 'p-live').map(p => p.id)).toEqual(['p-live', 'p-user', 'p-ext']);
    expect(collectInputCluster(a, 'keys').map(p => p.id)).toEqual(['keys']);
    expect(collectInputCluster(a, 'all').map(p => p.id)).toEqual(['p-live', 'p-user', 'p-ext', 'keys']);
  });

  it('supports CoreMIDI prefix-less Push port names', () => {
    expect(isPushPortName('Live Port')).toBe(true);
    expect(isPushPortName('User Port')).toBe(true);
    expect(isPushPortName('External Port')).toBe(true);
    expect(isPush3PortName('Ableton Push 3 Live Port')).toBe(true);
    expect(isPush3PortName('Ableton Push 2 Live Port')).toBe(false);
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

  it('sends the proven Push 3 dual-footswitch SysEx only to a confirmed Push 3', () => {
    const sent3 = [];
    const sent2 = [];
    const p3 = { ...port('p3-live', 'Ableton Push 3 Live Port'), send: bytes => sent3.push(bytes) };
    const p2 = { ...port('p2-live', 'Ableton Push 2 Live Port'), send: bytes => sent2.push(bytes) };
    const result = initializePush3PedalMode({ sysexEnabled: true }, [p3, p2]);
    expect(result.initialized).toBe(true);
    expect(sent3.some(bytes => bytes[0] === 0xf0 && bytes[1] === 0x00 && bytes[7] === 0x26 && bytes[8] === 0x50 && bytes.at(-1) === 0xf7)).toBe(true);
    expect(sent2.some(bytes => bytes[1] === 0x00 && bytes[8] === 0x50)).toBe(false);
    expect(initializePush3PedalMode({ sysexEnabled: false }, [p3]).reason).toBe('sysex-unavailable');
  });
});
