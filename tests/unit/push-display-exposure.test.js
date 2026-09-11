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

  it('cache-busts the exposed display controller consistently', () => {
    expect(index).toContain('push-display-webusb-app.js?v=webusb-20260912-11');
    expect(sw).toContain("'push-display-webusb-app.js?v=webusb-20260912-11'");
    expect(sw).toContain("var CACHE_NAME = '64pad-v180-preview-20260912-webusb-exposure-1';");
    expect(index).not.toContain('push-display-webusb-app.js?v=webusb-20260911-10');
  });
});
