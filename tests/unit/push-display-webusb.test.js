import { describe, it, expect } from 'vitest';
import {
  WIDTH,
  HEIGHT,
  FRAME_BYTES,
  FILTER,
  HEADER,
  PushWebUsbDisplay,
  encodePushDisplayFrame,
  blackPushDisplayFrame,
  pushDisplayConfiguration,
} from '../../push-display-webusb.js';

function fixture() {
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
    ...FILTER,
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

describe('Push 3 WebUSB display transport', () => {
  it('encodes the native full-frame byte layout', () => {
    const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
    rgba.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const frame = encodePushDisplayFrame(rgba);
    expect(frame.length).toBe(FRAME_BYTES);
    expect(Array.from(frame.slice(0, 8))).toEqual([0xf8, 0xf3, 0x07, 0xf8, 0xe7, 0x0b, 0x18, 0x00]);
  });

  it('accepts only the known Push 3 display interface', () => {
    const f = fixture();
    expect(pushDisplayConfiguration(f.device)).toBe(1);
    f.alt.endpoints[0].endpointNumber = 2;
    expect(() => pushDisplayConfiguration(f.device)).toThrow(/display interface/);
  });

  it('uses an explicit chooser, claims interface 0, and writes header then frame', async () => {
    const f = fixture();
    const connected = await f.probe.connect();
    await tick();
    expect(connected).toBe(true);
    expect(f.calls[0]).toEqual(['chooser', { filters: [{ ...FILTER }] }]);
    expect(f.calls).toContainEqual(['claim', 0]);
    expect(f.calls).toContainEqual(['alternate', 0, 0]);
    expect(writes(f).length).toBe(2);
    expect(Array.from(writes(f)[0][2])).toEqual(HEADER);
    expect(writes(f)[1][2]).toEqual(f.frame);
    await f.probe.stop();
    expect(f.device.opened).toBe(false);
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
