# Launchpad Programmer candidate for the v1.9 line

Status: review candidate, **not a release or real-device qualification**. Tracks [Web issue #37](https://github.com/pad-sensei/64-pad-visualizer/issues/37).

## Scope

- Adds Web MIDI control for **Launchpad Pro MK3 only** to the existing Web 1.8 baseline. Existing PUSH controls, dim/chord resolution, theory and audio dependencies stay unchanged.
- Uses DOJO's Pro MK3 protocol knowledge, not its JUCE transport. Initial Pro, X and Mini protocols are not enabled by this change.
- The Web repository is canonical. Desktop WebUI sync, native MIDI bridging, installers and release publication are separate steps. Web unit tests do not establish Desktop or physical-device behavior.

## Use and ownership

Allow Web MIDI SysEx in a supporting browser, connect one Pro MK3 and select its MIDI input (or All). Automatic Programmer control requires exactly one recognizable MIDI input/output pair; DAW and DIN interfaces are excluded. Without SysEx, an unambiguous pair or successful output opening, no Programmer commands are sent and ordinary MIDI input remains available.

Use the controller with one app at a time. Do not share it concurrently with DOJO, a DAW, another Explorer tab, or another MIDI owner. A Web MIDI send returning successfully is not a device acknowledgement.

The pad LEDs follow the screen's final resolved positions rather than recalculating voicings. C uses palette 45, shape notes 13, scale background 2 (tonic 9), and the physically pressed pad 21. Full / root / off remain available. Palette appearance and usability still require real-device review.

Programmer notes 11–88 map to the same fourths-grid positions and pitches as the screen. Up/down are CC80/70; left/right CC91/92 do not change octaves. Each press retains its physical identity so release uses the original pitch after an octave change. Non-grid events are not treated as notes. Existing Memory/Perform behavior is retained.

Only changed pad colors are sent after the first full frame. Reconnect repaints all pads. Device change or page teardown releases owned notes, clears LEDs, and attempts Live mode then Note layout restoration. Tab hiding alone does not interrupt playing. Teardown commands are best effort; browsers cannot guarantee delivery after a crash or cable removal.

## Protocol references

- [Novation Launchpad Pro MK3 Programmer Reference](https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/downloads/LPP3_prog_ref_guide_200415.pdf), MIDI interface and Programmer mode sections.
- [DOJO Pro MK3 integration #976](https://github.com/pad-sensei/dojo/pull/976), [palette integration #1042](https://github.com/pad-sensei/dojo/pull/1042).

Mode and LED packets use product byte `0E`. Mode switch `0E 01` enters Programmer, `0E 00` returns Live, and layout command `00 04 00 00` restores Note. These commands and palette frames are sent only through the recognized MIDI output. No PUSH cleanup sweep is sent to a Launchpad.

## Verification and release gate

Automated tests cover all 64 addresses, exact input ownership, ambiguous/failed connections, stale asynchronous opens, delta LED frames, send-failure retries, teardown/reconnect, octave-held releases, unrelated keyboard isolation, PUSH output isolation and BFCache restoration. Existing PUSH and chord-resolution suites must remain green. Help, onboarding and Guide text include the scope in all nine languages.

Before release, run browser tests and test a real Pro MK3: connect/Programmer entry; scale, single- and all-position chord displays; C/pressed colors; all 64 pitches; held-note octave changes; Memory/Perform; disconnect/reconnect; page close/Live/Note restoration; normal MIDI fallback; PUSH co-connection. Run the documented Desktop sync/build and hardware checks separately if a Desktop release is requested. Do not substitute CI success for these checks.
