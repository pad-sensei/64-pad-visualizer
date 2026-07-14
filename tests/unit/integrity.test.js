import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');

describe('Sound engine integrity', () => {
  it('audio layer contains WebAudioFont engine + noteOn/noteOff', () => {
    // Phase 0.1 split audio.js into focused modules, Phase 1.1 moved them
    // into the pad-audio-core submodule at audio-core/. noteOn/noteOff
    // live in audio-voice.js; the WebAudioFont lifecycle in audio.js.
    const audioJs = readFileSync(resolve(ROOT, 'audio-core/audio.js'), 'utf-8');
    const audioVoice = readFileSync(resolve(ROOT, 'audio-core/audio-voice.js'), 'utf-8');
    const combined = audioJs + '\n' + audioVoice;
    expect(combined.length).toBeGreaterThan(10000);
    expect(audioJs).toContain('WebAudioFontPlayer');
    expect(audioVoice).toContain('function noteOn');
    expect(audioVoice).toContain('function noteOff');
    expect(audioJs).toContain('audioCtx');
    // no-op stub detection
    expect(audioVoice).not.toMatch(/function noteOn\s*\([^)]*\)\s*\{\s*\}/);
    expect(audioVoice).not.toMatch(/function noteOff\s*\([^)]*\)\s*\{\s*\}/);
  });

  it('jrhodes3c-samples.js exists (>1MB) — kept for MRC/DAW reuse', () => {
    const p = resolve(ROOT, 'jrhodes3c-samples.js');
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(1_000_000);
  });

  it('index.html contains sound controls', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');
    expect(html).toContain('id="sound-controls"');
    expect(html).toContain('id="organ-preset"');
  });

  it('No Desktop/JUCE references in web code', () => {
    // Phase 1.1 moved the audio-*.js shards into the audio-core submodule.
    // Walk both the 64PE root (for audio-ui-binding.js + the rest) and
    // the submodule directory so the desktop-purity check still covers
    // the whole audio layer.
    const files = ['audio-ui-binding.js',
                   'render.js', 'builder.js', 'data.js',
                   'theory.js', 'tasty-stock.js', 'staff.js', 'instruments.js',
                   'circle-ui.js', 'parent-scales-ui.js', 'play-controls.js',
                   'plain.js', 'perform.js', 'main.js',
                   'audio-core/audio.js', 'audio-core/audio-master.js',
                   'audio-core/audio-effects.js', 'audio-core/audio-reverb.js',
                   'audio-core/audio-sampler.js', 'audio-core/audio-engines.js',
                   'audio-core/audio-persistence.js', 'audio-core/audio-overlay.js',
                   'audio-core/audio-voice.js',
                   'audio-core/epiano-engine.js', 'audio-core/epiano-worklet-engine.js',
                   'audio-core/epiano-worklet-processor.js',
                   'audio-core/spring-reverb-processor.js'];
    for (const f of files) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      const content = readFileSync(p, 'utf-8');
      expect(content).not.toContain('__JUCE__');
      expect(content).not.toContain('_isDesktop');
      expect(content).not.toContain('_useNativeAudio');
    }
  });
});

describe('Repository portability', () => {
  const portableFiles = [
    '.claude/launch.json',
    'tools/gemini_tine_chart.py',
    'tools/extract_tine_lengths.py',
    'tools/auto_update_banner.sh',
    'experimental/wurlitzer-preset.md',
    'experimental/twin-amp-preset.md',
  ];
  const maintainerHome = ['', 'Users', 'nozakidaikai'].join('/');

  it('does not publish maintainer-specific absolute paths', () => {
    for (const file of portableFiles) {
      const content = readFileSync(resolve(ROOT, file), 'utf-8');
      expect(content, file).not.toContain(maintainerHome);
    }
  });

  it('does not publish obsolete internal handoffs', () => {
    expect(existsSync(resolve(ROOT, 'HANDOVER.md'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'TUTORIAL_HANDOFF.md'))).toBe(false);
  });

  it('keeps local tool inputs configurable', () => {
    for (const file of ['tools/gemini_tine_chart.py', 'tools/extract_tine_lengths.py']) {
      expect(readFileSync(resolve(ROOT, file), 'utf-8'), file).toContain('TINE_CHART_IMAGE');
    }
    const bannerScript = readFileSync(resolve(ROOT, 'tools/auto_update_banner.sh'), 'utf-8');
    expect(bannerScript).toContain('REPO="${REPO:-');
    expect(bannerScript).toContain('LOG_DIR="${LOG_DIR:-');
  });
});
