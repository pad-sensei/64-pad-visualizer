import { describe, expect, it } from 'vitest';
import {
  LAUNCHPAD_MODELS,
  launchpadSourceMetadata,
  resolveLaunchpadProgrammerIdentity,
} from '../../launchpad-adapter.js';

const input = { id: 'lp-input', name: 'Launchpad MIDI' };
const identity = (model) => ({ model, deviceHeader: LAUNCHPAD_MODELS[model].deviceHeader, layout: LAUNCHPAD_MODELS[model].programmerLayout });

describe('Launchpad Programmer adapter', () => {
  it.each([
    ['launchpad-x', 0x0c, 0x7f, true],
    ['launchpad-mini-mk3', 0x0d, 0x7f, false],
    ['launchpad-pro-mk3', 0x0e, 0x11, true],
  ])('recognizes %s only with matching model, header, and Programmer layout', (model, deviceHeader, layout, pressure) => {
    expect(resolveLaunchpadProgrammerIdentity({ model, deviceHeader, layout })).toEqual(expect.objectContaining({ model, deviceHeader, layout, capabilities: { velocity: pressure, pressure } }));
  });

  it.each(['launchpad-x', 'launchpad-mini-mk3', 'launchpad-pro-mk3'])('maps every fixed %s grid note and its inverse', (model) => {
    const config = LAUNCHPAD_MODELS[model];
    expect(config.gridNotes).toHaveLength(64);
    config.gridNotes.forEach((rawPad, index) => {
      const source = launchpadSourceMetadata(input, 0x92, rawPad, 60, identity(model));
      expect(source).toEqual(expect.objectContaining({
        deviceId: 'lp-input', sourceId: `lp-input:2:r${Math.floor(index / 8)}c${index % 8}`,
        rawPad, rawNote: rawPad, mappedMidi: 60,
        row: Math.floor(index / 8), col: index % 8,
        physicalPadId: `r${Math.floor(index / 8)}c${index % 8}`,
        channel: 2, positionConfidence: 'exact',
      }));
      expect(config.noteForPosition(source.row, source.col)).toBe(rawPad);
    });
  });

  it.each(['launchpad-x', 'launchpad-mini-mk3', 'launchpad-pro-mk3'])('leaves %s top/right controls positionless', (model) => {
    [91, 19, 99].forEach((rawPad) => {
      expect(launchpadSourceMetadata(input, 0x90, rawPad, rawPad, identity(model))).toEqual(expect.objectContaining({
        rawPad, row: null, col: null, physicalPadId: null, positionConfidence: 'none',
      }));
    });
  });

  it('uses an identical source ID for note-on and note-off', () => {
    const on = launchpadSourceMetadata(input, 0x93, 45, 60, identity('launchpad-x'));
    const off = launchpadSourceMetadata(input, 0x83, 45, 60, identity('launchpad-x'));
    expect(off.sourceId).toBe(on.sourceId);
  });

  it('keeps duplicate raw pitches and device sources isolated', () => {
    const a = launchpadSourceMetadata({ id: 'a' }, 0x90, 11, 60, identity('launchpad-x'));
    const b = launchpadSourceMetadata({ id: 'b' }, 0x90, 12, 60, identity('launchpad-x'));
    expect(a.sourceId).not.toBe(b.sourceId);
    expect(a.sourceId).not.toBe(launchpadSourceMetadata({ id: 'a' }, 0x90, 12, 60, identity('launchpad-x')).sourceId);
  });

  it.each([
    undefined,
    { model: 'launchpad-x', deviceHeader: 0x0c, layout: 4 },
    { model: 'launchpad-x', deviceHeader: 0x0d, layout: 0x7f },
    { model: 'launchpad-x', inquiryFamily: 0x13, layout: 0x7f },
    { model: 'custom', deviceHeader: 0x0c, layout: 0x7f },
    { model: 'launchpad-x', deviceHeader: 'bad', layout: 0x7f },
  ])('keeps unknown/custom/malformed identity raw and positionless', (badIdentity) => {
    expect(launchpadSourceMetadata(input, 0x91, 54, 60, badIdentity)).toEqual(expect.objectContaining({
      deviceId: 'lp-input', sourceId: 'lp-input:1:54', rawPad: 54, rawNote: 54,
      row: null, col: null, physicalPadId: null, positionConfidence: 'none',
    }));
  });

  it('does not infer rotation or origin from identity metadata', () => {
    const source = launchpadSourceMetadata(input, 0x90, 11, 60, { ...identity('launchpad-pro-mk3'), rotation: 180, origin: 'top-left' });
    expect(source).toEqual(expect.objectContaining({ row: 0, col: 0, positionConfidence: 'exact' }));
    expect(source).not.toHaveProperty('rotation');
    expect(source).not.toHaveProperty('origin');
  });

  it('wires exact Launchpad metadata into the shared MIDI ownership contract only after identity is established', () => {
    const wiredInput = { id: 'wired', launchpadProgrammerIdentity: identity('launchpad-mini-mk3') };
    expect(midiSourceMetadataForInput(wiredInput, 0x90, 18, 60, false)).toEqual(expect.objectContaining({
      sourceId: 'wired:0:r0c7', rawPad: 18, row: 0, col: 7, positionConfidence: 'exact',
    }));
    expect(midiSourceMetadataForInput({ id: 'unverified' }, 0x90, 18, 60, false)).toEqual(expect.objectContaining({
      sourceId: 'unverified:0:18', rawPad: 18, row: null, col: null, positionConfidence: 'none',
    }));
  });
});
