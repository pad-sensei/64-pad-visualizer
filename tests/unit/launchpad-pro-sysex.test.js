import { describe, expect, it } from 'vitest';
import { LAUNCHPAD_MODELS } from '../../launchpad-adapter.js';

describe('Launchpad Pro MK3 Programmer mode SysEx', () => {
  it('uses the dedicated Programmer/Live toggle for entry and exit', () => {
    const config = LAUNCHPAD_MODELS['launchpad-pro-mk3'];
    expect(config.programmerModeMessage).toEqual([
      0xF0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, 0x01, 0xF7,
    ]);
    expect(config.programmerExitMessage).toEqual([
      0xF0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, 0x00, 0xF7,
    ]);
  });
});
