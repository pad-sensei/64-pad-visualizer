import { describe, it, expect } from 'vitest';
import { hardClearPushMidiOutputs } from '../../push-surface-cleanup.js';

describe('Push Web surface shutdown', () => {
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
