import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Web Push control integration contract', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const sw = fs.readFileSync('sw.js', 'utf8');
  const midi = fs.readFileSync('midi.js', 'utf8');
  const main = fs.readFileSync('main.js', 'utf8');
  const host = fs.readFileSync('host-adapter.js', 'utf8');
  const control = fs.readFileSync('push-web-control.js', 'utf8');
  const portContract = fs.readFileSync('push-midi-port-contract.js', 'utf8');

  it('loads the CC mapper/dispatcher before midi.js and precaches both', () => {
    expect(html.indexOf('push-midi-port-contract.js?v=1.8.0-liveport3')).toBeGreaterThan(0);
    expect(html.indexOf('push-midi-cc-map.js?v=1.8.0')).toBeGreaterThan(html.indexOf('push-midi-port-contract.js?v=1.8.0-liveport3'));
    expect(html.indexOf('push-web-control.js?v=1.8.0-chord-lower-s1')).toBeGreaterThan(html.indexOf('push-midi-cc-map.js?v=1.8.0'));
    expect(html.indexOf('midi.js?v=1.8.0-chord-lower-s1')).toBeGreaterThan(html.indexOf('push-web-control.js?v=1.8.0-chord-lower-s1'));
    expect(sw).toContain("'push-midi-port-contract.js?v=1.8.0-liveport3'");
    expect(sw).toContain("'push-midi-cc-map.js?v=1.8.0'");
    expect(sw).toContain("'push-web-control.js?v=1.8.0-chord-lower-s1'");
  });

  it('routes Push CC through parity mapper after sustain and before pad-note handling', () => {
    const sustain = midi.indexOf('if (cmd === 0xb0 && rawNote === 64)');
    const controlPos = midi.indexOf('window.padWebHandlePushMidiCc');
    const perform = midi.indexOf('// Push perform mode: serial 4x4');
    expect(sustain).toBeGreaterThan(0);
    expect(controlPos).toBeGreaterThan(sustain);
    expect(perform).toBeGreaterThan(controlPos);
    expect(midi).not.toContain('// Push octave buttons: CC#55=▲, CC#54=▼');
  });

  it('keeps Push detection generation-neutral for Push 2 and Push 3 MIDI names', () => {
    expect(midi).toContain('function padWebIsPushMidiPortName(name)');
    expect(midi).toContain('window.padWebPushPortContract.isPushPortName(name)');
    expect(portContract).toContain('return /push/i.test(n)');
    expect(portContract).toContain("lower === 'live port'");
    expect(portContract).toContain("lower === 'user port'");
    expect(midi).toContain('supported Push 2 / Push 3 MIDI port');
  });

  it('keeps Web MIDI LED/CC standard and retires query-string hps gates', () => {
    expect(main).toContain('_controllerLedEnabled = true');
    expect(main).not.toContain('_lpHpsUnlocked');
    expect(midi).not.toContain('_lpHpsUnlocked');
    expect(main).not.toContain("has('hps')");
    expect(host).not.toContain("has('hps')");
  });

  it('uses physical held-slot ownership for octave edits, never a latched screen buffer', () => {
    expect(control).toContain('if (heldSlotActive()) return editHeldSlot(value * 12, false)');
    expect(control).toContain("call('shiftOctave', value)");
  });

  it('owns the complete Push MIDI port cluster without rewriting Pedal/CV hardware', () => {
    expect(midi).toContain('padWebPushPortContract.collectInputCluster(access, selectedId)');
    expect(midi).toContain('pushInputs.length > 0');
    expect(midi).not.toContain('initializePush3PedalMode');
    expect(midi).toContain("pedalPolicy: 'hardware-default-preserved-no-pedal-cv-sysex'");
    expect(portContract).not.toContain('0x37, 0x26, 0x50');
    expect(midi).toContain('padWebPushPortContract.topologySignature(access)');
  });

  it('keeps native-only Device action a browser no-op', () => {
    expect(control).toContain('if (code === 73) return true');
  });
});
