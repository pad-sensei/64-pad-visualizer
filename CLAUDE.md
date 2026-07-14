# 64Pad Explorer

64Pad Explorer is the public browser application for exploring, playing, and exporting chords, scales, voicings, and 64-pad layouts. It is the Web source used by the wider Pad Sensei product family.

## Canonical repository and scope

- Canonical repository: `https://github.com/pad-sensei/64-pad-visualizer`
- Canonical branch: `main`
- This repository is the source of truth for the Web application.
- The Desktop application consumes selected Web files through its own sync process. Generated Desktop `WebUI/` copies are not authoring sources.
- `pad-core/` is a Git submodule for shared theory and rendering logic.
- `audio-core/` is a Git submodule for the Web audio engine.
- Web audio and Desktop native audio are separate systems. Do not infer that an audio change is shared across them.

## Setup and local run

```bash
git submodule update --init --recursive
npm ci
python3 _nocache_server.py 8080
```

Use the no-cache server above for local development. Do not replace it with a plain `python -m http.server` invocation because this is a PWA with an active Service Worker.

Git hooks are clone-local and are not transferred by Git. Treat them as an extra guard only: on a fresh clone, run the repository checks below explicitly and do not push `main` without deployment approval.

## Tests

```bash
npm test
npm run test:e2e
npm run test:prod
```

- `npm test`: unit and integrity tests.
- `npm run test:e2e`: local Playwright tests.
- `npm run test:prod`: Playwright checks against the production URL.
- Run tests that cover the changed area before merging.
- Audio behavior, controller feel, and musical voicing quality still require the appropriate real-device or listening review; do not claim those from DOM tests alone.

## Directory map

- `index.html`, `style.css`: application shell and styling.
- `main.js`, `builder.js`, `render.js`, `theory.js`: main application behavior.
- `plain.js`, `perform.js`, `midi.js`: memory, performance, and MIDI paths.
- `lang-*.js`, `i18n.js`: nine-language UI text.
- `pad-core/`: shared theory/rendering submodule.
- `audio-core/`: Web audio submodule.
- `tests/`: Vitest and Playwright coverage.
- `docs/`: stable design and test references.
- `.github/workflows/deploy.yml`: production pipeline.

## Engineering rules

- Theory calculations belong in `pad-core`; keep this repository's theory-facing code as adapters where possible.
- Treat submodule pointer changes as dependency releases. Push the submodule commit first, then the parent pointer.
- Never bump `audio-core` blindly. Validate the 64Pad Explorer integration separately from other consumers.
- Keep Web and Desktop audio assumptions separate.
- Preserve the established control scheme unless a product decision explicitly changes it.
- A user-visible feature change must include relevant Help, Tutorial, Guide, translations, and release documentation.
- All nine `lang-*.js` files must receive the same new translation keys.
- PWA cache versions in `sw.js` and versioned asset references in `index.html` must remain synchronized. Before every relevant commit, run `./tools/sw-assets-check.sh` and inspect the staged version diff; a local pre-commit hook is only an extra guard.
- Do not add machine-specific absolute paths, session logs, private operational notes, credentials, or internal access mechanisms to this public repository.
- Every AMP/Suitcase entry added to `audio-core`'s `EP_AMP_PRESETS` must set `useCabinet: true`, and that metadata must propagate to `host-adapter.js`; the preset filter depends on it to keep those entries access-gated. Do not expose the internal activation mechanism.
- Do not edit generated copies in another repository. Change the source here, then use that repository's documented sync path.

## Stable design references

### Phase 4.9 — Voicing position switching

- `calcAllVoicingPositions` enumerates valid pad arrangements and sorts compact candidates first.
- `lastBoxes.alternatives`, `currentAlt`, and `cycleIndices` hold the currently selected alternative.
- An alternative position means the same MIDI pitches on different physical pads; it is not an octave change.
- Reset voicing selection when the chord or key context changes.
- Keep position cycling, inversion, transposition, and octave movement as separate operations.

### V2.3 — Scale Overlay

- Selecting an Available Scale overlays its pitch classes behind chord tones in Chord mode.
- Chord tones keep priority; ordinary scale tones and characteristic tones use the lower-priority overlay layer.
- `computeRenderState()` provides `overlayPCS` and `overlayCharPCS`; no selected scale means no overlay.
- A Parent Scale selection must call the full `render()` path so the pad and instrument views update together.

## Deploy and release safety

- A push to `main` triggers `.github/workflows/deploy.yml`.
- The workflow runs tests, deploys the Web application to production, then requests a Desktop build.
- Therefore, `main` push is a production action, not a storage-only Git operation.
- Use a feature branch for review. Merge to `main` only after tests and external audit pass.
- A local pre-push hook accepts `DEPLOY_CONFIRMED=1` for an explicitly approved non-interactive production push. Because hooks are clone-local, absence of that hook never grants permission to push `main`.
- `./deploy.sh` is a manual fallback and must not be run as part of ordinary Git synchronization.
- After a production push, verify the GitHub Actions result and the production-facing check appropriate to the change.

## Current state

- Date: 2026-07-14.
- Canonical remote is the Pad Sensei organization repository; local automation must keep that repository named `origin`.
- Current product baseline: `b963348e542c7d2a5d8f44e87f3103a01ff15cbf` (`banner: auto-refresh RSS feeds`).
- This repository-hygiene change is documentation-only. It does not change product code, submodule pointers, cache versions, or audio behavior.
- The automated banner updater commits and pushes `origin main`; keeping `origin` pointed at the organization repository prevents future split synchronization.
- The organization repository has the deployment and Desktop-dispatch secrets installed. Its first organization-side workflow run still requires verification before the pipeline is treated as operational.
- Historical internal material removed from this file is archived outside the public repository.
- Remaining hygiene findings in other legacy documents and Git history are tracked separately. Do not rewrite public history or edit unrelated documents as part of routine development.
- Next start: run `git fetch origin && git status -sb`, read this file, then open the design document for the subsystem being changed.
- Main trap: merging or pushing `main` can deploy production even when the changed file itself is excluded from the rsync payload.
- Decision waiting: any public-history rewrite or cleanup of other legacy documents requires a separate, explicit decision.
