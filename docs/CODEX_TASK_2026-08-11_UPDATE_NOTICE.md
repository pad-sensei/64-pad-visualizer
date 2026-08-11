# Codex task — 64Pad Explorer update notification

Temporary handoff for the local Codex working this Draft PR. **Delete this file before marking the PR Ready for review.**

## Read first

- `CLAUDE.md`
- `64-pad-explorer-update.js`
- recent release-notice commit `4235990d8511f90ecc540db103cd5d1bade41259`
- product dependencies:
  - `pad-sensei/64-pad-explorer-desktop#11` — Push LED stability / Reset-free relaunch recovery, Hardware Gate PASS
  - `pad-sensei/64-pad-explorer-desktop#13` — duplicate Standalone physical MIDI→WebView delivery removed, verified on self-hosted ARM64
  - `pad-sensei/64-pad-visualizer#3` / PR #5 — physical Shell + UST analysis, not yet released

Do not copy private Vault material into this public repository.

## Version reconciliation

Human release evidence confirms Gumroad already shipped/published the Windows maintenance release as **Desktop 1.6.13**.

At the same time, Desktop source remained `project(PadExplorer VERSION 1.6.12)`, so the previous release process allowed a customer-facing version label to diverge from the embedded/source version.

Treat `1.6.13` as burned and historical. **Do not reuse 1.6.13 for the Push/MIDI stability build or silently replace the existing Gumroad release with different bits.**

For the next Desktop patch release, use a new version selected by release preparation; if normal patch progression is used, that is expected to be `1.6.14`. Before publication, make source version, target-specific notice, artifact metadata/name, public distribution label, and manual history agree.

Web and Desktop version tracks remain independent.

## Goal

Prepare the in-app update notice for the next Desktop release after the already-published 1.6.13.

### Confirmed user-facing improvements

Desktop PR #11:

- Push pad LEDs stayed stable during extended real use.
- Force-quit could leave stale hardware LEDs, but relaunch restored pad/button state without `Settings > Reset`.
- Manual Reset remains emergency recovery rather than normal operation.

Desktop PR #13:

- Standalone physical MIDI events are delivered to the WebView once instead of through two parallel paths.
- This is a general input-stability/performance improvement for Push and other directly connected MIDI controllers.

Include PR #13 only if the prepared release branch/artifact actually contains it.

### Pending feature work

Do not announce physical Shell + UST analysis from visualizer #3 / PR #5 until both theory support and the required Desktop controller-position bridge are implemented and hardware-verified.

Current intended feature language, for a later release, is about understanding the played structure: separate actual shell degrees such as `R m3 b7` from the actual physical upper UST shape such as `Q4 [11,b7,m3]`. Do not announce the old Q1/UPPER wording.

## Files / release mechanics

Primary file: `64-pad-explorer-update.js`.

Follow the existing schema and the established release-notice pattern. Read the prepared Desktop version from the release source; do not invent a version in this repo.

Before Ready for review verify that the Desktop notice does not claim 1.6.13 for the new stability build. The prior Gumroad 1.6.13 release must remain historical.

If changing Web assets requires cache version synchronization, follow `CLAUDE.md`: `index.html` and `sw.js` versions must remain aligned and `./tools/sw-assets-check.sh` must pass. Do not perform a production deploy.

## Suggested Japanese copy shape for stability-only release

Keep it short, for example:

`Push 3のパッド表示と再接続の安定性を改善しました。Standalone版のMIDI入力処理も整理し、演奏中の表示と応答を安定させました。`

Adjust to the exact merged scope. English should convey the same scope without adding claims.

## Verification

- run the repository tests relevant to notice/schema/cache changes;
- verify update banner rendering if an existing test covers it;
- verify target/version against the actual prepared Desktop release source;
- no deploy / no main push;
- delete this handoff file before Ready for review;
- record the exact release version and merged dependency PRs in the PR body/comment.
