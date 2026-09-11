import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('v1.8.0 Web product contract', () => {
  const main = fs.readFileSync('main.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const display = fs.readFileSync('push-display-webusb-app.js', 'utf8');

  it('retires URL-based hps feature gates', () => {
    expect(main).not.toContain("has('hps')");
    expect(main).toContain('TastyState.hpsUnlocked = true');
    expect(main).toContain('StockState.hpsUnlocked = true');
    expect(main).toContain('_lpHpsUnlocked = true');
  });

  it('shows one product version for Web', () => {
    expect(html).toContain('<span class="version-tag">v1.8.0</span>');
    expect(html).toContain('"softwareVersion":"1.8.0"');
  });

  it('keeps display opt-in lifecycle separate from MIDI pad ownership', () => {
    const hidden = display.match(/document\.addEventListener\('visibilitychange'[\s\S]*?\}, \{ capture: true \}\);/)?.[0] || '';
    expect(hidden).toContain('probe.stop');
    expect(hidden).not.toContain('cleanupPushSurface');
    expect(hidden).not.toContain('hardClearPushMidiOutputs');
  });
});
