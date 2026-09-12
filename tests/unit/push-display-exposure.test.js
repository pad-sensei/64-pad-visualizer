import { describe, it, expect } from 'vitest';
import fs from 'fs';

const app = fs.readFileSync('push-display-webusb-app.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

describe('v1.8.0 Push Display exposure contract', () => {
  it('exposes manual WebUSB display without a hidden query gate on Web', () => {
    expect(app).toContain('const enabled = !window.IS_DESKTOP_MODE;');
    expect(app).not.toContain("params.has('webusb')");
    expect(app).not.toContain('new URLSearchParams(window.location.search)');
    expect(app).toContain("button.textContent = 'Push Display'");
  });

  it('invalidates the preview through its SW generation while retaining matching asset URLs', () => {
    expect(index).toContain('push-display-webusb-app.js?v=webusb-20260912-11');
    expect(sw).toContain("'push-display-webusb-app.js?v=webusb-20260912-11'");
    // This preview uses the SW cache generation, not a new product version or
    // per-file query, as its update identity. Install fetches fresh asset bytes.
    // See the current handover; this is not proof of a browser-loaded update.
    expect(sw).toContain("var CACHE_NAME = '64pad-v180-preview-20260912-semitone-5';");
    expect(sw).not.toContain("var CACHE_NAME = '64pad-v180-preview-20260912-display-active-4';");
    expect(sw).toContain("fetch(url, { cache: 'reload' })");
    expect(index).not.toContain('push-display-webusb-app.js?v=webusb-20260911-10');
  });
});
