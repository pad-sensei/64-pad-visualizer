import { describe, it, expect } from 'vitest';
import fs from 'fs';

const app = fs.readFileSync('push-display-webusb-app.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const fit = fs.readFileSync('push-display-text-fit.js', 'utf8');

describe('v1.8.1 Push Display exposure contract', () => {
  it('exposes manual WebUSB display without a hidden query gate on Web', () => {
    expect(app).toContain('const enabled = !window.IS_DESKTOP_MODE;');
    expect(app).not.toContain("params.has('webusb')");
    expect(app).not.toContain('new URLSearchParams(window.location.search)');
    expect(app).toContain("button.textContent = 'Push Display'");
  });

  it('places the manual Push Display control in the global header before Tutorials', () => {
    expect(app).toContain("document.querySelector('.header-bar')");
    expect(app).toContain("document.getElementById('tut-btn')");
    expect(app).toContain('host.insertBefore(button, anchor)');
    expect(app).toContain("status.setAttribute('aria-live', 'polite')");
    expect(app).not.toContain("document.getElementById('sound-header')");
  });

  it('shows Standalone Root and Quality entry labels on the normal Chord screen', () => {
    expect(app).toContain("['Root', 'Tasty', 'Stock', 'Guitar', 'Quality', 'Tension', 'Key', 'Scale']");
  });

  it('preserves the complete Push chord equation without sub-pixel fallback text', () => {
    expect(app).toContain("fitPushPixelText(snap.chord, 4, 688)");
    expect(app).toContain('headline.lines.forEach');
    expect(app).toContain('line.length');
    expect(app).not.toContain("drawPixelText(snap.chord, 32, 42, 4, '#ffdb5c', 20)");
    expect(app).not.toContain('detected.slice(0, 48)');
    expect(app).toContain("querySelector('.detect-top-group')");
    expect(app).toContain("'=':[0x14,0x14,0x14,0x14,0x14]");
    expect(app).toContain("'·':[0x00,0x00,0x08,0x00,0x00]");
    expect(fit).toContain('wrapPushPixelTextAtScaleOne');
    expect(fit).toContain('const scale = 1;');
    expect(fit).not.toContain('Math.min(maxScale, idealScale)');
    expect(sw).toContain("'push-display-text-fit.js?v=20260914-readable-wrap'");
  });

  it('invalidates the preview through its SW generation while retaining matching asset URLs', () => {
    expect(index).toContain('push-display-webusb-app.js?v=webusb-20260915-readable-wrap');
    expect(sw).toContain("'push-display-webusb-app.js?v=webusb-20260915-readable-wrap'");
    expect(sw).toContain("var CACHE_NAME = '64pad-v181-preview-20260915-alias-equation-8';");
    expect(sw).not.toContain("var CACHE_NAME = '64pad-v181-preview-20260914-alias-equivalence-5';");
    expect(sw).toContain("fetch(url, { cache: 'reload' })");
    expect(index).not.toContain('push-display-webusb-app.js?v=webusb-20260911-10');
  });
});
