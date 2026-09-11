(function(global) {
  'use strict';

  function createState() {
    return {
      shiftHeld: false,
      setupHeld: false,
      lastOctaveCC: -1,
      lastOctaveMs: -Infinity,
    };
  }

  function relativeDelta(value) {
    value = value | 0;
    if (value === 0) return 0;
    return value > 64 ? value - 128 : value;
  }

  function event(code, value) {
    return { code: code | 0, value: value | 0 };
  }

  // Mirrors the native Standalone mapping in PluginProcessor.cpp.
  // Returns { handled, events, performancePass }.
  // `handled` means the raw Push CC must not fall through as a UI/control CC.
  // `performancePass` is reserved for CC1/CC64/CC74 performance-expression paths.
  function mapPushCc(cc, value, context, state) {
    cc = cc | 0;
    value = value | 0;
    context = context || {};
    state = state || createState();
    var events = [];

    // Damper is performance MIDI, never a Push UI control.
    if (cc === 64) return { handled: false, events: events, performancePass: true, state: state };

    var inputName = String(context.inputName || '');
    var isUserPort = /user port/i.test(inputName);

    // The supported Push generations use the same generation-neutral Live/User
    // port authority contract here. Push 3 has direct evidence; Push 2 browser behavior
    // remains an explicit external Human Gate before the two-generation claim is final.
    if (isUserPort && cc !== 74 && cc !== 1 && cc !== 54 && cc !== 55) {
      return { handled: true, events: events, performancePass: false, state: state };
    }

    // Prevent pad-expression traffic from being interpreted as relative encoders.
    if (context.padIsHeld && cc >= 70 && cc <= 78
        && !(context.padPlaybackBlocked && cc === 70)) {
      return { handled: true, events: events, performancePass: false, state: state };
    }

    if ((cc === 54 || cc === 55) && value === 127) {
      var nowMs = Number.isFinite(context.nowMs) ? context.nowMs : Date.now();
      // 180 ms intentionally matches native Standalone parity (legacy Web path used 100 ms).
      if (!(cc === state.lastOctaveCC && (nowMs - state.lastOctaveMs) < 180)) {
        state.lastOctaveCC = cc;
        state.lastOctaveMs = nowMs;
        events.push(event(46, cc === 55 ? 1 : -1));
      }
      return { handled: true, events: events, performancePass: false, state: state };
    }

    if (cc === 118) {
      events.push(event(40, value === 0 ? 0 : 1));
      return { handled: true, events: events, performancePass: false, state: state };
    }
    if (cc === 88) {
      events.push(event(49, value === 0 ? 0 : 1));
      return { handled: true, events: events, performancePass: false, state: state };
    }
    if (cc === 49) {
      state.shiftHeld = value !== 0;
      return { handled: true, events: events, performancePass: false, state: state };
    }
    if (cc === 30) {
      if (value !== 0) {
        if (!state.setupHeld) {
          state.setupHeld = true;
          events.push(event(70, 0));
        }
      } else {
        state.setupHeld = false;
      }
      return { handled: true, events: events, performancePass: false, state: state };
    }
    if (cc === 33) {
      if (value === 0) events.push(event(74, 0));
      return { handled: true, events: events, performancePass: false, state: state };
    }
    if ((cc === 91 || cc === 94) && value !== 0) {
      events.push(event(34, 0));
      return { handled: true, events: events, performancePass: false, state: state };
    }
    if (cc === 119 && value !== 0) {
      events.push(event(41, state.shiftHeld ? 1 : 0));
      return { handled: true, events: events, performancePass: false, state: state };
    }

    if (value === 127) {
      if (cc === 58) events.push(event(1, 0));
      else if (cc === 31) events.push(event(47, 0));
      else if (cc === 32) events.push(event(75, 0));
      else if (cc === 85) events.push(event(42, 0));
      else if (cc === 86) events.push(event(3, 0));
      else if (cc === 82) events.push(event(48, 0));
      else if (cc === 65) events.push(event(44, 0));
      else if (cc === 81) events.push(event(45, 0));
      else if (cc === 80) events.push(event(71, 0));
      else if (cc === 83) events.push(event(72, 0));
      else if (cc === 110) events.push(event(73, 0));
      else if (cc === 46) events.push(event(43, 1));
      else if (cc === 47) events.push(event(43, -1));
      else if (cc === 44) events.push(event(35, -1));
      else if (cc === 45) events.push(event(35, 1));
      else if (cc === 62) events.push(event(36, -1));
      else if (cc === 63) events.push(event(36, 1));
      else if (cc === 93) events.push(event(33, 1));
      else if (cc === 95) events.push(event(33, -1));
      else if (cc >= 102 && cc <= 109) events.push(event(21, cc - 102));
      else if (cc >= 20 && cc <= 27) events.push(event(20, cc - 20));
      if (events.length) return { handled: true, events: events, performancePass: false, state: state };
    }

    var delta = relativeDelta(value);
    if (delta !== 0) {
      if (cc === 70) {
        events.push(event(30, delta));
        return { handled: true, events: events, performancePass: false, state: state };
      }
      if (cc >= 71 && cc <= 78) {
        if (!(context.mpeMode && cc === 74)) {
          events.push(event(50 + (cc - 71), delta));
          return { handled: true, events: events, performancePass: false, state: state };
        }
      }
    }

    if (cc === 74 || cc === 1) {
      return { handled: false, events: events, performancePass: true, state: state };
    }

    // Native Standalone blocks every other Push-internal CC.
    return { handled: true, events: events, performancePass: false, state: state };
  }

  global.padWebCreatePushCcState = createState;
  global.padWebPushRelativeDelta = relativeDelta;
  global.padWebMapPushCc = mapPushCc;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createState, relativeDelta, mapPushCc };
  }
})(typeof window !== 'undefined' ? window : globalThis);
