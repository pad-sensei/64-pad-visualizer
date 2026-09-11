from pathlib import Path

EXPECTED_PRODUCT_HEAD = '12f309daab50a52f8697cacabe92c3973429a4a6'
AUDIO_VERSION = '6.7.61'


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, got {count}: {old!r}')
    p.write_text(text.replace(old, new, 1))


# Parent-owned runtime version SSOT. The worklet loader already consumes window.APP_VERSION.
replace_once(
    'index.html',
    '<script>\nif (window.AUDIO_ENABLED) {',
    f"<script>\nwindow.APP_VERSION = '{AUDIO_VERSION}';\nif (window.AUDIO_ENABLED) {{",
)
replace_once(
    'index.html',
    "document.write('<script src=\"' + src + '?v=6.7.61\"><\\/script>');",
    "document.write('<script src=\"' + src + '?v=' + window.APP_VERSION + '\"><\\/script>');",
)

# Service-worker identity follows the actual runtime request identities.
replace_once(
    'sw.js',
    "var CACHE_NAME = '64pad-v180-preview-20260911-audio-sustain-1';",
    "var CACHE_NAME = '64pad-v180-preview-20260912-audio-sustain-2';",
)
replace_once(
    'sw.js',
    "'audio-core/epiano-worklet-processor.js?v=6.7.52',",
    f"'audio-core/epiano-worklet-processor.js?v={AUDIO_VERSION}',",
)
replace_once(
    'sw.js',
    "'audio-core/spring-reverb-processor.js?v=6.7.52',",
    "'audio-core/spring-reverb-processor.js',",
)

Path('tests/unit/audio-core-sustain-integration.test.js').write_text(r'''import { describe, it, expect } from 'vitest';
import fs from 'fs';

const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const workletEngine = fs.readFileSync('audio-core/epiano-worklet-engine.js', 'utf8');
const epianoEngine = fs.readFileSync('audio-core/epiano-engine.js', 'utf8');

function appVersion() {
  return index.match(/window\.APP_VERSION\s*=\s*'([\d.]+)'/)?.[1] || null;
}

function dynamicAudioScripts() {
  const block = index.match(/var _audioScripts = \[(.*?)\];/s)?.[1] || '';
  return [...block.matchAll(/'([^']+\.js)'/g)].map((m) => m[1]);
}

describe('audited audio-core sustain integration', () => {
  it('uses one parent-owned audio version for dynamic runtime requests', () => {
    const version = appVersion();
    expect(version).toBeTruthy();
    expect(index).toContain("document.write('<script src=\"' + src + '?v=' + window.APP_VERSION + '\"><\\/script>');");
    expect(index).not.toContain("document.write('<script src=\"' + src + '?v=6.7.52\'><\\/script>');");
  });

  it('pre-caches every dynamically injected audio script at the runtime version', () => {
    const version = appVersion();
    const scripts = dynamicAudioScripts();
    expect(version).toBeTruthy();
    expect(scripts.length).toBeGreaterThan(10);
    for (const src of scripts) {
      expect(sw, `missing precache identity for ${src}`).toContain(`'${src}?v=${version}'`);
    }
    expect(sw).not.toContain("'audio-core/audio-voice.js?v=6.7.52'");
  });

  it('aligns worklet processor precache identities with their actual runtime URLs', () => {
    const version = appVersion();
    expect(workletEngine).toContain("'epiano-worklet-processor.js?v=' + (window.APP_VERSION || Date.now())");
    expect(sw).toContain(`'audio-core/epiano-worklet-processor.js?v=${version}'`);

    // Spring reverb currently requests the processor with no query string; cache that exact URL.
    expect(epianoEngine).toContain("_scoreBase + 'spring-reverb-processor.js'");
    expect(sw).toContain("'audio-core/spring-reverb-processor.js'");
    expect(sw).not.toMatch(/audio-core\/spring-reverb-processor\.js\?v=/);
  });

  it('bumps the service-worker cache identity for this follow-up', () => {
    expect(sw).toContain("var CACHE_NAME = '64pad-v180-preview-20260912-audio-sustain-2';");
  });

  it('ships the permanent behavioral sustain regression test with the pinned dependency', () => {
    const smoke = fs.readFileSync('audio-core/tests/sustain-voice-smoke.cjs', 'utf8');
    expect(smoke).toContain('generic voice released while sustain was down');
    expect(smoke).toContain('retrigger left stale deferred release');
    expect(smoke).toContain('worklet NoteOff was incorrectly deferred in host');
    expect(smoke).toContain('defensive stale deferred voice was not released');
  });
});
''')

replace_once(
    'tests/unit/midi-runtime-bootstrap.test.js',
    "const audioVersion = index.match(/document\\.write\\('<script src=\"' \\+ src \\+ '\\?v=([\\d.]+)\"/)?.[1];",
    "const audioVersion = index.match(/window\\.APP_VERSION\\s*=\\s*'([\\d.]+)'/)?.[1];",
)
