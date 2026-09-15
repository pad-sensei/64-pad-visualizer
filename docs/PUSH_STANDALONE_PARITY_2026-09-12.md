# Push Web: Standalone gesture corrections (2026-09-12)

Reference: `64-pad-explorer-desktop` at
`5c7e9d3d48b5c6c036d407ac52ae8706d2b26780`, `Source/PluginEditor.cpp`.
Consumer: Web PR #22 / Issue #21. Audio pin remains
`dd1ef52e7681eb459bb35c729226063c5638c506` (audio-core PR #3).

The earlier claim that Web already matched Standalone was incorrect. The old
handler-spy tests inserted `window.AppState` and friends. Actual browser scripts
use lexical `const`/`let` state, so the controller could miss the real state.
The controller now reads live lexical bindings without a second copy on window.

## Corrected gestures

| Gesture | Behavior |
| --- | --- |
| Record | Enter Input with normal musical pads and Memory view, idempotently. |
| Layout | Musical Input -> Memory slot layout -> Perform slot layout -> musical Input. This is a pad layout, not pane order or a new application mode. |
| Plain Chord Jog | Change inversion, even when overview voicing boxes exist. |
| Engine / tension Jog | Preserve active Tasty/Stock/Guitar candidate navigation and explicitly selected tension navigation. |
| Chord Back | First deselect a selected voicing box, then unwind the existing builder. |
| Input Undo / Shift+Undo | Restore / redo slot snapshots. Jog right/left side taps use the same actions. New edits and bank switches invalidate Redo. |
| Memory or Perform slot press/release | Play that slot while held; release its notes on NoteOff. Late release of an older slot must not stop a newer slot. Other 48 pads are silent in slot layout. |
| Held slot Jog / D-pad up/down | Rotate lowest note up an octave or highest note down; save and replay the edited notes. |
| Held slot D-pad left/right / octave buttons | Transpose the slot by semitone / octave, clamp to MIDI range, save and replay. Do not move the global grid or another slot. |
| Slot LED / display | Read the same slot ownership and note buffer used by playback and persistence. |

Layout changes first release old musical MIDI ownership so a NoteOff cannot be
stranded when dispatch moves to slots. They never synthesize pedal-down/up.
Topology reset and disconnect release owned notes and physical sustain; stale
listeners and modifier state cannot replay notes.

## Machine coverage and limitations

`tests/push-standalone-parity.cjs` loads actual classic application scripts in VM
contexts, deliberately without mocked window state objects. It exercises raw CC
mapping, actual mode/view/builder/slot changes and localStorage persistence.

The same suite binds mock Live/User MIDI ports to actual `initWebMIDI()`, follows
raw CC64 and NoteOn/Off through `audio-voice.js`, and checks sampler/WebAudioFont/
fallback release with instrument envelopes stubbed at the synthesis boundary.
For e-piano it executes the actual Worklet processor, checks pending voice state,
and measures finite PCM energy held after NoteOff and damped after pedal-up.
DOM painting, Web MIDI permission/device transport and physical sound output are
not verified by these tests. The Worklet case uses modal synthesis without the
optional FDTD assets. Do not label these as a completed physical Human Gate.

An independent exact-head review is still required. Broader Standalone parity
(e.g. lower display-row menus and Setup editing interactions) is not established
by this focused correction and must not be claimed from its passing tests.

## Boundaries

- Live Port remains the only operational Push MIDI path.
- No automatic Pedal/CV SysEx or hardware configuration writes.
- Push Display remains manual, Chrome + HTTPS; no other-browser parity work.
- No production merge/deploy/tag/release. Draft remains until software blockers,
  independent audit and the owner's physical test are resolved.
