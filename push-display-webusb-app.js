import {
  WIDTH,
  HEIGHT,
  PushWebUsbDisplay,
  encodePushDisplayFrame,
} from './push-display-webusb.js?v=webusb-20260911-10';
import { fastClearPushPads, hardClearPushMidiOutputs } from './push-surface-cleanup.js?v=webusb-20260911-7';
import { fitPushPixelText } from './push-display-text-fit.js?v=20260914-no-truncate';

// v1.8.0: Push display is a standard optional/manual WebUSB feature.
// The user still explicitly presses Push Display; only Desktop mode hides this browser control.
const enabled = !window.IS_DESKTOP_MODE;

const GLYPHS = Object.freeze({
  A:[0x7e,0x11,0x11,0x11,0x7e], B:[0x7f,0x49,0x49,0x49,0x36], C:[0x3e,0x41,0x41,0x41,0x22],
  D:[0x7f,0x41,0x41,0x22,0x1c], E:[0x7f,0x49,0x49,0x49,0x41], F:[0x7f,0x09,0x09,0x09,0x01],
  G:[0x3e,0x41,0x49,0x49,0x7a], H:[0x7f,0x08,0x08,0x08,0x7f], I:[0x00,0x41,0x7f,0x41,0x00],
  J:[0x20,0x40,0x41,0x3f,0x01], K:[0x7f,0x08,0x14,0x22,0x41], L:[0x7f,0x40,0x40,0x40,0x40],
  M:[0x7f,0x02,0x0c,0x02,0x7f], N:[0x7f,0x04,0x08,0x10,0x7f], O:[0x3e,0x41,0x41,0x41,0x3e],
  P:[0x7f,0x09,0x09,0x09,0x06], Q:[0x3e,0x41,0x51,0x21,0x5e], R:[0x7f,0x09,0x19,0x29,0x46],
  S:[0x46,0x49,0x49,0x49,0x31], T:[0x01,0x01,0x7f,0x01,0x01], U:[0x3f,0x40,0x40,0x40,0x3f],
  V:[0x1f,0x20,0x40,0x20,0x1f], W:[0x7f,0x20,0x18,0x20,0x7f], X:[0x63,0x14,0x08,0x14,0x63],
  Y:[0x07,0x08,0x70,0x08,0x07], Z:[0x61,0x51,0x49,0x45,0x43],
  a:[0x20,0x54,0x54,0x54,0x78], b:[0x7f,0x48,0x44,0x44,0x38], c:[0x38,0x44,0x44,0x44,0x20],
  d:[0x38,0x44,0x44,0x48,0x7f], e:[0x38,0x54,0x54,0x54,0x18], f:[0x08,0x7e,0x09,0x01,0x02],
  g:[0x0c,0x52,0x52,0x52,0x3e], h:[0x7f,0x08,0x04,0x04,0x78], i:[0x00,0x44,0x7d,0x40,0x00],
  j:[0x20,0x40,0x44,0x3d,0x00], k:[0x7f,0x10,0x28,0x44,0x00], l:[0x00,0x41,0x7f,0x40,0x00],
  m:[0x7c,0x04,0x18,0x04,0x78], n:[0x7c,0x08,0x04,0x04,0x78], o:[0x38,0x44,0x44,0x44,0x38],
  p:[0x7c,0x14,0x14,0x14,0x08], q:[0x08,0x14,0x14,0x18,0x7c], r:[0x7c,0x08,0x04,0x04,0x08],
  s:[0x48,0x54,0x54,0x54,0x20], t:[0x04,0x3f,0x44,0x40,0x20], u:[0x3c,0x40,0x40,0x20,0x7c],
  v:[0x1c,0x20,0x40,0x20,0x1c], w:[0x3c,0x40,0x30,0x40,0x3c], x:[0x44,0x28,0x10,0x28,0x44],
  y:[0x0c,0x50,0x50,0x50,0x3c], z:[0x44,0x64,0x54,0x4c,0x44],
  '0':[0x3e,0x51,0x49,0x45,0x3e], '1':[0x00,0x42,0x7f,0x40,0x00], '2':[0x42,0x61,0x51,0x49,0x46],
  '3':[0x21,0x41,0x45,0x4b,0x31], '4':[0x18,0x14,0x12,0x7f,0x10], '5':[0x27,0x45,0x45,0x45,0x39],
  '6':[0x3c,0x4a,0x49,0x49,0x30], '7':[0x01,0x71,0x09,0x05,0x03], '8':[0x36,0x49,0x49,0x49,0x36],
  '9':[0x06,0x49,0x49,0x29,0x1e], '#':[0x14,0x7f,0x14,0x7f,0x14], '/':[0x20,0x10,0x08,0x04,0x02],
  '(':[0x00,0x1c,0x22,0x41,0x00], ')':[0x00,0x41,0x22,0x1c,0x00], '[':[0x00,0x7f,0x41,0x41,0x00],
  ']':[0x00,0x41,0x41,0x7f,0x00], ',':[0x00,0x50,0x30,0x00,0x00], '.':[0x00,0x60,0x60,0x00,0x00],
  '-':[0x08,0x08,0x08,0x08,0x08], ':':[0x00,0x36,0x36,0x00,0x00], '>':[0x41,0x22,0x14,0x08,0x00],
  '<':[0x08,0x14,0x22,0x41,0x00], '=':[0x14,0x14,0x14,0x14,0x14], '·':[0x00,0x00,0x08,0x00,0x00],
  '♭':[0x7e,0x20,0x38,0x44,0x38],
});

