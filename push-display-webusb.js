export const WIDTH = 960;
export const HEIGHT = 160;
export const FRAME_BYTES = 160 * 2048;
export const FILTER = Object.freeze({ vendorId: 0x2982, productId: 0x1969 });
export const HEADER = Object.freeze([255, 204, 170, 136, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

export function encodePushDisplayFrame(rgba) {
  if (!rgba || rgba.length !== WIDTH * HEIGHT * 4) {
    throw new Error('Expected 960 x 160 RGBA pixels.');
  }
  const frame = new Uint8Array(FRAME_BYTES);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      // Native Push display wire order: B5 G6 R5, little endian.
      const pixel = ((rgba[i + 2] >> 3) << 11) | ((rgba[i + 1] >> 2) << 5) | (rgba[i] >> 3);
      const offset = y * 2048 + x * 2;
      frame[offset] = pixel & 255;
      frame[offset + 1] = pixel >> 8;
    }
  }
  const mask = [0xe7, 0xf3, 0xe7, 0xff];
  for (let i = 0; i < frame.length; i++) frame[i] ^= mask[i % 4];
  return frame;
}

export function blackPushDisplayFrame() {
  return encodePushDisplayFrame(new Uint8Array(WIDTH * HEIGHT * 4));
}

export function pushDisplayConfiguration(device) {
  if (!device || device.vendorId !== FILTER.vendorId || device.productId !== FILTER.productId) {
    throw new Error('This WebUSB display path accepts Push 3 only.');
  }
  const candidates = (device.configurations || []).filter(config => {
    const iface = (config.interfaces || []).find(item => item.interfaceNumber === 0);
    const alt = iface?.alternates?.find(item => item.alternateSetting === 0);
    return alt?.interfaceClass === 255 && (alt.endpoints || []).some(endpoint =>
      endpoint.endpointNumber === 1 && endpoint.direction === 'out' &&
      endpoint.type === 'bulk' && endpoint.packetSize === 512);
  });
  if (candidates.length !== 1) {
    throw new Error('Expected Push 3 display interface 0 / alt 0 / bulk OUT 1 / 512 bytes.');
  }
  if (device.configuration && device.configuration.configurationValue !== candidates[0].configurationValue) {
    throw new Error('The active USB configuration does not match the Push display interface.');
  }
  return candidates[0].configurationValue;
}

function withDeadline(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

export class PushWebUsbDisplay {
  constructor(usb, frame, onStatus = () => {}, { intervalMs = 250, timeoutMs = 1500 } = {}) {
    if (!(frame instanceof Uint8Array) || frame.length !== FRAME_BYTES) {
      throw new Error('Invalid Push display frame.');
    }
    this.usb = usb;
    this.frame = frame.slice();
    this.onStatus = onStatus;
    this.intervalMs = Math.max(250, intervalMs);
    this.timeoutMs = timeoutMs;
    this.session = null;
    this.disconnect = event => {
      if (event.device === this.session?.device) void this.stop('Push 3 USB disconnected.');
    };
    usb?.addEventListener?.('disconnect', this.disconnect);
  }

  setFrame(frame) {
    if (!(frame instanceof Uint8Array) || frame.length !== FRAME_BYTES) {
      throw new Error('Invalid Push display frame.');
    }
    this.frame = frame.slice();
  }

  async connect() {
    if (this.session) return false;
    if (!this.usb?.requestDevice) throw new Error('WebUSB is unavailable.');
    const session = {
      device: null, stopped: false, connecting: true, frames: 0,
      timer: null, closing: null, claimed: false,
    };
    this.session = session;
    this.onStatus('connecting', 'Select Push 3 in the Chrome USB chooser.');
    try {
      session.device = await this.usb.requestDevice({ filters: [{ ...FILTER }] });
      if (session.stopped) return false;
      const configuration = pushDisplayConfiguration(session.device);
      await session.device.open();
      if (session.stopped) return false;
      if (!session.device.configuration) await session.device.selectConfiguration(configuration);
      if (session.stopped) return false;
      pushDisplayConfiguration(session.device);
      await session.device.claimInterface(0);
      if (session.stopped) return false;
      await session.device.selectAlternateInterface(0, 0);
      session.claimed = true;
      if (session.stopped) return false;
      this.onStatus('running', 'Push 3 display connected.');
      void this.sendFrame(session);
      return true;
    } catch (error) {
      if (!session.stopped) {
        await this.stop(error?.name === 'NotFoundError' ? 'No Push 3 selected.' : String(error?.message || error));
      }
      return false;
    } finally {
      session.connecting = false;
      if (session.stopped) await this.stop(session.message);
    }
  }

  async sendFrame(session) {
    if (session.stopped || this.session !== session) return;
    try {
      const frameForThisWrite = this.frame;
      for (const bytes of [new Uint8Array(HEADER), frameForThisWrite]) {
        if (session.stopped || this.session !== session) return;
        const result = await withDeadline(session.device.transferOut(1, bytes), this.timeoutMs, 'USB transfer');
        if (result.status !== 'ok' || result.bytesWritten !== bytes.length) {
          throw new Error(`USB write failed (${result.status}, ${result.bytesWritten}/${bytes.length} bytes).`);
        }
      }
      if (session.stopped || this.session !== session) return;
      session.frames += 1;
      this.onStatus('running', `Push display: ${session.frames} frame${session.frames === 1 ? '' : 's'} sent.`);
      session.timer = setTimeout(() => void this.sendFrame(session), this.intervalMs);
    } catch (error) {
      if (!session.stopped) await this.stop(String(error?.message || error));
    }
  }

  async sendFinalBlackFrame(session) {
  if (!session.device?.opened || !session.claimed) return;
  const black = blackPushDisplayFrame();
  try {
    for (const bytes of [new Uint8Array(HEADER), black]) {
      const result = await withDeadline(session.device.transferOut(1, bytes), this.timeoutMs, 'USB shutdown transfer');
      if (result.status !== 'ok' || result.bytesWritten !== bytes.length) break;
    }
  } catch (_) {
    // Best effort during page teardown: closing USB still takes priority.
  }
}

  async close(session) {
    if (!session.device?.opened) return;
    session.closing ??= withDeadline(session.device.close(), this.timeoutMs, 'USB close');
    try {
      await session.closing;
    } catch (error) {
      if (error?.name === 'NotFoundError') return;
      this.onStatus('blocked', `${error?.message || error} Reconnect is disabled until this page is closed.`);
      throw error;
    }
  }

  async stop(message = 'Push display stopped. USB connection released.') {
    const session = this.session;
    if (!session) return;
    session.stopped = true;
    session.message = message;
    clearTimeout(session.timer);
    this.onStatus('stopping', 'Stopping Push display output...');
    try {
      await this.sendFinalBlackFrame(session);
      await this.close(session);
      if (this.session === session && !session.connecting) {
        this.session = null;
        this.onStatus('idle', message);
      }
    } catch (_) {
      // Keep the blocked session so another chooser cannot overlap uncertain ownership.
    }
  }
}
