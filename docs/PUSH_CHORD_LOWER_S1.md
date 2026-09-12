# Push Chord lower row — S1

Scope: manual parity A01–A03 only. The first lower button cycles Diatonic,
Relative/minor variants, Parallel and Secondary layers in the existing
Standalone order. Buttons 2–8 call the existing diatonic selection path.
Theory remains in pad-core; no dependency pointer or native audio change.
The displayed lower row and its LED states derive from the same layer and
current BuilderState. Root/Quality entry and Setup retain input priority.

References: manual Push display chapter at abac1b18303c2a5268a161e0c26aaaba62a1d82f;
Standalone PluginEditor.cpp at 9ebe324a4eb4d7652c20cb04d2a0b7c8624f42a1,
_pushChordLowerLayers and _pushToggleLowerSwitch. A non-seven-tone scale
retains the native Parallel layer; minor variants keep the native labels
and order. This is not a new theory or controller-wide parity specification.

Two explicit edge corrections relative to the native reference: a slash
bass of C (0) is not absent; a normal degree selected after Secondary
clears the old Secondary provenance before onDiatonicClick, whose contract
otherwise preserves it. No persisted settings schema is introduced.

Tests: push-chord-lower.test.js uses real classic scripts, core theory,
raw CC mapping, BuilderState, MIDI display snapshot and LED output.
push-chord-lower.spec.js exercises the real browser/DOM/canvas path with
MIDI and USB transport boundaries simulated; it is not physical USB,
native/Windows, listening, or full manual acceptance. Existing 18-case
Standalone parity coverage is retained. Independent audit and new physical
acceptance are separate from these machine checks.

No other mode, pedal, native plugin, release, production deployment,
manual source or existing accepted semitone/Perform behavior is changed.
