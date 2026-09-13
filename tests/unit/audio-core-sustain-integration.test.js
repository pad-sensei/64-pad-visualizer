import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { execFileSync } from 'child_process';

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

  it('aligns FDTD runtime fetch identities with the service-worker precache', () => {
    const version = appVersion();
    expect(workletEngine).toContain("fetch(basePath + 'attack_tables.bin?v=' + (window.APP_VERSION || Date.now()))");
    expect(workletEngine).toContain("fetch(basePath + 'manifest.json?v=' + (window.APP_VERSION || Date.now()))");
    expect(sw).toContain(`'audio-core/assets/fdtd/attack_tables.bin?v=${version}'`);
    expect(sw).toContain(`'audio-core/assets/fdtd/manifest.json?v=${version}'`);
    expect(sw).not.toContain("'audio-core/assets/fdtd/attack_tables.bin',");
    expect(sw).not.toContain("'audio-core/assets/fdtd/manifest.json',");
  });

  it('keeps a cache identity newer than the pre-FDTD integration shell', () => {
    const cacheName = sw.match(/var CACHE_NAME = '([^']+)'/)?.[1] || null;
    expect(cacheName).toBeTruthy();
    expect(cacheName).not.toBe('64pad-v180-preview-20260912-audio-sustain-2');
  });

  it('ships the permanent behavioral sustain regression test with the pinned dependency', () => {
    const smoke = fs.readFileSync('audio-core/tests/sustain-voice-smoke.cjs', 'utf8');
    expect(smoke).toContain('generic voice released while sustain was down');
    expect(smoke).toContain('retrigger left stale deferred release');
    expect(smoke).toContain('worklet NoteOff was incorrectly deferred in host');
    expect(smoke).toContain('defensive stale deferred voice was not released');
  });

  it('preserves CC64 and first-note NoteOff ordering across async worklet bootstrap', () => {
    const smokePath = 'audio-core/tests/worklet-sustain-bootstrap-smoke.cjs';
    const smoke = fs.readFileSync(smokePath, 'utf8');
    expect(workletEngine).toContain('var _epw_sustainOn = false');
    expect(workletEngine).toContain("_epw_node.port.postMessage({ type: 'sustain', on: _epw_sustainOn });");
    expect(smoke).toContain('sticky sustain was not replayed after worklet creation');
    expect(smoke).toContain('deferred first-note NoteOff was lost during worklet bootstrap');

    const output = execFileSync(process.execPath, [smokePath], { encoding: 'utf8' });
    expect(output).toContain('worklet sustain bootstrap smoke: PASS');
  });
});
