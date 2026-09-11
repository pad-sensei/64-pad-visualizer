from pathlib import Path

AUDIO_VERSION_OLD = '6.7.52'
AUDIO_VERSION_NEW = '6.7.61'


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{label} anchor missing in {path}')
    p.write_text(text.replace(old, new, 1))


# The runtime injects the complete audio script set through one shared version.
# Advancing the audio-core gitlink without changing this token can leave the old
# audio-voice.js alive behind the production Service Worker cache.
replace_once(
    'index.html',
    "document.write('<script src=\"' + src + '?v=6.7.52\"><\\/script>');",
    "document.write('<script src=\"' + src + '?v=6.7.61\"><\\/script>');",
    'audio script cache-bust',
)

sw = Path('sw.js')
text = sw.read_text()
old_cache = "var CACHE_NAME = '64pad-v180-preview-20260911-pedal-default-1';"
new_cache = "var CACHE_NAME = '64pad-v180-preview-20260911-audio-sustain-1';"
if old_cache not in text:
    raise SystemExit('service-worker cache anchor missing')
text = text.replace(old_cache, new_cache, 1)

assets = [
    'host-adapter.js',
    'audio-core/epiano-engine.js',
    'audio-core/epiano-worklet-engine.js',
    'audio-core/audio-master.js',
    'audio-core/audio-effects.js',
    'audio-core/audio-reverb.js',
    'audio-core/audio-sampler.js',
    'audio-core/audio-engines.js',
    'audio-core/audio-persistence.js',
    'audio-core/audio-overlay.js',
    'audio-core/audio-voice.js',
    'audio-core/audio.js',
    'master-tail.js',
    'audio-ui-binding.js',
]
for asset in assets:
    old = f"'{asset}?v={AUDIO_VERSION_OLD}'"
    new = f"'{asset}?v={AUDIO_VERSION_NEW}'"
    if old not in text:
        raise SystemExit(f'SW audio asset anchor missing: {old}')
    text = text.replace(old, new, 1)
sw.write_text(text)

Path('tests/unit/audio-core-sustain-integration.test.js').write_text(r'''import { describe, it, expect } from 'vitest';
import fs from 'fs';

const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

describe('audited audio-core sustain integration', () => {
  it('cache-busts the dynamically injected audio script set', () => {
    expect(index).toContain("document.write('<script src=\"' + src + '?v=6.7.61\"><\\/script>');");
    expect(index).not.toContain("document.write('<script src=\"' + src + '?v=6.7.52\'><\\/script>');");
  });

  it('pre-caches the exact new audio identity and retires the old voice asset identity', () => {
    expect(sw).toContain("var CACHE_NAME = '64pad-v180-preview-20260911-audio-sustain-1';");
    expect(sw).toContain("'audio-core/audio-voice.js?v=6.7.61'");
    expect(sw).toContain("'audio-core/audio-sampler.js?v=6.7.61'");
    expect(sw).toContain("'audio-core/epiano-worklet-engine.js?v=6.7.61'");
    expect(sw).toContain("'host-adapter.js?v=6.7.61'");
    expect(sw).toContain("'master-tail.js?v=6.7.61'");
    expect(sw).toContain("'audio-ui-binding.js?v=6.7.61'");
    expect(sw).not.toContain("'audio-core/audio-voice.js?v=6.7.52'");
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
