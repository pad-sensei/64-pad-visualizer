# Codex task — 64Pad Explorer v1.6.14 update notification

Temporary handoff for the local Codex working this Draft PR. **Delete this file before marking the PR Ready for review.**

## Read first

- `CLAUDE.md`
- `64-pad-explorer-update.js`
- recent release-notice commit `4235990d8511f90ecc540db103cd5d1bade41259`
- prepared Desktop source: `pad-sensei/64-pad-explorer-desktop` branch `release/1.6.14-rc`
- product dependencies:
  - `pad-sensei/64-pad-explorer-desktop#11` — Push LED stability / Reset-free relaunch recovery, Hardware Gate PASS
  - `pad-sensei/64-pad-explorer-desktop#13` — duplicate Standalone physical MIDI→WebView delivery removed, verified on self-hosted ARM64
  - `pad-sensei/64-pad-visualizer#3` / PR #5 — physical Shell + UST analysis, **not part of v1.6.14**

Do not copy private Vault material into this public repository.

## Version reconciliation

Gumroad already distributed Desktop **1.6.13**. Treat 1.6.13 as burned and historical. The old source/CMake remaining at 1.6.12 was release-process drift; do not reuse 1.6.13 or silently replace that distribution with different bits.

The prepared Desktop release branch explicitly sets `project(PadExplorer VERSION 1.6.14)`. Therefore this notice is for **Desktop v1.6.14**.

Before publication, source version, Desktop-target notice, artifact metadata/name, Gumroad distribution label, and manual history must all agree on 1.6.14. Web and Desktop version tracks remain independent.

## User-facing scope for v1.6.14

Desktop PR #11:

- Push pad LEDs stayed stable during extended real use.
- Force-quit could leave stale hardware LEDs, but relaunch restored pad/button state without `Settings > Reset`.
- Manual Reset remains emergency recovery rather than normal operation.

Desktop PR #13:

- Standalone physical MIDI events are delivered to the WebView once instead of through two parallel paths.
- This is a general input-stability/performance improvement for Push and other directly connected MIDI controllers.

Do not turn self-hosted CI/routing work into a user-facing release bullet.

## Deferred feature work

Do not announce physical Shell + UST analysis from visualizer #3 / PR #5 in v1.6.14. It needs theory support plus the Desktop controller-position bridge and hardware verification.

Current later-release concept is to separate actual shell degrees such as `R m3 b7` from the actual physical upper UST shape such as `Q4 [11,b7,m3]`. Do not announce the old Q1/UPPER wording.

## Files / release mechanics

Primary file: `64-pad-explorer-update.js`.

- update only the notice whose target is Desktop;
- use Desktop version `1.6.14`;
- preserve the independent Web version;
- follow the existing schema and established release-notice pattern;
- if changing Web assets requires cache version synchronization, follow `CLAUDE.md`: `index.html` and `sw.js` versions must remain aligned and `./tools/sw-assets-check.sh` must pass;
- do not perform a production deploy.

## Suggested Japanese copy shape

Keep it short, for example:

`Push 3のパッド表示と再接続の安定性を改善しました。Standalone版のMIDI入力処理も整理し、演奏中の表示と応答を安定させました。`

Adjust to the exact release artifact. English should convey the same scope without adding claims.

## Verification

- run the repository tests relevant to notice/schema/cache changes;
- verify update banner rendering if an existing test covers it;
- verify target/version against `release/1.6.14-rc` and the final v1.6.14 artifact evidence;
- no deploy / no main push;
- delete this handoff file before Ready for review;
- record v1.6.14 and the included dependency PRs in the PR body/comment.
