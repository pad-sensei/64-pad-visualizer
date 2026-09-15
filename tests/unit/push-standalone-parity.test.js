import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// The Node suite replaces spy-only tests. Fail closed if cases disappear or
// stop executing: '# fail 0' alone also accepts an empty/skipped suite.
const requiredTotals = { tests: 18, pass: 18, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
function expectCompleteParityRun(output) {
  for (const [key, value] of Object.entries(requiredTotals)) {
    expect(output, `Standalone parity TAP total: ${key}`).toMatch(
      new RegExp(`^# ${key} ${value}\\r?$`, 'm'),
    );
  }
}

it('executes all 18 real classic-script Standalone gesture and MIDI-to-audio regressions', () => {
  const output = execFileSync(process.execPath, [path.resolve('tests/push-standalone-parity.cjs')], {
    encoding: 'utf8', timeout: 30000,
  });
  expectCompleteParityRun(output);
});

it('rejects empty, shortened, skipped or incomplete parity runs even with zero failures', () => {
  const complete = Object.entries(requiredTotals).map(([key, value]) => `# ${key} ${value}`).join('\n');
  expectCompleteParityRun(complete);
  expectCompleteParityRun(complete.replace(/\n/g, '\r\n'));
  for (const incomplete of [
    '',
    '# tests 0\n# pass 0\n# fail 0',
    complete.replace('# tests 18', '# tests 17').replace('# pass 18', '# pass 17'),
    complete.replace('# pass 18', '# pass 17').replace('# skipped 0', '# skipped 1'),
    complete.replace('# cancelled 0', '# cancelled 1'),
    complete.replace('# todo 0', '# todo 1'),
    complete.replace('# fail 0', '# fail 1'),
    complete.replace('# pass 18', '# pass 180'),
    complete.replace('# tests 18', 'diagnostic: # tests 18'),
  ]) {
    expect(() => expectCompleteParityRun(incomplete)).toThrow();
  }
});
