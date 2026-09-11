import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

it('executes the real classic-script Standalone gesture and MIDI-to-audio regressions', () => {
  const output = execFileSync(process.execPath, [path.resolve('tests/push-standalone-parity.cjs')], {
    encoding: 'utf8', timeout: 30000,
  });
  expect(output).toContain('# fail 0');
});
