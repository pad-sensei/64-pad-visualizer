import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('Push Web LED shutdown guard', () => {
  const midiSource = fs.readFileSync(new URL('../../midi.js', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../../push-display-webusb-app.js', import.meta.url), 'utf8');

  it('freezes normal LED repaint before hardware clear', () => {
    expect(midiSource).toContain('function padWebBeginPushShutdown()');
    expect(midiSource).toContain('_lpOutputActive = false;');
    expect(midiSource).toContain('_lpProgrammerMode = false;');
    expect(midiSource).toContain('function updateLaunchpadLEDs(state) {\n  if (_pushWebShuttingDown) return;');
    const cleanupBegin = appSource.indexOf('padWebBeginPushShutdown?.()');
    const fastClear = appSource.indexOf('fastClearPushPads(pushOutputs)');
    expect(cleanupBegin).toBeGreaterThan(-1);
    expect(fastClear).toBeGreaterThan(cleanupBegin);
  });

  it('can re-enable the Push MIDI surface after an intentional hidden-tab shutdown', () => {
    expect(midiSource).toContain('function padWebResumePushSurface()');
    expect(appSource).toContain('window.padWebResumePushSurface?.()');
  });
});
