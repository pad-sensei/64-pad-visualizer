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

  it('sends inquiry to setup outputs and Push 3 pedal mode only to Live', () => {
    const sent = { live: [], user: [], ext: [] };
    const live = { ...port('live', 'Live Port'), send: bytes => sent.live.push(bytes) };
    const user = { ...port('user', 'User Port'), send: bytes => sent.user.push(bytes) };
    const ext = { ...port('ext', 'External Port'), send: bytes => sent.ext.push(bytes) };
    const result = initializePush3PedalMode({ sysexEnabled: true }, [live, user, ext]);
    expect(result.initialized).toBe(true);
    expect(result.evidence).toBe('generic-live-user-external-topology');
    expect(result.output).toBe('Live Port');
    for (const key of ['live', 'user', 'ext']) {
      expect(sent[key].some(bytes => bytes[0] === 0xf0 && bytes[1] === 0x7e && bytes[4] === 0x01 && bytes.at(-1) === 0xf7)).toBe(true);
    }
    expect(sent.live.some(bytes => bytes[1] === 0x00 && bytes[7] === 0x26 && bytes[8] === 0x50)).toBe(true);
    expect(sent.user.some(bytes => bytes[1] === 0x00 && bytes[8] === 0x50)).toBe(false);
    expect(sent.ext.some(bytes => bytes[1] === 0x00 && bytes[8] === 0x50)).toBe(false);
  });

  it('still sends universal inquiry when Push 3 generation is not confirmed', () => {
    const sent = [];
    const live = { ...port('live', 'Live Port'), send: bytes => sent.push(bytes) };
    const user = { ...port('user', 'User Port'), send: bytes => sent.push(bytes) };
    const result = initializePush3PedalMode({ sysexEnabled: true }, [live, user]);
    expect(result.initialized).toBe(false);
    expect(result.inquirySent).toBe(true);
    expect(result.reason).toBe('push3-model-not-confirmed');
    expect(sent.some(bytes => bytes[1] === 0x7e)).toBe(true);
    expect(sent.some(bytes => bytes[1] === 0x00 && bytes[8] === 0x50)).toBe(false);
    expect(initializePush3PedalMode({ sysexEnabled: false }, [live]).reason).toBe('sysex-unavailable');
  });
});