if (enabled) {
  const host = document.querySelector('.header-bar');
  const anchor = document.getElementById('tut-btn');
  if (host && anchor && anchor.parentElement === host) {
    const button = document.createElement('button');
    button.id = 'push-webusb-display-btn';
    button.type = 'button';
    button.textContent = 'Push Display';
    button.title = 'Connect Push 2 / Push 3 display via WebUSB (Chrome)';
    button.style.cssText = 'font-size:0.6rem;padding:2px 6px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;cursor:pointer;';

    const status = document.createElement('span');
    status.id = 'push-webusb-display-status';
    status.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Push USB: ready';

    host.insertBefore(button, anchor);
    host.insertBefore(status, anchor);

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.textBaseline = 'top';

    function fallbackSnapshot() {
      const detect = document.getElementById('midi-detect');
      const detected = (detect?.textContent || '').replace(/\s+/g, ' ').trim();
      return { chord: detected, notes: [], shell: '', ust: '', tensions: '', key: '', scale: '', mode: '' };
    }

    function currentSnapshot() {
      try { return window.padWebGetPushDisplaySnapshot?.() || fallbackSnapshot(); }
      catch (_) { return fallbackSnapshot(); }
    }

    function drawPixelChar(char, x, y, scale, color) {
      const glyph = GLYPHS[char];
      if (!glyph) return;
      context.fillStyle = color;
      for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 7; row++) {
          if ((glyph[col] & (1 << row)) !== 0) {
            context.fillRect(x + col * scale, y + row * scale, scale, scale);
          }
        }
      }
    }

    function drawTriangle(x, y, scale, color) {
      context.fillStyle = color;
      const s = Math.max(1, scale);
      context.fillRect(x + 2*s, y, s, s);
      context.fillRect(x + s, y + 2*s, s, s);
      context.fillRect(x + 3*s, y + 2*s, s, s);
      context.fillRect(x, y + 4*s, 5*s, s);
    }

    function drawPixelText(raw, x, y, scale, color, maxChars = 64) {
      const text = String(raw || '').replaceAll('△', '△').slice(0, maxChars);
      let cursor = x;
      for (const char of text) {
        if (char === ' ') cursor += 4 * scale;
        else if (char === '△') {
          drawTriangle(cursor, y + scale, scale, color);
          cursor += 6 * scale;
        } else {
          drawPixelChar(char, cursor, y, scale, color);
          cursor += 6 * scale;
        }
      }
    }

    function drawUtf8Text(text, x, y, color, maxWidth = 420) {
      if (!text) return;
      context.fillStyle = color;
      context.font = '15px "M PLUS 1 Code", ui-monospace, monospace';
      let value = String(text);
      while (value && context.measureText(value).width > maxWidth) value = value.slice(0, -1);
      context.fillText(value, x, y);
    }

    function drawControlRow(labels, y, states) {
      labels.forEach((label, i) => {
        if (!label) return;
        const color = states && states[i] === true ? '#ffdb5c' : '#84c4d2';
        drawPixelText(label, 12 + i * 120, y, 1, color, 18);
      });
    }

    function compactScaleLines(scale) {
      const value = String(scale || '').trim();
      if (!value) return [];
      if (value === 'Major (Ionian)') return ['Major Scale'];
      if (value === 'Natural Minor (Aeolian)') return ['Natural Minor'];
      const paren = value.indexOf('(');
      if (paren > 0) return [value.slice(0, paren).trim(), value.slice(paren).trim()];
      if (value.length > 12) {
        const split = value.lastIndexOf(' ', 12);
        if (split > 0) return [value.slice(0, split).trim(), value.slice(split + 1).trim()];
      }
      return [value];
    }

    function drawKeyScale(snap) {
      if (snap.key) drawPixelText(snap.key, 742, 34, 2, '#ffdb5c', 8);
      const lines = compactScaleLines(snap.scale);
      if (lines.length >= 2) {
        const factor = lines[0].length <= 14 && lines[1].length <= 14 ? 2 : 1;
        drawPixelText(lines[0], 775, factor === 2 ? 29 : 31, factor, '#ffdb5c', 18);
        drawPixelText(lines[1], 775, factor === 2 ? 49 : 44, factor, '#ffdb5c', 18);
      } else if (lines.length === 1) {
        const factor = lines[0].length <= 14 ? 2 : 1;
        drawPixelText(lines[0], 775, factor === 2 ? 34 : 36, factor, '#ffdb5c', 18);
      }
    }

    function drawFrame() {
      const snap = currentSnapshot();
      context.fillStyle = '#0d1114';
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = '#e6a024';
      context.fillRect(0, 0, WIDTH, 5);
      context.fillStyle = '#449eb4';
      context.fillRect(0, HEIGHT - 5, WIDTH, 5);

      const entry = snap.chordEntry || null;
      const inputMode = snap.mode === 'input';
      const upper = entry ? entry.upper.labels : (inputMode
        ? ['', '', '', '', '', '', 'Key', 'Scale']
        : ['Root', 'Tasty', 'Stock', 'Guitar', 'Quality', 'Tension', 'Key', 'Scale']);
      const chordRow = snap.mode === 'chord' ? snap.chordLowerRow : null;
      const lower = entry ? entry.lower.labels : (chordRow ? chordRow.labels : ['Link', 'Guitar TAB', 'Bass TAB', 'Piano', 'Relative', 'Parallel', 'Secondary', 'Available']);
      const upperStates = entry ? entry.upper.states : (snap.mode === 'chord' ? window.padWebGetPushChordUpperDisplayStates?.() : null);
      drawControlRow(upper, 14, upperStates);
      drawControlRow(lower, 148, entry ? entry.lower.states : (chordRow && chordRow.states));
      drawKeyScale(snap);

      if (entry) {
        drawPixelText(entry.title, 32, 42, 3, '#ffdb5c', 24);
        drawPixelText(entry.detail, 36, 82, 2, '#ccdae0', 32);
        drawUtf8Text(entry.hint, 430, 112, '#84c4d2', 420);
      } else {
        if (snap.chord) {
          // Human ruling 2026-09-14: the equation is semantic information. Never
          // cut its right-hand side. Keep the full text and reduce scale only as
          // much as needed to stay left of the Key/Scale region (x=720).
          const headline = fitPushPixelText(snap.chord, 4, 688);
          drawPixelText(headline.text, 32, 42, headline.scale, '#ffdb5c', headline.text.length);
        }
        if (snap.notes?.length) drawPixelText(`NOTE: ${snap.notes.join(' ')}`, 36, 82, 1, '#ccdae0', 34);

        const detailX = 430;
        if (snap.ust) {
          const parts = String(snap.ust).split(' / ');
          drawPixelText(`UST ${parts[0]}`, detailX, 70, 2, '#ffdb5c', 34);
          if (parts.length > 1) drawPixelText(`/ ${parts.slice(1).join(' / ')}`, detailX, 88, 1, '#ffdb5c', 64);
        }
        if (snap.shell) drawUtf8Text(`Shell: ${snap.shell}`, detailX, 104, '#ccdae0');
        if (snap.tensions) drawUtf8Text(`Tension ${snap.tensions}`, detailX, 122, '#ffb848');
      }

      const modeLabel = snap.mode === 'scale' ? 'Scale' : snap.mode === 'chord' ? 'Chord' : snap.mode === 'input' ? 'Input' : snap.mode || '';
      if (modeLabel) drawPixelText(modeLabel, 870, 72, 1, '#ff6084', 8);

      return encodePushDisplayFrame(context.getImageData(0, 0, WIDTH, HEIGHT).data);
    }

    const supported = window.isSecureContext && Boolean(navigator.usb);
    const probe = new PushWebUsbDisplay(navigator.usb, drawFrame(), (state, text) => {
      status.textContent = text;
      status.title = text;
      button.title = text || 'Connect Push 2 / Push 3 display via WebUSB (Chrome)';
      button.disabled = state === 'connecting' || state === 'stopping' || state === 'blocked' || !supported;
      button.textContent = state === 'running' || state === 'recovering' ? 'Stop Push Display' : 'Push Display';
      button.dataset.state = state;
    });

    if (!supported) {
      button.disabled = true;
      status.textContent = 'WebUSB unavailable: use Chrome over HTTPS';
      button.title = status.textContent;
    }

    let cleanupStarted = false;
    button.addEventListener('click', async () => {
      const state = button.dataset.state;
      if (state === 'running' || state === 'recovering') await probe.stop();
      else {
        cleanupStarted = false;
        try { window.padWebResumePushSurface?.(); } catch (_) {}
        probe.setFrame(drawFrame());
        await probe.connect();
      }
    });

    const refreshFrame = () => {
      // Grid renders also occur while playing without a connected Push display.
      // Do not read/encode/copy a frame until the explicit display session is active.
      const state = button.dataset.state;
      if (state !== 'running' && state !== 'recovering') return;
      try { probe.setFrame(drawFrame()); } catch (_) {}
    };
    // Key/scale edits (including hardware controls) render the canonical pad
    // grid without necessarily changing MIDI detection or clicking a mode.
    // Observe that completed render too; the frame still reads the same snapshot.
    // One observer batches mutations, with no extra timer or USB connection.
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(refreshFrame);
      ['midi-detect', 'pad-grid'].forEach(id => {
        const target = document.getElementById(id);
        if (target) observer.observe(target, { childList: true, subtree: true, characterData: true });
      });
    }
    ['mode-scale', 'mode-chord', 'mode-input'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => setTimeout(refreshFrame, 0));
    });

    function cleanupPushSurface(message = 'Push display stopped. Surface cleared.') {
      if (cleanupStarted) return;
      cleanupStarted = true;
      const pushOutputs = window.padWebGetPushMidiOutputs?.() || [];
      try { window.padWebBeginPushShutdown?.(); } catch (_) {}
      // Desktop clears the visible pad paint first, then performs the exhaustive
      // sweep. Browser teardown is time-limited, so make those 64 zero-velocity
      // Note Ons the first hardware operation while the MIDI ports are alive.
      try { fastClearPushPads(pushOutputs); } catch (_) {}
      try { window.padWebResetPushMidiRuntimeState?.(); } catch (_) {}
      try { hardClearPushMidiOutputs(pushOutputs); } catch (_) {}
      try { void probe.stop(message); } catch (_) {}
    }

    // WebUSB display is opt-in and independent from automatic Web MIDI pad/CC ownership.
    // Do not intentionally stop merely because the tab becomes hidden: the Push display
    // needs its keepalive stream and visibility changes must not tear down a live session.
    // Actual page teardown still clears both transports best-effort.
    window.addEventListener('pagehide', () => cleanupPushSurface(), { capture: true });
    window.addEventListener('beforeunload', () => cleanupPushSurface(), { capture: true });
  }
}
