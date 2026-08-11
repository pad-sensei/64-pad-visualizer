# Codex task — 64Pad Explorer update notification

Temporary handoff for the local Codex working this Draft PR. **Delete this file before marking the PR Ready for review.**

## Read first

- `CLAUDE.md`
- `64-pad-explorer-update.js`
- recent release-notice commit `4235990d8511f90ecc540db103cd5d1bade41259`
- product dependencies:
  - `pad-sensei/64-pad-explorer-desktop#11` — Push LED stability / Reset-free relaunch recovery, Hardware Gate PASS
  - `pad-sensei/64-pad-explorer-desktop#12` — generic MIDI→WebView stability, not yet released
  - `pad-sensei/64-pad-visualizer#3` — register-separated shell + quartal UST, not yet released

Do not copy private Vault material into this public repository.

## Goal

Prepare the in-app update notice for the next 64Pad Explorer release that contains the relevant merged product changes.

### Confirmed user-facing improvement already evidenced

Desktop PR #11:

- Push pad LEDs stayed stable during extended real use.
- Force-quit could leave stale hardware LEDs, but relaunch restored pad/button state without `Settings > Reset`.
- Manual Reset remains emergency recovery rather than normal operation.

### Pending improvements

Only include these if their implementation PRs are merged into the release being announced:

- generic MIDI input stability from desktop #12;
- register-separated UST display from visualizer #3.

For UST, intended message is educational, not implementation-oriented: when a voicing clearly has a low shell and an independent upper quartal stack, 64Pad Explorer distinguishes the upper structure from the shell. Do not announce this until the exact UI text/behavior is implemented and verified.

## Files / release mechanics

Primary file: `64-pad-explorer-update.js`.

Follow the existing schema and the established release-notice pattern. Determine the actual next Desktop/Web version from source/release state; **do not invent or pre-bump a version**.

If changing Web assets requires cache version synchronization, follow `CLAUDE.md`: `index.html` and `sw.js` versions must remain aligned and `./tools/sw-assets-check.sh` must pass. Do not perform a production deploy.

## Suggested Japanese copy shape

Keep it short. Depending on which dependencies land, a combined notice can say roughly:

`Push 3のパッド表示と再接続の安定性を改善しました。USTでは、低音のシェルと上声の4度積みが明確に分かれるボイシングを区別して表示します。`

Do not use this verbatim if only one half is actually in the release.

English should convey the same scope without adding claims.

## Verification

- run the repository tests relevant to notice/schema/cache changes;
- verify update banner rendering if an existing test covers it;
- no deploy / no main push;
- delete this handoff file before Ready for review;
- record the exact release version and merged dependency PRs in the PR body/comment.
