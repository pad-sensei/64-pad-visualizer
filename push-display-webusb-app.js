import {
  WIDTH,
  HEIGHT,
  PushWebUsbDisplay,
  encodePushDisplayFrame,
} from './push-display-webusb.js';
import { hardClearPushMidiOutputs } from './push-surface-cleanup.js';

const params = new URLSearchParams(window.location.search);
const enabled = params.has('webusb') && !window.IS_DESKTOP_MODE;

if (enabled) {
  const host = document.getElementById('sound-header');
  if (host) {
    const button = document.createElement('button');
    button.id = 'push-webusb-display-btn';
    button.type = 'button';
    button.textContent = 'Push Display';
    button.title = 'Connect Push 3 display via WebUSB (Chrome)';
    button.style.cssText = 'font-size:0.6rem;padding:2px 6px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;cursor:pointer;';

    const status = document.createElement('span');
    status.id = 'push-webusb-display-status';
    status.style.cssText = 'font-size:0.55rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    status.textContent = 'Push USB: ready';

    host.insertBefore(button, host.firstChild);
    host.insertBefore(status, button.nextSibling);

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    function fallbackSnapshot() {
      const detect = document.getElementById('midi-detect');
      const detected = (detect?.textContent || '').replace(/\s+/g, ' ').trim();
      return { chord: detected.slice(0, 48), notes: [], shell: '', ust: '', tensions: '', key: '', scale: '', mode: '' };
    }

    function currentSnapshot() {
      try { return window.padWebGetPushDisplaySnapshot?.() || fallbackSnapshot(); }
      catch (_) { return fallbackSnapshot(); }
    }

    function fitText(text, maxWidth) {
      let value = String(text || '');
      while (value && context.measureText(value).width > maxWidth) value = value.slice(0, -1);
      return value;
    }

    function drawLabel(text, x, y, size, color, weight = 500, maxWidth = 400) {
      if (!text) return;
      context.fillStyle = color;
      context.font = `${weight} ${size}px "M PLUS 1 Code", ui-monospace, monospace`;
      context.fillText(fitText(text, maxWidth), x, y);
    }

    function drawFrame() {
      const snap = currentSnapshot();
      context.fillStyle = '#0d1114';
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = '#e6a024';
      context.fillRect(0, 0, WIDTH, 5);
      context.fillStyle = '#449eb4';
      context.fillRect(0, HEIGHT - 5, WIDTH, 5);

      drawLabel(snap.chord, 32, 49, 38, '#ffdb5c', 700, 365);
      drawLabel(snap.notes.length ? `NOTE: ${snap.notes.join(' ')}` : '', 36, 84, 15, '#ccdae0', 500, 360);

      const detailX = 430;
      drawLabel(snap.ust ? `UST: ${snap.ust}` : '', detailX, 72, 17, '#ffdb5c', 600, 390);
      drawLabel(snap.shell ? `Shell: ${snap.shell}` : '', detailX, 100, 15, '#ccdae0', 500, 390);
      drawLabel(snap.tensions ? `Tension ${snap.tensions}` : '', detailX, 121, 15, '#ffb848', 500, 390);

      drawLabel('Key', 720, 16, 11, '#9aa9ad', 500, 90);
      drawLabel(snap.key, 720, 34, 17, '#ffdb5c', 700, 90);
      drawLabel('Scale', 810, 16, 11, '#9aa9ad', 500, 130);
      drawLabel(snap.scale, 810, 34, 15, '#ffdb5c', 600, 130);
      drawLabel((snap.mode || '').toUpperCase(), 850, 145, 11, '#ff6084', 600, 90);

      return encodePushDisplayFrame(context.getImageData(0, 0, WIDTH, HEIGHT).data);
    }

    const supported = window.isSecureContext && Boolean(navigator.usb);
    const probe = new PushWebUsbDisplay(navigator.usb, drawFrame(), (state, text) => {
      status.textContent = text;
      status.title = text;
      button.disabled = state === 'connecting' || state === 'stopping' || state === 'blocked' || !supported;
      button.textContent = state === 'running' ? 'Stop Push Display' : 'Push Display';
      button.dataset.state = state;
    });

    if (!supported) {
      button.disabled = true;
      status.textContent = 'WebUSB unavailable: use Chrome over HTTPS';
    }

    button.addEventListener('click', async () => {
      const state = button.dataset.state;
      if (state === 'running') await probe.stop();
      else {
        probe.setFrame(drawFrame());
        await probe.connect();
      }
    });

    const refreshFrame = () => {
      try { probe.setFrame(drawFrame()); } catch (_) {}
    };
    const detect = document.getElementById('midi-detect');
    if (detect && typeof MutationObserver !== 'undefined') {
      new MutationObserver(refreshFrame).observe(detect, { childList: true, subtree: true, characterData: true });
    }
    ['mode-scale', 'mode-chord', 'mode-input'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => setTimeout(refreshFrame, 0));
    });

    let cleanupStarted = false;
    function cleanupPushSurface() {
      if (cleanupStarted) return;
      cleanupStarted = true;
      try { window.padWebResetPushMidiRuntimeState?.(); } catch (_) {}
      try { hardClearPushMidiOutputs(window.padWebGetPushMidiOutputs?.() || []); } catch (_) {}
      try { void probe.stop('Push display stopped. Surface cleared.'); } catch (_) {}
    }
    window.addEventListener('pagehide', cleanupPushSurface, { capture: true });
    window.addEventListener('beforeunload', cleanupPushSurface, { capture: true });
  }
}
