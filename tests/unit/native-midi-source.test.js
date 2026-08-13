import { describe, it, expect, vi } from 'vitest';

describe('native MIDI source-aware adapter', () => {
  it('preserves exact Push identity across callback lifecycle and duplicate mapped pitches', () => {
    vi.useFakeTimers();
    globalThis.noteOn = vi.fn();
    globalThis.noteOff = vi.fn();
    globalThis.handlePerformMidi = () => false;
    globalThis.linkMode = true;
    const first = {
      deviceId: 'native-push:Push 3 User Port', sourceId: 'native-push:Push 3 User Port:0:r0c0',
      rawPad: 36, row: 0, col: 0, positionConfidence: 'exact',
    };
    const second = {
      deviceId: 'native-push:Push 3 User Port', sourceId: 'native-push:Push 3 User Port:0:r1c0',
      rawPad: 44, row: 1, col: 0, positionConfidence: 'exact',
    };

    onNativeMidiIn(60, 100, first);
    onNativeMidiIn(60, 100, second);
    expect(getMidiHeldSources()).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: first.sourceId, rawNote: 36, mappedMidi: 60, row: 0, col: 0, physicalPadId: 'r0c0', positionConfidence: 'exact' }),
      expect.objectContaining({ sourceId: second.sourceId, rawNote: 44, mappedMidi: 60, row: 1, col: 0, physicalPadId: 'r1c0', positionConfidence: 'exact' }),
    ]));
    expect(getMidiHeldSources()).toHaveLength(2);

    onNativeMidiOff(60, first);
    expect(getMidiHeldSources()).toHaveLength(1);
    onNativeMidiOff(60, second);
    expect(getMidiHeldSources()).toEqual([]);
    vi.useRealTimers();
  });

  it('keeps generic native input explicitly positionless', () => {
    expect(nativeMidiSourceMetadata(60, { deviceId: 'native-keyboard' })).toEqual(expect.objectContaining({
      deviceId: 'native-keyboard', sourceId: 'native-keyboard:0:60', channel: 0,
      rawNote: 60, mappedMidi: 60, row: null, col: null, physicalPadId: null, positionConfidence: 'none',
    }));
  });

  it.each([-1, 16, Number.NaN])('normalizes invalid fallback channel %p to zero across the callback lifecycle', (channel) => {
    vi.useFakeTimers();
    globalThis.noteOn = vi.fn();
    globalThis.noteOff = vi.fn();
    globalThis.handlePerformMidi = () => false;
    globalThis.linkMode = true;
    const metadata = { deviceId: 'native-keyboard', channel };

    onNativeMidiIn(60, 100, metadata);
    expect(getMidiHeldSources()).toEqual([
      expect.objectContaining({ sourceId: 'native-keyboard:0:60', channel: 0 }),
    ]);
    onNativeMidiOff(60, metadata);
    expect(getMidiHeldSources()).toEqual([]);
    vi.useRealTimers();
  });

  it('treats invalid or inconsistent exact-position metadata as positionless', () => {
    [
      { rawPad: 35, row: 0, col: 0 },
      { rawPad: 100, row: 7, col: 7 },
      { rawPad: 36, row: 1, col: 0 },
      { rawPad: 36, row: -1, col: 0 },
      { rawPad: 36, row: 0, col: 8 },
    ].forEach((invalid) => {
      expect(nativeMidiSourceMetadata(60, { ...invalid, positionConfidence: 'exact' })).toEqual(expect.objectContaining({
        sourceId: 'native:0:60', rawNote: 60, row: null, col: null,
        physicalPadId: null, positionConfidence: 'none',
      }));
    });
  });

  it('uses the default native fallback source consistently when callback metadata is omitted', () => {
    vi.useFakeTimers();
    globalThis.noteOn = vi.fn();
    globalThis.noteOff = vi.fn();
    globalThis.handlePerformMidi = () => false;
    globalThis.linkMode = true;

    onNativeMidiIn(60, 100);
    expect(getMidiHeldSources()).toEqual([
      expect.objectContaining({ sourceId: 'native:0:60', channel: 0 }),
    ]);
    onNativeMidiOff(60);
    expect(getMidiHeldSources()).toEqual([]);
    vi.useRealTimers();
  });

  it('preserves an explicit native source ID', () => {
    expect(nativeMidiSourceMetadata(60, {
      deviceId: 'native-keyboard', channel: 4, sourceId: 'desktop-callback:opaque-id',
    })).toEqual(expect.objectContaining({
      sourceId: 'desktop-callback:opaque-id', channel: 4, rawNote: 60, mappedMidi: 60,
    }));
  });

  it('keeps same-device same-note fallback ownership separate by channel through matching note-off metadata', () => {
    vi.useFakeTimers();
    globalThis.noteOn = vi.fn();
    globalThis.noteOff = vi.fn();
    globalThis.handlePerformMidi = () => false;
    globalThis.linkMode = true;
    const channelOne = { deviceId: 'native-keyboard', channel: 1 };
    const channelTwo = { deviceId: 'native-keyboard', channel: 2 };

    onNativeMidiIn(60, 100, channelOne);
    onNativeMidiIn(60, 100, channelTwo);
    expect(getMidiHeldSources()).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'native-keyboard:1:60', channel: 1 }),
      expect.objectContaining({ sourceId: 'native-keyboard:2:60', channel: 2 }),
    ]));
    expect(getMidiHeldSources()).toHaveLength(2);

    onNativeMidiOff(60, channelOne);
    expect(getMidiHeldSources()).toEqual([
      expect.objectContaining({ sourceId: 'native-keyboard:2:60', channel: 2 }),
    ]);
    onNativeMidiOff(60, channelTwo);
    expect(getMidiHeldSources()).toEqual([]);
    vi.useRealTimers();
  });
});
