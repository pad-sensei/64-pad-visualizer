import { describe, it, expect } from 'vitest';
import { fastClearPushPads, hardClearPushMidiOutputs } from '../../push-surface-cleanup.js';

describe('Push Web surface shutdown', () => {
  it('prioritizes the 64 visible pad zeros before the exhaustive sweep', () => {
    const sent = [];
    let cleared = 0;
    const output = {
      clear() { cleared += 1; },
      send(message) { sent.push(message.slice()); },
    };
    const result = fastClearPushPads([output, output]);
    expect(result).toEqual({ outputs: 1, padZeros: 64 });
    expect(cleared).toBe(1);
    expect(sent).toHaveLength(64);
    expect(sent[0]).toEqual([0x90, 36, 0]);
    expect(sent.at(-1)).toEqual([0x90, 99, 0]);
    expect(sent.every(message => message[0] === 0x90 && message[2] === 0)).toBe(true);
  });

  it('mirrors Desktop hard clear: every pad NoteOff on all channels + every CC zero', () => {
    const sent = [];
    const output = { send(message) { sent.push(message.slice()); } };
    const result = hardClearPushMidiOutputs([output, output]);
    expect(result).toEqual({ outputs: 1, noteOffs: 1024, ccResets: 128 });
    expect(sent).toHaveLength(1152);
    expect(sent[0]).toEqual([0x80, 36, 0]);
    expect(sent[1023]).toEqual([0x8f, 99, 0]);
    expect(sent[1024]).toEqual([0xb0, 0, 0]);
    expect(sent.at(-1)).toEqual([0xb0, 127, 0]);
    expect(sent).toContainEqual([0xb0, 64, 0]);
    expect(sent).toContainEqual([0xb0, 123, 0]);
  });
});
