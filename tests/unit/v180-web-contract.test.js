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
    expect(main).toContain('_controllerLedEnabled = true');
    expect(main).not.toContain('_lpHpsUnlocked');
  });

  it('keeps paid Desktop affiliate-free without using hps as a feature gate', () => {
    expect(html).toContain("window.IS_DESKTOP_MODE || _affiliateParams.has('hps')");
    expect(html).toContain("document.querySelectorAll('#affiliate-section, .ja-affiliate')");
  });

  it('shows one product version for Web', () => {
    expect(html).toContain('<span class="version-tag">v1.8.0</span>');
    expect(html).toContain('"softwareVersion":"1.8.0"');
  });

  it('keeps display opt-in lifecycle separate from MIDI pad ownership', () => {
    // A visibility transition is not a teardown. The physical Push display needs
    // its keepalive stream, so hiding/switching the tab must not call probe.stop().
    expect(display).not.toContain("document.addEventListener('visibilitychange'");
    expect(display).not.toContain('Push display paused because this tab was hidden.');
    // Real page teardown still performs the best-effort display + MIDI cleanup.
    expect(display).toContain("window.addEventListener('pagehide', () => cleanupPushSurface()");
    expect(display).toContain("window.addEventListener('beforeunload', () => cleanupPushSurface()");
  });
});
