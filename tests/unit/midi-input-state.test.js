import { describe, it, expect } from 'vitest';

describe('browser MIDI held-source ownership', () => {
  it('keeps a mapped pitch active until every physical source releases it', () => {
    const state = createMidiHeldState();
    const a = { deviceId: 'push', channel: 0, rawNote: 36, mappedMidi: 60, physicalPadId: 'r0c0', positionConfidence: 'exact' };
    const b = { deviceId: 'push', channel: 0, rawNote: 44, mappedMidi: 60, physicalPadId: 'r1c0', positionConfidence: 'exact' };

    expect(state.noteOn(a).pitchBecameActive).toBe(true);
    expect(state.noteOn(b).pitchBecameActive).toBe(false);
    expect(state.ownerCount(60)).toBe(2);
    expect(state.heldPitches()).toEqual([60]);

    expect(state.noteOff(a).pitchBecameInactive).toBe(false);
    expect(state.ownerCount(60)).toBe(1);
    expect(state.heldPitches()).toEqual([60]);

    expect(state.noteOff(b).pitchBecameInactive).toBe(true);
    expect(state.ownerCount(60)).toBe(0);
    expect(state.heldPitches()).toEqual([]);
  });

  it('preserves source identity and exact pad metadata one-for-one', () => {
    const state = createMidiHeldState();
    state.noteOn({
      deviceId: 'push-3', sourceId: 'push-3:r2c5', channel: 0,
      rawNote: 57, mappedMidi: 51, row: 2, col: 5,
      physicalPadId: 'r2c5', positionConfidence: 'exact',
    });
    expect(state.heldSources()).toEqual([expect.objectContaining({
      deviceId: 'push-3', sourceId: 'push-3:r2c5', rawNote: 57,
      mappedMidi: 51, row: 2, col: 5, physicalPadId: 'r2c5',
      positionConfidence: 'exact',
    })]);
  });

  it('disconnect clears only sources owned by that input', () => {
    const state = createMidiHeldState();
    state.noteOn({ deviceId: 'a', rawNote: 60, mappedMidi: 60 });
    state.noteOn({ deviceId: 'a', rawNote: 64, mappedMidi: 64 });
    state.noteOn({ deviceId: 'b', rawNote: 67, mappedMidi: 67 });

    expect(state.clearDevice('a')).toEqual([60, 64]);
    expect(state.heldPitches()).toEqual([67]);
    expect(state.heldSources().map(s => s.deviceId)).toEqual(['b']);
  });

  it('disconnect does not release a pitch still owned by another input', () => {
    const state = createMidiHeldState();
    state.noteOn({ deviceId: 'a', rawNote: 36, mappedMidi: 60 });
    state.noteOn({ deviceId: 'b', rawNote: 60, mappedMidi: 60 });

    expect(state.clearDevice('a')).toEqual([]);
    expect(state.heldPitches()).toEqual([60]);
    expect(state.ownerCount(60)).toBe(1);
  });

  it('dense event ordering ends in the exact expected held set', () => {
    const state = createMidiHeldState();
    const sources = Array.from({ length: 32 }, (_, i) => ({
      deviceId: i % 2 ? 'b' : 'a', channel: i % 4, rawNote: 36 + i,
      mappedMidi: 48 + (i % 12), physicalPadId: 'p' + i,
    }));
    sources.forEach(s => state.noteOn(s));
    sources.filter((_, i) => i % 3 !== 0).forEach(s => state.noteOff(s));

    const expected = [...new Set(sources.filter((_, i) => i % 3 === 0).map(s => s.mappedMidi))].sort((a, b) => a - b);
    expect(state.heldPitches()).toEqual(expected);
  });

  it('retrigger from the same source can remap without leaving stale pitch ownership', () => {
    const state = createMidiHeldState();
    const source = { deviceId: 'push', channel: 0, rawNote: 36, mappedMidi: 60, physicalPadId: 'r0c0' };
    state.noteOn(source);
    state.noteOn({ ...source, mappedMidi: 72 });
    expect(state.heldPitches()).toEqual([72]);
    expect(state.ownerCount(60)).toBe(0);
  });
});

describe('browser MIDI listener binding registry', () => {
  it('prevents duplicate attachment for the same port and handler', () => {
    const registry = createMidiPortBindingRegistry();
    const port = { id: 'input-1', onmidimessage: null };
    const handler = () => {};
    registry.beginGeneration();
    expect(registry.bind(port, handler)).toBe(true);
    const firstWrapper = port.onmidimessage;
    expect(registry.bind(port, handler)).toBe(false);
    expect(port.onmidimessage).toBe(firstWrapper);
    expect(registry.size()).toBe(1);
  });

  it('replacing a port invalidates the stale callback', () => {
    const registry = createMidiPortBindingRegistry();
    const calls = [];
    const oldPort = { id: 'same-id', onmidimessage: null };
    const newPort = { id: 'same-id', onmidimessage: null };
    const handler = (_, port) => calls.push(port === newPort ? 'new' : 'old');

    registry.beginGeneration();
    registry.bind(oldPort, handler);
    const stale = oldPort.onmidimessage;
    registry.bind(newPort, handler);
    stale({ data: [0x90, 60, 100] });
    newPort.onmidimessage({ data: [0x90, 60, 100] });

    expect(calls).toEqual(['new']);
    expect(oldPort.onmidimessage).toBeNull();
  });

  it('clear detaches every owned handler and advances generation', () => {
    const registry = createMidiPortBindingRegistry();
    const a = { id: 'a', onmidimessage: null };
    const b = { id: 'b', onmidimessage: null };
    registry.beginGeneration();
    registry.bind(a, () => {});
    registry.bind(b, () => {});
    const generation = registry.generation();

    registry.clear();
    expect(a.onmidimessage).toBeNull();
    expect(b.onmidimessage).toBeNull();
    expect(registry.size()).toBe(0);
    expect(registry.generation()).toBe(generation + 1);
  });
});
