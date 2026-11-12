# Launchpad Programmer candidate for the v1.9 line

Status: review candidate, **not a release or real-device qualification**. Tracks [Web issue #37](https://github.com/pad-sensei/64-pad-visualizer/issues/37).

## Scope

- Adds Web MIDI control for **Launchpad Pro MK3 only** to the existing Web 1.8 baseline. Existing PUSH controls, dim/chord resolution, theory and audio dependencies stay unchanged.
- Uses DOJO's Pro MK3 protocol knowledge, not its JUCE transport. Initial Pro, X and Mini protocols are not enabled by this change.
- The Web repository is canonical. Desktop WebUI sync, native MIDI bridging, installers and release publication are separate steps. Web unit tests do not establish Desktop or physical-device behavior.

## Use and ownership

Allow Web MIDI SysEx in a supporting browser, connect one Pro MK3 and select its MIDI input (or All). Automatic Programmer control requires exactly one recognizable MIDI input/output pair; DAW and DIN interfaces are excluded. Without SysEx, an unambiguous pair or successful output opening, Programmer control remains unconfirmed; selected Pro MK3 input is blocked while other MIDI devices remain available.

Use the controller with one app at a time. Do not share it concurrently with DOJO, a DAW, another Explorer tab, or another MIDI owner. A Web MIDI send returning successfully is not a device acknowledgement.

The pad LEDs follow the screen's final resolved positions rather than recalculating voicings. Default background C uses palette 45, shape notes (including C) 13, scale background 2 (tonic 9), and the physically pressed pad 21. Display settings provide five independent Launchpad roles (background, C, guide, guide C, pressed), each accepting palette 0–127 or custom RGB, with reset and persisted settings. These settings do not change Push colours or screen handshape positions; the selected scale tonic remains palette 9. Screen RGB previews are references, not calibrated hardware colours. Full / root / off remain available. Palette appearance and usability still require real-device review.

Programmer notes 11–88 map to the same fourths-grid positions and pitches as the screen. Up/down are CC80/70; left/right CC91/92 do not change octaves. Each press retains its physical identity so release uses the original pitch after an octave change. Non-grid events are not treated as notes. Existing Memory/Perform behavior is retained.

Only changed pad colors are sent after the first full frame. Reconnect repaints all pads. Device change or page teardown releases owned notes, clears LEDs, and attempts Live mode then Note layout restoration. Tab hiding alone does not interrupt playing. Teardown commands are best effort; browsers cannot guarantee delivery after a crash or cable removal.

## Protocol references

- [Novation Launchpad Pro MK3 Programmer Reference](https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/downloads/LPP3_prog_ref_guide_200415.pdf), MIDI interface and Programmer mode sections.
- [DOJO Pro MK3 integration #976](https://github.com/pad-sensei/dojo/pull/976), [palette integration #1042](https://github.com/pad-sensei/dojo/pull/1042).

Mode and LED packets use product byte `0E`. Mode switch `0E 01` enters Programmer, `0E 00` returns Live, and layout command `00 04 00 00` restores Note. These commands and palette frames are sent only through the recognized MIDI output. No PUSH cleanup sweep is sent to a Launchpad.

## Verification and release gate

Automated tests cover all 64 addresses, exact input ownership, ambiguous/failed connections, stale asynchronous opens, delta LED frames, send-failure retries, teardown/reconnect, octave-held releases, unrelated keyboard isolation, PUSH output isolation and BFCache restoration. Existing PUSH and chord-resolution suites must remain green. Help, onboarding and Guide text include the scope in all nine languages.

Before release, run browser tests and test a real Pro MK3: connect/Programmer entry; scale, single- and all-position chord displays; C/pressed colors; all 64 pitches; held-note octave changes; Memory/Perform; disconnect/reconnect; page close/Live/Note restoration; normal MIDI fallback; PUSH co-connection. Run the documented Desktop sync/build and hardware checks separately if a Desktop release is requested. Do not substitute CI success for these checks.

## 1.9.1 local candidate: layout confirmation

The Web adapter now sends the Programmer mode command and then queries the current
layout (`F0 00 20 29 02 0E 00 F7`). It enables Programmer-coordinate input and LED
frames only after the selected, exact input object reports the documented select-layout
packet `F0 00 20 29 02 0E 00 11 00 00 F7` (layout17, page0, reserved0).
The MIDI status distinguishes confirming, confirmed and unconfirmed. A successful
`send()` is not confirmation. The response deadline is1500ms (injectable for tests).

An attempted connection owns its input while opening, waiting or failed: Note/CC
packets cannot fall through to raw MIDI or legacy octave controls. Other keyboards
and Push keep their existing paths. Without SysEx or an unambiguous selectable pair,
no mode command is sent; recognized selected Pro MK3 inputs remain unconfirmed
and blocked. Other MIDI devices retain ordinary input.

Malformed/other-product replies cannot confirm. A valid non-Programmer layout
rejects the attempt or revokes an existing confirmation. Confirmation loss releases
held notes using the pitches captured at Note On, removes the listener and timer,
and attempts Live/Note restoration. Timeout, teardown, input/output loss and
reconnect invalidate prior callbacks; a reconnect requires a fresh confirmation.
LEDs are cleared only if the prior connection was confirmed. No retry loop or
second position/theory calculation is introduced.

Replies with the DOM event `timeStamp` predating the query are ignored. This protocol has
no transaction identifier: an old wire response arriving on the same port *after*
a new query cannot be proven to belong to the old request. Generation checks reject
old callbacks and replies after timeout/disconnect, not this inherent wire ambiguity.
Hardware timing, Windows port naming, all64 physical positions, held-note release,
restoration and interoperability remain real-device checks. The reported Windows
position offset is not established as this bug's cause or verified as resolved.

This1.9.1 candidate is local-only. Desktop WebUI and Native Launchpad ownership use
separate integration paths; synchronizing Web files alone does not add Native ACK
validation. No Desktop package or public release is part of this candidate.

### Diagnostic recovery and the Windows report

Unconfirmed status identifies no reply, a different mode, unavailable SysEx,
ambiguous MIDI pairs or transport failure. Retry is shown only after failure and
repeats automatic confirmation once through the existing adapter. It does not
rebind Keyboard/Push inputs or release their held notes, force permissions,
start an automatic retry loop or require a manual Programmer-mode switch.
Missing SysEx permission or an ambiguous pair must be resolved before confirmation
can succeed; Retry alone does not override those conditions.

The reported C1→Ab1 / C2→Eb observation is tested as a hypothesis, not a proven
hardware cause: raw24/36 while pending or reporting Note layout are silent.
After confirmed Programmer layout, coordinates11/33 produce MIDI36/48
(the application's C1/C2). Coordinates24/36 remain valid after confirmation
and correctly produce MIDI44/51; they are not globally blacklisted.
The real Windows Chrome / Pro MK3 symptom still requires physical verification.
