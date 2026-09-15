import { describe, it, expect } from 'vitest';
import {
  WIDTH,
  HEIGHT,
  FRAME_BYTES,
  FILTER,
  FILTERS,
  PUSH2_FILTER,
  PUSH3_FILTER,
  HEADER,
  PushWebUsbDisplay,
  encodePushDisplayFrame,
  blackPushDisplayFrame,
  pushDisplayConfiguration,
  pushModelName,
} from '../../push-display-webusb.js';

function fixture(filter = FILTER) {
  const calls = [];
  const alt = {
    alternateSetting: 0,
    interfaceClass: 255,
    endpoints: [
      { endpointNumber: 1, direction: 'out', type: 'bulk', packetSize: 512 },
      { endpointNumber: 1, direction: 'in', type: 'bulk', packetSize: 512 },
    ],
  };
  const config = {
    configurationValue: 1,
    interfaces: [{ interfaceNumber: 0, alternates: [alt] }],
  };
  const device = {
    ...filter,
    configurations: [config],
    configuration: config,
    opened: false,
    async open() { calls.push('open'); this.opened = true; },
    async selectConfiguration(value) { calls.push(['configuration', value]); this.configuration = config; },
    async claimInterface(value) { calls.push(['claim', value]); },
    async selectAlternateInterface(iface, value) { calls.push(['alternate', iface, value]); },
    async transferOut(endpoint, bytes) {
      calls.push(['write', endpoint, bytes.slice()]);
      return { status: 'ok', bytesWritten: bytes.length };
    },
    async close() { calls.push('close'); this.opened = false; },
  };
  const usb = new EventTarget();
  usb.requestDevice = async options => { calls.push(['chooser', options]); return device; };
  const frame = encodePushDisplayFrame(new Uint8Array(WIDTH * HEIGHT * 4));
  const statuses = [];
  const probe = new PushWebUsbDisplay(usb, frame, (...args) => statuses.push(args), { intervalMs: 60000, timeoutMs: 50 });
  return { calls, alt, config, device, usb, frame, statuses, probe };
}

const writes = f => f.calls.filter(call => Array.isArray(call) && call[0] === 'write');

async function tick() {
  await new Promise(resolve => setImmediate(resolve));
}

describe('Push 2 / Push 3 WebUSB display transport', () => {
  it('encodes the shared native full-frame byte layout', () => {
    const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
    rgba.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const frame = encodePushDisplayFrame(rgba);
    expect(frame.length).toBe(FRAME_BYTES);
    expect(Array.from(frame.slice(0, 8))).toEqual([0xf8, 0xf3, 0x07, 0xf8, 0xe7, 0x0b, 0x18, 0x00]);
  });

  it('accepts both supported Ableton Push product IDs through the same display interface contract', () => {
    const push3 = fixture(PUSH3_FILTER);
    const push2 = fixture(PUSH2_FILTER);
    expect(pushModelName(push3.device)).toBe('Push 3');
    expect(pushModelName(push2.device)).toBe('Push 2');
    expect(pushDisplayConfiguration(push3.device)).toBe(1);
    expect(pushDisplayConfiguration(push2.device)).toBe(1);
    push2.alt.endpoints[0].endpointNumber = 2;
    expect(() => pushDisplayConfiguration(push2.device)).toThrow(/display interface/);
  });

  it('rejects unrelated Ableton USB products', () => {
    const f = fixture({ vendorId: 0x2982, productId: 0x9999 });
    expect(pushModelName(f.device)).toBe(null);
    expect(() => pushDisplayConfiguration(f.device)).toThrow(/Push 2 or Push 3/);
  });

  it('uses an explicit two-model chooser, claims interface 0, and writes header then frame', async () => {
    const f = fixture(PUSH2_FILTER);
    const connected = await f.probe.connect();
    await tick();
    expect(connected).toBe(true);
    expect(f.calls[0]).toEqual(['chooser', { filters: FILTERS.map(filter => ({ ...filter })) }]);
    expect(f.calls).toContainEqual(['claim', 0]);
    expect(f.calls).toContainEqual(['alternate', 0, 0]);
    expect(writes(f).length).toBe(2);
    expect(Array.from(writes(f)[0][2])).toEqual(HEADER);
    expect(writes(f)[1][2]).toEqual(f.frame);
    expect(f.statuses.some(([, text]) => /Push 2 display connected/.test(text))).toBe(true);
    await f.probe.stop();
    expect(f.device.opened).toBe(false);
  });

  it('reports Push 3 when the Push 3 PID was selected', async () => {
    const f = fixture(PUSH3_FILTER);
    expect(await f.probe.connect()).toBe(true);
    await tick();
    expect(f.statuses.some(([, text]) => /Push 3 display connected/.test(text))).toBe(true);
    await f.probe.stop();
  });

  it('uses a newly supplied frame on the next completed send', async () => {
    const f = fixture();
    const replacement = new Uint8Array(FRAME_BYTES).fill(0x5a);
    f.probe.setFrame(replacement);
    await f.probe.connect();
    await tick();
    expect(writes(f)[1][2]).toEqual(replacement);
    await f.probe.stop();
  });

  it('sends a black frame before closing a claimed display session', async () => {
    const f = fixture();
    await f.probe.connect();
    await tick();
    const beforeStop = writes(f).length;
    await f.probe.stop();
    const shutdownWrites = writes(f).slice(beforeStop);
    expect(shutdownWrites.length).toBe(2);
    expect(Array.from(shutdownWrites[0][2])).toEqual(HEADER);
    expect(shutdownWrites[1][2]).toEqual(blackPushDisplayFrame());
    expect(f.calls.at(-1)).toBe('close');
  });

  it('rejects an already-active incompatible USB configuration before claim', async () => {
    const f = fixture();
    f.device.configuration = { configurationValue: 2 };
    const connected = await f.probe.connect();
    expect(connected).toBe(false);
    expect(f.calls.some(call => Array.isArray(call) && call[0] === 'claim')).toBe(false);
    expect(writes(f).length).toBe(0);
  });
});
