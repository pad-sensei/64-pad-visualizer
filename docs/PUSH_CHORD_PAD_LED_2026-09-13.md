# Push Chord pad LED parity — 2026-09-13

Owner observation after S1 acceptance: Chord-mode lower controls are correct,
but a built chord is not shown on the physical Push pads. The cause was the
Web-only 2026-04-14 scale-only override immediately before LED output.

This bounded change sends the already-rendered `padState` to controller LEDs.
Chord one-position view mirrors the exact current Stock/Tasty/Guitar/selected
voicing/basic-form positions over the current scale background. All-positions
view shows chord pitch classes over the same scale background. Scale mode is
unchanged. C-fixed keeps the background C Major but no longer erases the chord.
Memory/Perform slot layout remains owned by `padWebPushSlotPadColor`.

No theory, audio, pedal, native, manual, release, or S2 button behavior changes.
Physical Push colour/perception remains a Human Gate after machine/audit/dev.

## Chord-tone tonic priority

In basic-form/engine views, a scale tonic that is part of the chord uses the
chord role, including background copies. For Dm7 over C Major this makes C a
chord tone rather than a competing scale-root anchor. Other background chord
pitch classes stay scale-coloured; the chosen shape and playback do not expand.
Degree-colour mode retains the chord's degree role. Selected-box, Input/Perform,
and scale-only previews retain their existing outside-position behaviour.
