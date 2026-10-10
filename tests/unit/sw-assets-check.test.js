import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../tools/sw-assets-check.sh', import.meta.url));

function command(cwd, tool, args = [], env = {}) {
  return spawnSync(tool, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), '64pad-sw-guard-'));
  mkdirSync(join(root, 'tools'));
  copyFileSync(script, join(root, 'tools/sw-assets-check.sh'));
  writeFileSync(join(root, 'index.html'), '<script src="app.js?v=1.8.1-foo1"></script>\n');
  writeFileSync(join(root, 'sw.js'), "const ASSETS = ['app.js?v=1.8.1-foo1'];\n");
  writeFileSync(join(root, 'app.js'), 'console.log("one");\n');
  for (const args of [
    ['init', '-q'],
    ['config', 'user.name', 'Test'],
    ['config', 'user.email', 'test@example.invalid'],
    ['add', '.'],
    ['commit', '-qm', 'baseline'],
  ]) {
    const result = command(root, 'git', args);
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  }
  return root;
}

function check(root) {
  return command(root, 'bash', [join(root, 'tools/sw-assets-check.sh')], {
    SW_ASSETS_BASE_REF: 'HEAD',
  });
}

describe('Service Worker asset guard', () => {
  it('recognizes alphanumeric asset tags and rejects an empty asset match', () => {
    const root = makeFixture();
    try {
      expect(check(root).status).toBe(0);
      writeFileSync(join(root, 'index.html'), '<script src="app.js"></script>\n');
      const empty = check(root);
      expect(empty.status).not.toBe(0);
      expect(empty.stderr).toContain('No versioned JS/CSS assets');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects source changes without a version bump, and accepts a synchronized bump', () => {
    const root = makeFixture();
    try {
      writeFileSync(join(root, 'app.js'), 'console.log("two");\n');
      const stale = check(root);
      expect(stale.status).not.toBe(0);
      expect(stale.stderr).toContain('Asset bytes changed without a matching');
      writeFileSync(join(root, 'index.html'), '<script src="app.js?v=1.8.1-foo2"></script>\n');
      writeFileSync(join(root, 'sw.js'), "const ASSETS = ['app.js?v=1.8.1-foo2'];\n");
      expect(check(root).status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a new index version missing from Service Worker precache', () => {
    const root = makeFixture();
    try {
      writeFileSync(join(root, 'index.html'), '<script src="app.js?v=1.8.1-foo2"></script>\n');
      const missing = check(root);
      expect(missing.status).not.toBe(0);
      expect(missing.stdout).toContain('ASSETS DRIFT DETECTED');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
