import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fitPushPixelText } from '../../push-display-text-fit.js';

// Complete display consumer, with DOM/canvas/USB boundary fakes. This asserts
// invalidation and idle work, not real browser timing or physical display pixels.
function fixture({ desktop = false, supported = true, secure = true } = {}) {
  const elements = new Map();
  const observers = [];
  const frames = [];
  const listeners = new Map();
  let paint = [];
  let connectCount = 0;
  let readCount = 0;
  let encodeCount = 0;
  let display;
  let snapshot = { mode: 'scale', key: 'C', scale: 'Major (Ionian)', notes: [] };
  const context2d = {
    fillStyle: '', textBaseline: '', font: '',
    fillRect(...args) { paint.push([this.fillStyle, ...args]); },
    fillText(...args) { paint.push([this.fillStyle, ...args]); },
    measureText(text) { return { width: String(text).length * 8 }; },
    getImageData() {
      readCount++;
      const data = JSON.stringify(paint);
      paint = [];
      return { data };
    },
  };
  function element(id) {
    return { id, style: {}, dataset: {}, textContent: '', firstChild: null, parentElement: null,
      setAttribute() {},
      insertBefore(child) { child.parentElement = this; if (child.id) elements.set(child.id, child); },
      addEventListener(type, callback) { listeners.set(`${this.id}:${type}`, callback); },
    };
  }
  for (const id of ['sound-header', 'midi-detect', 'pad-grid', 'mode-scale', 'mode-chord', 'mode-input']) {
    elements.set(id, element(id));
  }
  const headerBar = element('header-bar');
  const tutorialButton = element('tut-btn');
  tutorialButton.parentElement = headerBar;
  elements.set('tut-btn', tutorialButton);
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
  }
  class Display {
    constructor(usb, frame, status) { display = this; this.status = status; frames.push(frame); }
    setFrame(frame) { frames.push(frame); }
    async connect() { connectCount++; this.status('running', 'connected'); }
    async stop() { this.status('idle', 'stopped'); }
  }
  const sandbox = {
    console, WIDTH: 960, HEIGHT: 160,
    PushWebUsbDisplay: Display,
    encodePushDisplayFrame(data) { encodeCount++; return data; },
    fastClearPushPads() {}, hardClearPushMidiOutputs() {},
    fitPushPixelText,
    MutationObserver: Observer, navigator: supported ? { usb: {} } : {},
    setTimeout: callback => callback(),
    document: {
      getElementById: id => elements.get(id),
      querySelector: selector => selector === '.header-bar' ? headerBar : null,
      createElement: tag => tag === 'canvas' ? { getContext: () => context2d } : element(tag),
    },
    IS_DESKTOP_MODE: desktop, isSecureContext: secure,
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
    click: () => listeners.get('push-webusb-display-btn:click')(),
    modeClick: () => listeners.get('mode-scale:click')?.(),
    setState: state => display.status(state, state),
    metrics: () => ({ reads: readCount, encodes: encodeCount, frames: frames.length }),
    connectCount: () => connectCount,
    hasButton: () => elements.has('push-webusb-display-btn'),
  };
}

describe('Push display follows rendered musical state only while active', () => {
  it('refreshes key-only changes while running without a detect mutation or mode click', async () => {
    const f = fixture();
    await f.click();
    const before = f.frames.at(-1);
    const count = f.frames.length;
    f.change({ key: 'D' });
    f.notify('pad-grid');
    assert.equal(f.frames.length, count + 1);
    assert.notEqual(f.frames.at(-1), before);
    assert.equal(f.connectCount(), 1);
  });

  it('refreshes scale-only changes while running', async () => {
    const f = fixture();
    await f.click();
    const before = f.frames.at(-1);
    f.change({ scale: 'Dorian' });
    f.notify('pad-grid');
    assert.notEqual(f.frames.at(-1), before);
  });

  it('reads current state on every active render, including returning to the original state', async () => {
    const f = fixture();
    await f.click();
    const original = f.frames.at(-1);
    f.change({ key: 'F', scale: 'Mixolydian' });
    f.notify('pad-grid');
    assert.notEqual(f.frames.at(-1), original);
    f.change({ key: 'C', scale: 'Major (Ionian)' });
    f.notify('pad-grid');
    assert.equal(f.frames.at(-1), original);
  });

  it('preserves detect updates without another USB connection', async () => {
    const f = fixture();
    await f.click();
    const before = f.frames.at(-1);
    f.change({ chord: 'Cm7', notes: ['C', 'Eb', 'G', 'Bb'] });
    f.notify('midi-detect');
    assert.notEqual(f.frames.at(-1), before);
    assert.equal(f.connectCount(), 1);
  });

  it('does no observer-driven readback, encoding or frame copy in inactive states', () => {
    const f = fixture();
    const initial = f.metrics(); // The existing one-time initial frame is unchanged.
    for (const state of [undefined, 'idle', 'connecting', 'stopping', 'blocked', 'error']) {
      f.setState(state);
      f.change({ key: 'D', scale: 'Dorian' });
      f.notify('pad-grid');
      f.notify('midi-detect');
      f.modeClick();
      assert.deepEqual(f.metrics(), initial, `unexpected idle drawing in ${state}`);
    }
    assert.equal(f.connectCount(), 0);
  });

  it('does no observer-driven drawing without WebUSB or a secure context', () => {
    for (const options of [{ supported: false }, { secure: false }]) {
      const f = fixture(options);
      const initial = f.metrics();
      f.change({ key: 'G' });
      f.notify('pad-grid');
      f.notify('midi-detect');
      f.modeClick();
      assert.deepEqual(f.metrics(), initial);
      assert.equal(f.connectCount(), 0);
    }
  });

  it('an explicit first connection uses the latest state after idle changes', async () => {
    const f = fixture();
    const initial = f.frames.at(-1);
    f.change({ key: 'D', scale: 'Dorian' });
    f.notify('pad-grid');
    assert.equal(f.frames.at(-1), initial);
    await f.click();
    assert.notEqual(f.frames.at(-1), initial);
    assert.equal(f.connectCount(), 1);
  });

  it('stopping suppresses redraws and explicit reconnect catches up to the latest state', async () => {
    const f = fixture();
    await f.click();
    await f.click(); // Existing Stop Push Display path returns to idle.
    const stopped = f.metrics();
    const frame = f.frames.at(-1);
    f.change({ key: 'F', scale: 'Mixolydian' });
    f.notify('pad-grid');
    assert.deepEqual(f.metrics(), stopped);
    await f.click();
    assert.notEqual(f.frames.at(-1), frame);
    assert.equal(f.connectCount(), 2);
  });

  it('continues updating during transport recovery without opening another connection', async () => {
    const f = fixture();
    await f.click();
    f.setState('recovering');
    const before = f.frames.at(-1);
    f.change({ key: 'A' });
    f.notify('pad-grid');
    assert.notEqual(f.frames.at(-1), before);
    assert.equal(f.connectCount(), 1);
  });

  it('does not create a second display consumer in Desktop mode', () => {
    const f = fixture({ desktop: true });
    f.change({ key: 'D', scale: 'Dorian' });
    f.notify('pad-grid');
    assert.deepEqual(f.metrics(), { reads: 0, encodes: 0, frames: 0 });
    assert.equal(f.hasButton(), false);
    assert.equal(f.connectCount(), 0);
  });
});
