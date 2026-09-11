import {
  WIDTH,
  HEIGHT,
  PushWebUsbDisplay,
  encodePushDisplayFrame,
} from './push-display-webusb.js';

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

    function appSnapshotText() {
      const detect = document.getElementById('midi-detect');
      const detected = (detect?.textContent || '').replace(/\s+/g, ' ').trim();
      if (detected) return detected.slice(0, 72);
      if (document.getElementById('mode-scale')?.classList.contains('active')) return 'Scale mode';
      if (document.getElementById('mode-chord')?.classList.contains('active')) return 'Chord mode';
      if (document.getElementById('mode-input')?.classList.contains('active')) return 'Input mode';
      return '64 Pad Explorer';
    }

    function drawFrame() {
      context.fillStyle = '#0b1013';
      context.fillRect(0, 0, WIDTH, HEIGHT);

      context.fillStyle = '#6aa89d';
      context.fillRect(0, 0, WIDTH, 8);
      context.fillStyle = '#b8e1d7';
      context.font = '600 24px system-ui, sans-serif';
      context.fillText('64 PAD EXPLORER · WEBUSB', 28, 44);

      context.fillStyle = '#ffffff';
      context.font = '700 34px system-ui, sans-serif';
      let label = appSnapshotText();
      while (context.measureText(label).width > WIDTH - 56 && label.length > 8) {
        label = label.slice(0, -2);
      }
      context.fillText(label, 28, 96);

      context.fillStyle = '#9aa9ad';
      context.font = '18px system-ui, sans-serif';
      context.fillText('Chrome → WebUSB → Push 3 display', 28, 132);

      context.fillStyle = '#e36d5b';
      context.fillRect(720, 24, 44, 104);
      context.fillStyle = '#74b87a';
      context.fillRect(776, 24, 44, 104);
      context.fillStyle = '#638bd8';
      context.fillRect(832, 24, 44, 104);
      context.fillStyle = '#d8dde0';
      context.fillRect(888, 24, 44, 104);

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
      if (state === 'running') {
        await probe.stop();
      } else {
        probe.setFrame(drawFrame());
        await probe.connect();
      }
    });

    const detect = document.getElementById('midi-detect');
    if (detect && typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => {
        try { probe.setFrame(drawFrame()); } catch (_) {}
      }).observe(detect, { childList: true, subtree: true, characterData: true });
    }

    ['mode-scale', 'mode-chord', 'mode-input'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        setTimeout(() => {
          try { probe.setFrame(drawFrame()); } catch (_) {}
        }, 0);
      });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void probe.stop('Push display stopped because this tab was hidden.');
    });
    window.addEventListener('pagehide', () => void probe.stop());
  }
}
