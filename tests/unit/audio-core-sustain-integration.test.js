import { describe, it, expect } from 'vitest';
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
