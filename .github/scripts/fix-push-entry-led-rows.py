from pathlib import Path

p = Path('push-web-control.js')
s = p.read_text()
old = """  function lowerButtonStates() {
    if (performBankContext()) return [false, false, false, false, false, false, null, null];
    var app = global.AppState || {};
    return [
      domButtonActive('inst-toggle-link', global.linkMode),
      domButtonActive('inst-toggle-guitar', global.showGuitar),
      domButtonActive('inst-toggle-bass', global.showBass),
      domButtonActive('inst-toggle-piano', global.showPiano),
      !!app.showMinorVariants,
      !!app.showParallelKey,
      !!app.showSecDom,
      !!app.showParentScales,
    ];
  }
"""
new = """  function lowerButtonStates() {
    if (controlState.entryStep) {
      var list = controlState.entryStep === 'root' ? new Array(12).fill(true) : qualityList().map(function() { return true; });
      var activeIndex = controlState.entryStep === 'root'
        ? (controlState.entryRoot === null || controlState.entryRoot === undefined ? -1 : controlState.entryRoot)
        : controlState.entryQualityIndex;
      return new Array(8).fill(null).map(function(_, i) {
        var index = 8 + i;
        if (index >= list.length) return null;
        return index === activeIndex;
      });
    }
    if (performBankContext()) return [false, false, false, false, false, false, null, null];
    var app = global.AppState || {};
    return [
      domButtonActive('inst-toggle-link', global.linkMode),
      domButtonActive('inst-toggle-guitar', global.showGuitar),
      domButtonActive('inst-toggle-bass', global.showBass),
      domButtonActive('inst-toggle-piano', global.showPiano),
      !!app.showMinorVariants,
      !!app.showParallelKey,
      !!app.showSecDom,
      !!app.showParentScales,
    ];
  }
"""
if old not in s:
    raise SystemExit('lowerButtonStates anchor missing')
p.write_text(s.replace(old, new, 1))

p = Path('tests/unit/push-web-control.test.js')
s = p.read_text()
anchor = """  it('lights Input/Perform navigation and C-fixed state from screen truth', () => {
"""
test = """  it('uses both display rows for root-entry LED choices', () => {
    const calls = [];
    globalThis.AppState = { mode: 'chord', scaleIdx: 0, padCFixed: false };
    globalThis.SCALES = [{ name: 'Major' }];
    globalThis.localStorage = { getItem: () => '{}' };
    globalThis.BUILDER_QUALITIES = [];
    globalThis.padWebSendPushButtonLed = (cc, state, palette) => calls.push([cc, state, palette]);

    globalThis.padWebPushControlState.entryStep = 'root';
    globalThis.padWebPushControlState.entryRoot = 10;
    resetButtonLedState();
    syncButtonLeds();

    expect(calls).toContainEqual([20, 'white-weak', true]); // root index 8 assigned on lower row
    expect(calls).toContainEqual([21, 'white-weak', true]); // root index 9 assigned on lower row
    expect(calls).toContainEqual([22, 'weak', true]);       // selected root index 10
    expect(calls).toContainEqual([23, 'white-weak', true]); // root index 11 assigned
    expect(calls).toContainEqual([24, 'off', true]);        // no root index 12

    globalThis.padWebPushControlState.entryStep = null;
    globalThis.padWebPushControlState.entryRoot = null;
  });

"""
if anchor not in s:
    raise SystemExit('test insertion anchor missing')
p.write_text(s.replace(anchor, test + anchor, 1))
