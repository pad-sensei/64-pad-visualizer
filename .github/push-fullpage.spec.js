const { test, expect } = require('@playwright/test');

// Simulate device transport only. Application scripts, DOM handlers, AudioWorklet,
// canvas rendering and USB frame encoding are real. This is not a hardware gate.
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const input = { id: 'test-live', name: 'Ableton Push 3 Live Port', manufacturer: 'Ableton',
      state: 'connected', connection: 'open', type: 'input', onmidimessage: null,
      async open() { return this; }, async close() { return this; } };
    const output = { ...input, id: 'test-out', type: 'output', send() {}, clear() {} };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]),
      sysexEnabled: true, onstatechange: null, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
    window.__testMidi = data => {
      if (!input.onmidimessage) throw new Error('Live Port listener not bound');
      input.onmidimessage({ data: new Uint8Array(data), timeStamp: performance.now() });
    };
    window.__testUsb = { chooserCount: 0, frameCount: 0, keyScaleHash: null };
    const configuration = { configurationValue: 1, interfaces: [{ interfaceNumber: 0, alternates: [{
      alternateSetting: 0, interfaceClass: 255,
      endpoints: [{ endpointNumber: 1, direction: 'out', type: 'bulk', packetSize: 512 }],
    }] }] };
    const device = {
      vendorId: 0x2982, productId: 0x1969, configurations: [configuration], configuration, opened: false,
      async open() { this.opened = true; }, async close() { this.opened = false; },
      async selectConfiguration() {}, async claimInterface() {}, async selectAlternateInterface() {},
      async releaseInterface() {},
      async transferOut(endpoint, bytes) {
        const frame = new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
        if (frame.byteLength === 160 * 2048) {
          // Hash the actual wire pixels for the key/scale region, not snapshot metadata.
          let hash = 2166136261;
          for (let y = 25; y < 65; y++) for (let x = 740 * 2; x < 958 * 2; x++) {
            hash = Math.imul(hash ^ frame[y * 2048 + x], 16777619) >>> 0;
          }
          __testUsb.keyScaleHash = hash;
          __testUsb.frameCount++;
        }
        return { status: 'ok', bytesWritten: bytes.byteLength };
      },
    };
    const usb = new EventTarget();
    usb.requestDevice = async () => { __testUsb.chooserCount++; return device; };
    usb.getDevices = async () => { throw new Error('Silent reconnect is forbidden'); };
    Object.defineProperty(navigator, 'usb', { value: usb, configurable: true });
  });
  await page.route('**/*', route => {
    const hostname = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(hostname) ? route.continue() : route.abort();
  });
});

test('full page routes Live-Port CC64 to e-piano PCM hold and release', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./?pushdiag=1', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof setSustain === 'function' && typeof initWebMIDI === 'function');
  await page.evaluate(() => dismissAudioOverlay());
  await page.locator('#organ-preset').selectOption('epiano:Rhodes DI');
  await page.waitForFunction(() => _epw_initialized && audioCtx.state === 'running');
  await page.evaluate(() => {
    window.__testAnalyser = audioCtx.createAnalyser();
    __testAnalyser.fftSize = 2048;
    _epw_node.connect(__testAnalyser);
    __testMidi([0xb0, 64, 127]);
    __testMidi([0x90, 60, 100]);
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => __testMidi([0x80, 60, 0]));
  await page.waitForTimeout(250);
  const held = await page.evaluate(() => {
    const pcm = new Float32Array(__testAnalyser.fftSize);
    __testAnalyser.getFloatTimeDomainData(pcm);
    return { rms: Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length),
      flags: [_midiSustainOn, _sustainOn, _epw_sustainOn], version: APP_VERSION,
      preset: AudioState.presetKey, pedal: window.__64PE_PUSH_MIDI_DIAG__.lastPedal };
  });
  expect(held.version).toBe('1.8.0');
  expect(held.preset).toBe('Rhodes DI');
  expect(held.flags).toEqual([true, true, true]);
  expect(Number.isFinite(held.rms)).toBe(true);
  expect(held.rms).toBeGreaterThan(0.000001);
  await page.evaluate(() => __testMidi([0xb0, 64, 0]));
  await page.waitForTimeout(450);
  const released = await page.evaluate(() => {
    const pcm = new Float32Array(__testAnalyser.fftSize);
    __testAnalyser.getFloatTimeDomainData(pcm);
    return { rms: Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length),
      flags: [_midiSustainOn, _sustainOn, _epw_sustainOn] };
  });
  expect(released.flags).toEqual([false, false, false]);
  expect(released.rms).toBeLessThan(held.rms * 0.1);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ held, released }));
});

test('key and scale changes reach the Push display without a played note', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./?pushdiag=1', { waitUntil: 'load' });
  await page.evaluate(() => dismissAudioOverlay());
  await page.locator('#mode-scale').click();
  await expect.poll(() => page.evaluate(() => __testUsb.chooserCount)).toBe(0);
  await page.locator('#push-webusb-display-btn').click();
  await expect.poll(() => page.evaluate(() => __testUsb.frameCount)).toBeGreaterThan(0);
  const initial = await page.evaluate(() => ({ hash: __testUsb.keyScaleHash,
    key: AppState.key, scale: AppState.scaleIdx, detect: document.getElementById('midi-detect').innerHTML }));
  await page.locator('#scale-select').selectOption('5');
  await expect.poll(() => page.evaluate(() => __testUsb.keyScaleHash)).not.toBe(initial.hash);
  const afterScale = await page.evaluate(() => ({ hash: __testUsb.keyScaleHash, snap: padWebGetPushDisplaySnapshot() }));
  expect(afterScale.snap.scale).toMatch(/Minor/);
  await page.evaluate(() => __testMidi([0xb0, 77, 1]));
  await expect.poll(() => page.evaluate(() => AppState.key)).not.toBe(initial.key);
  await expect.poll(() => page.evaluate(() => __testUsb.keyScaleHash)).not.toBe(afterScale.hash);
  expect(await page.evaluate(() => midiActiveNotes.size)).toBe(0);
  expect(await page.evaluate(() => document.getElementById('midi-detect').innerHTML)).toBe(initial.detect);
  expect(await page.evaluate(() => __testUsb.chooserCount)).toBe(1);
  expect(errors).toEqual([]);
  await page.locator('#push-webusb-display-btn').click();
});
