import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');

function read(name) {
  return readFileSync(resolve(ROOT, name), 'utf8');
}

describe('display toggle shortcuts', () => {
  it('routes Cmd+Option+D to Secondary Dominant', () => {
    const main = read('main.js');
    expect(main).toMatch(/if \(cmdOptCode === 'KeyD'\) \{ toggleSecDom\(\); return true; \}/);
  });

  it('does not reuse the same Cmd+Option physical key in the handler', () => {
    const main = read('main.js');
    const start = main.indexOf('function handleCmdOptionShortcutCode');
    const end = main.indexOf('document.addEventListener', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const block = main.slice(start, end);
    const codes = [...block.matchAll(/cmdOptCode === '([^']+)'/g)].map((m) => m[1]);
    expect(codes).toContain('KeyD');
    expect(codes).toContain('KeyJ');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps visible shortcut titles unique for display toggles', () => {
    const html = read('index.html');
    const titles = [...html.matchAll(/title="(⌘⌥[A-Z])"/g)].map((m) => m[1]);
    const duplicates = titles.filter((value, index) => titles.indexOf(value) !== index);
    expect(duplicates).toEqual([]);
  });

  it('documents T/SD/D on the non-conflicting J shortcut', () => {
    expect(read('index.html')).toContain('id="ext-fn-btn" onclick="toggleHarmonicFn()" title="⌘⌥J"');
    expect(read('lang-ja.js')).toContain('T/SD/D — ダイアトニックコードをトニック・サブドミナント・ドミナントの機能別に色分けします [⌘⌥J]');
    expect(read('lang-en.js')).toContain('T/SD/D \\u2014 Color diatonic chords by harmonic function: Tonic, Subdominant, Dominant [\\u2318\\u2325J]');
  });
});
