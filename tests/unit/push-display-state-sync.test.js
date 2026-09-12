import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the complete display consumer. DOM notifications, canvas and USB are
// boundary fakes; this does not assert physical pixels or a device Human Gate.
function fixture(desktop = false) {
  const elements = new Map();
  const observers = [];
  const frames = [];
  const listeners = new Map();
  let paint = [];
  let connectCount = 0;
  let snapshot = { mode: 'scale', key: 'C', scale: 'Major (Ionian)', notes: [] };
  const context2d = {
    fillStyle: '', textBaseline: '', font: '',
    fillRect(...args) { paint.push([this.fillStyle, ...args]); },
    fillText(...args) { paint.push([this.fillStyle, ...args]); },
    measureText(text) { return { width: String(text).length * 8 }; },
    getImageData() { const data = JSON.stringify(paint); paint = []; return { data }; },
  };
  function element(id) {
    return { id, style: {}, dataset: {}, textContent: '', firstChild: null,
      insertBefore(child) { if (child.id) elements.set(child.id, child); },
      addEventListener(type, callback) { listeners.set(`${id}:${type}`, callback); },
    };
  }
  for (const id of ['sound-header', 'midi-detect', 'pad-grid', 'mode-scale', 'mode-chord', 'mode-input']) {
    elements.set(id, element(id));
  }
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
  }
  class Display {
    constructor(usb, frame, status) { this.status = status; frames.push(frame); }
    setFrame(frame) { frames.push(frame); }
    async connect() { connectCount++; this.status('running', 'connected'); }
    async stop() { this.status('idle', 'stopped'); }
  }
  const sandbox = {
    console, WIDTH: 960, HEIGHT: 160,
    PushWebUsbDisplay: Display, encodePushDisplayFrame: data => data,
    fastClearPushPads() {}, hardClearPushMidiOutputs() {},
    MutationObserver: Observer, navigator: { usb: {} },
    setTimeout: callback => callback(),
    document: {
      getElementById: id => elements.get(id),
      createElement: tag => tag === 'canvas' ? { getContext: () => context2d } : element('button'),
    },
    IS_DESKTOP_MODE: desktop, isSecureContext: true,
    padWebGetPushDisplaySnapshot: () => snapshot,
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  sandbox.window = sandbox;
  const source = fs.readFileSync('push-display-webusb-app.js', 'utf8')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '');
  vm.runInNewContext(source, sandbox, { filename: 'push-display-webusb-app.js' });
  return {
    frames,
    change(patch) { snapshot = { ...snapshot, ...patch }; },
    notify(id) {
      const target = elements.get(id);
      for (const observer of observers) {
        if (observer.targets.has(target)) observer.callback([{ target, type: 'childList' }]);
      }
    },
    connectCount: () => connectCount,
    hasButton: () => elements.has('push-webusb-display-btn'),
  };
}

describe('Push display follows rendered musical state without MIDI activity', () => {
  it('refreshes key-only changes after pad-grid render, with no detect mutation or mode click', () => {
    const f = fixture();
    const before = f.frames.at(-1);
    f.change({ key: 'D' });
    f.notify('pad-grid');
    assert.equal(f.frames.length, 2);
    assert.notEqual(f.frames.at(-1), before);
  });

  it('refreshes scale-only changes after pad-grid render', () => {
    const f = fixture();
    const before = f.frames.at(-1);
    f.change({ scale: 'Dorian' });
    f.notify('pad-grid');
    assert.equal(f.frames.length, 2);
    assert.notEqual(f.frames.at(-1), before);
  });

  it('reads the latest key and scale on every render, including returning to the original state', () => {
    const f = fixture();
    const original = f.frames.at(-1);
    f.change({ key: 'F', scale: 'Mixolydian' });
    f.notify('pad-grid');
    const changed = f.frames.at(-1);
    assert.notEqual(changed, original);
    f.change({ key: 'C', scale: 'Major (Ionian)' });
    f.notify('pad-grid');
    assert.equal(f.frames.length, 3);
    assert.equal(f.frames.at(-1), original);
  });

  it('preserves detect updates and never connects USB merely because state changed', () => {
    const f = fixture();
    const before = f.frames.at(-1);
    f.change({ chord: 'Cm7', notes: ['C', 'Eb', 'G', 'Bb'] });
    f.notify('midi-detect');
    assert.notEqual(f.frames.at(-1), before);
    f.change({ key: 'G' });
    f.notify('pad-grid');
    assert.equal(f.connectCount(), 0);
  });

  it('does not create a second display consumer in Desktop mode', () => {
    const f = fixture(true);
    f.change({ key: 'D', scale: 'Dorian' });
    f.notify('pad-grid');
    assert.equal(f.frames.length, 0);
    assert.equal(f.hasButton(), false);
    assert.equal(f.connectCount(), 0);
  });
});
