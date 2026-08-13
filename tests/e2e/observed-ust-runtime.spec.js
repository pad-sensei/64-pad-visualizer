import { test, expect } from '@playwright/test';

function pushSource(mappedMidi, row, col, physicalPadId) {
  return {
    deviceId: 'push-3',
    sourceId: `push-3:${physicalPadId}`,
    rawNote: 36 + row * 8 + col,
    mappedMidi,
    row,
    col,
    physicalPadId,
    positionConfidence: 'exact',
  };
}

test.describe('v1.7 observed Shell/UST browser runtime', () => {
  test('publishes actual detected dim7 tensions without inventing an upper 13', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    const result = await page.evaluate(() => {
      [48, 51, 54, 57, 65].forEach(note => midiActiveNotes.add(note));
      updateMidiDisplay();
      const single11 = { text: document.getElementById('midi-detect').textContent, payload: padWebGetLatestObservedShellUstPayload() };
      midiActiveNotes.clear();
      [48, 51, 54, 57, 62, 65].forEach(note => midiActiveNotes.add(note));
      updateMidiDisplay();
      return { single11, double911: { text: document.getElementById('midi-detect').textContent, payload: padWebGetLatestObservedShellUstPayload() } };
    });
    expect(result.single11.text).toContain('Cdim7(11)');
    expect(result.single11.payload.tensions).toEqual([{ label: '11', interval: 17 }]);
    expect(result.double911.text).toContain('Cdim7(9,11)');
    expect(result.double911.payload.tensions).toEqual([{ label: '9', interval: 14 }, { label: '11', interval: 17 }]);
    expect(JSON.stringify(result)).not.toContain('"13"');
  });

  test('publishes typed dim7 compound register from the core builder API', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    const result = await page.evaluate(() => {
      setMode('chord');
      applyParsedChordToBuilder(padParseChordName('Cdim7(11,13)'));
      updateChordDisplay();
      return { name: getBuilderChordName(), payload: padWebGetLatestObservedShellUstPayload() };
    });
    expect(result.name).toBe('Cdim7(11,13)');
    expect(result.payload.tensions).toEqual([{ label: '11', interval: 17 }, { label: '13', interval: 21 }]);
    expect(result.payload.register).toEqual({ explicit: true, intervals: [21] });
  });

  test('publishes clicked dim7 compound selection once from the same core payload', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    const result = await page.evaluate(() => {
      setMode('chord');
      applyParsedChordToBuilder(padParseChordName('Cdim7'));
      const button = [...document.querySelectorAll('#tension-grid .tension-btn')]
        .find(element => element._tension && element._tension.tensionLabels.join(',') === '11,13');
      const original = window.padBuildChordPayload;
      let calls = 0;
      window.padBuildChordPayload = function() { calls += 1; return original.apply(this, arguments); };
      selectTension(button._tension, button);
      window.padBuildChordPayload = original;
      return { calls, name: getBuilderChordName(), payload: padWebGetLatestObservedShellUstPayload() };
    });
    expect(result.calls).toBe(1);
    expect(result.name).toBe('Cdim7(11,13)');
    expect(result.payload.tensions).toEqual([{ label: '11', interval: 17 }, { label: '13', interval: 21 }]);
    expect(result.payload.register).toEqual({ explicit: true, intervals: [21] });
  });

  test('keeps legacy triadic UST visible in the MIDI DOM', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    const text = await page.evaluate(() => {
      [48, 51, 58, 62, 65, 69].forEach(note => midiActiveNotes.add(note));
      updateMidiDisplay();
      return document.getElementById('midi-detect').textContent;
    });
    expect(text).toContain('Dm (II) [9,11,13]');
    expect(text).toContain('Cm7');
  });

  test('physical upper F-Bb-Eb over Cm7 renders Q4 and not a shell-borrowed Q1', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');

    const sources = [
      pushSource(48, 0, 0, 'shell-c'),
      pushSource(51, 0, 3, 'shell-eb'),
      pushSource(58, 1, 5, 'shell-bb'),
      pushSource(65, 3, 2, 'upper-f'),
      pushSource(70, 4, 2, 'upper-bb'),
      pushSource(75, 5, 2, 'upper-eb'),
    ];

    const result = await page.evaluate((heldSources) => ({
      observedApi: typeof padAnalyzeObservedShellUst,
      consumerApi: typeof padWebFormatObservedUstInlineHtml,
      payloadApi: typeof padBuildObservedShellUstPayload,
      installed: window.__padObservedUstFormatterInstalled === true,
      html: formatDetectedUstInlineHtml(
        heldSources.map(source => source.mappedMidi),
        0,
        'Cm7(11)',
        heldSources
      ),
      payload: padBuildObservedShellUstPayload({
        chord: { rootPC: 0, quality: 'm7', name: 'Cm7' }, sourceNotes: heldSources,
      }),
    }), sources);

    expect(result.observedApi).toBe('function');
    expect(result.consumerApi).toBe('function');
    expect(result.payloadApi).toBe('function');
    expect(result.installed).toBe(true);
    expect(result.html).toContain('Q4');
    expect(result.html).toContain('11,b7,m3');
    expect(result.html).toContain('Cm7');
    expect(result.html).not.toContain('Q1');
    expect(JSON.parse(JSON.stringify(result.payload))).toEqual(result.payload);
    expect(result.payload).toMatchObject({
      schema: 'pad-observed-shell-ust', version: 1, sourceConfidence: 'exact',
      shell: { degrees: ['R', 'm3', 'b7'] },
      ust: { name: 'Q4', degrees: ['11', 'b7', 'm3'] },
    });

    const visible = await page.evaluate((heldSources) => {
      heldSources.forEach(source => onMidiNoteOn(source.mappedMidi, 100, source));
      updateMidiDisplay();
      return {
        text: document.getElementById('midi-detect').textContent,
        payload: window.padWebGetLatestObservedShellUstPayload(),
      };
    }, sources);
    expect(visible.text).toContain('Chord: Cm7');
    expect(visible.text).toContain('Shell');
    expect(visible.text).toContain('UST: Q4');
    expect(visible.text).not.toContain('Q1');
    expect(visible.payload).toMatchObject({
      schema: result.payload.schema,
      version: result.payload.version,
      shell: { degrees: result.payload.shell.degrees },
      ust: { name: 'Q4', degrees: result.payload.ust.degrees },
    });

    const singlePayload = await page.evaluate(() => {
      const original = window.padBuildObservedShellUstPayload;
      let calls = 0;
      window.padBuildObservedShellUstPayload = function(input) {
        calls += 1;
        return original(input);
      };
      updateMidiDisplay();
      window.padBuildObservedShellUstPayload = original;
      return calls;
    });
    expect(singlePayload).toBe(1);

    const localized = await page.evaluate(() => {
      I18N.setLang('ja');
      return document.getElementById('midi-detect').textContent;
    });
    expect(localized).toContain('シェル');
    expect(localized).toContain('UST: Q4');

    const escaped = await page.evaluate(() => {
      const output = padWebFormatObservedStructureHtml({
        available: true,
        chord: { name: '<img src=x onerror=alert(1)>' },
        shell: { degrees: ['<b>R</b>'] },
        ust: { name: '<svg/onload=alert(1)>', degrees: ['<i>11</i>'] },
      });
      document.getElementById('midi-detect').innerHTML = output;
      return {
        html: document.getElementById('midi-detect').innerHTML,
        images: document.querySelectorAll('#midi-detect img, #midi-detect svg').length,
      };
    });
    expect(escaped.images).toBe(0);
    expect(escaped.html).toContain('&lt;img');

    const clearedPayload = await page.evaluate(() => {
      midiActiveNotes.clear();
      updateMidiDisplay();
      return window.padWebGetLatestObservedShellUstPayload();
    });
    expect(clearedPayload).toBeNull();
    expect(pageErrors.filter(message => /padAnalyzeObservedShellUst|padWebFormatObservedUstInlineHtml/.test(message))).toEqual([]);
  });
});
