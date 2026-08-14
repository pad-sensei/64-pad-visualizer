import { describe, expect, it, vi } from 'vitest';
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

  it.each([
    ['launchpad-x', 'LPX MIDI'],
    ['launchpad-mini-mk3', 'LPMiniMK3 MIDI'],
    ['launchpad-pro-mk3', 'LPProMK3 MIDI'],
  ])('sets %s identity only after Programmer mode is sent to the uniquely paired official-model output', (model, name) => {
    const wiredInput = { id: model + '-in', name };
    const output = { id: model + '-out', name, send: vi.fn() };
    expect(establishLaunchpadProgrammerIdentity(wiredInput, [output])).toBe(true);
    expect(output.send).toHaveBeenCalledWith(LAUNCHPAD_MODELS[model].programmerModeMessage);
    expect(wiredInput.launchpadProgrammerIdentity).toEqual({ model, deviceHeader: LAUNCHPAD_MODELS[model].deviceHeader, layout: LAUNCHPAD_MODELS[model].programmerLayout });
    expect(midiSourceMetadataForInput(wiredInput, 0x90, 11, 60, false)).toEqual(expect.objectContaining({ row: 0, col: 0, positionConfidence: 'exact' }));
  });

  it('clears identity across reconnect and leaves generic/non-matching inputs untouched', () => {
    const input = { id: 'mini-in', name: 'LPMiniMK3 MIDI', launchpadProgrammerIdentity: identity('launchpad-mini-mk3') };
    clearLaunchpadProgrammerIdentity(input);
    expect(input).not.toHaveProperty('launchpadProgrammerIdentity');
    expect(establishLaunchpadProgrammerIdentity(input, [{ id: 'x-out', name: 'LPX MIDI', send: () => {} }])).toBe(false);
    expect(input).not.toHaveProperty('launchpadProgrammerIdentity');

    const generic = { id: 'keys', name: 'Keyboard', launchpadProgrammerIdentity: identity('launchpad-x') };
    expect(establishLaunchpadProgrammerIdentity(generic, [{ id: 'x-out', name: 'LPX MIDI', send: () => {} }])).toBe(false);
    expect(generic).not.toHaveProperty('launchpadProgrammerIdentity');
    expect(midiSourceMetadataForInput(generic, 0x90, 60, 60, false)).toEqual(expect.objectContaining({ rawPad: 60, row: null, col: null, positionConfidence: 'none' }));
  });

  it('rejects duplicate candidate outputs so reconnect cannot claim the wrong same-model device', () => {
    const input = { id: 'pro-in', name: 'LPProMK3 MIDI' };
    const outputs = [
      { id: 'pro-a', name: 'LPProMK3 MIDI', send: () => {} },
      { id: 'pro-b', name: 'LPProMK3 MIDI', send: () => {} },
    ];
    expect(establishLaunchpadProgrammerIdentity(input, outputs)).toBe(false);
    expect(input).not.toHaveProperty('launchpadProgrammerIdentity');
  });

  it('requests SysEx first and falls back to ordinary Web MIDI when permission is refused', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new Error('sysex denied'))
      .mockResolvedValueOnce({ inputs: new Map(), outputs: new Map() });
    await expect(requestWebMIDIAccess(request)).resolves.toEqual(expect.objectContaining({ inputs: expect.any(Map) }));
    expect(request.mock.calls).toEqual([[{ sysex: true }], []]);
  });

  it('keeps the SysEx-granted access without a second request', async () => {
    const access = { inputs: new Map(), outputs: new Map() };
    const request = vi.fn().mockResolvedValue(access);
    await expect(requestWebMIDIAccess(request)).resolves.toBe(access);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ sysex: true });
  });

  it('keeps a generic input raw while a verified input remaps only fixed grid notes', () => {
    const launchpad = { id: 'x', name: 'LPX MIDI', launchpadProgrammerIdentity: identity('launchpad-x') };
    const generic = { id: 'keys', name: 'Keyboard' };
    expect(midiNoteForInput(launchpad, 11, false)).not.toBe(11);
    expect(midiNoteForInput(launchpad, 19, false)).toBe(19); // right-side CC / non-grid
    expect(midiNoteForInput(generic, 11, false)).toBe(11);
    expect(midiNoteForInput(generic, 19, false)).toBe(19);
  });

  it('uses the Pro Programmer/Live toggle exit message after a successful Programmer session', () => {
    const input = { id: 'pro', name: 'LPProMK3 MIDI' };
    const output = { id: 'pro-out', name: 'LPProMK3 MIDI', send: vi.fn() };
    expect(establishLaunchpadProgrammerIdentity(input, [output])).toBe(true);
    exitLaunchpadProgrammerMode();
    expect(output.send).toHaveBeenLastCalledWith([0xF0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, 0x00, 0xF7]);
  });

  it('does not retain identity when the Programmer SysEx send throws', () => {
    const input = { id: 'x', name: 'LPX MIDI' };
    expect(establishLaunchpadProgrammerIdentity(input, [{ name: 'LPX MIDI', send: () => { throw new Error('blocked'); } }])).toBe(false);
    expect(input).not.toHaveProperty('launchpadProgrammerIdentity');
  });
});
