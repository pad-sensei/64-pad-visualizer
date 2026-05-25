# Folk/Open review generator

`folk_open_review.js` builds a review pack for the 64 Pad Explorer guitar voicing engine.

It compares hand-seeded folk/open guitar shapes against `padEnumGuitarChordForms()` with the
Folk/Open genre weights, then writes:

```bash
docs/folk-open-voicing-review.html
```

The script intentionally does not copy external chord diagram images. It stores common shape
strings only, then draws its own SVG diagrams so the review file can be regenerated safely.

Run from the repository root:

```bash
node tools/folk_open_review.js
```

Current scope:

- Sharp-side folk keys: G, D, A, E
- Common open/capo-friendly functions: I, IV, V, vi, ii, V7, sus, add9, maj7
- Review goal: identify shapes that should rank high, rank low, or be excluded in Folk/Open

Diagrams show the shape in the card title (`x21202`, etc.). The numbers inside fretted
dots are finger numbers from the current automatic fingering estimate, and the card footer
shows the low-to-high finger pattern plus barre estimate. Treat these as review data: when
human-confirmed fingering differs, the human note is the source of truth.

`add9` shapes are treated as secondary review material for now. The strongest references found
so far are closer to Britpop, jangle pop, and folk-rock than to core traditional folk/open chord
vocabulary.

Source basis:

- https://chordly.com/tools/chord-progressions/folk
- https://www.guitar-chord.org/open-chords.html
- https://connectguitar.com/how-to-play-folk-guitar/
- https://guitarchordslibrary.org/chords/key
- https://www.fender.com/articles/chords/learn-how-to-play-b7-guitar-chord
- https://www.tabs4acoustic.com/en/Esus4-guitar-chord%2C206.html
- https://guitarchordslibrary.org/chords/a7
- https://www.guitar-chord.org/gmaj7.html

Human review rules learned during review:

- Open strings are not inherently difficult.
- Many-open-string shapes can be easy and idiomatic in folk/open and blues.
- Only flag open-string shapes when the issue is selective muting or physical interference
  with a string that must ring open.
- Blues should be split conceptually: Chicago / old-school blues can use open strings,
  while modern blues tends to avoid open strings and is closer to closed-position
  funk/soul handling.
- Finger numbers are worth recording now because the same data can later serve a
  guitar-specific app. For 64 Pad Explorer, they mainly explain why a voicing is easy,
  hard, or misleading.
- Muted strings need a muting actor. Record whether each `x` is handled by thumb,
  fingertip, finger pad, adjacent-finger touch, or picking-hand control.
- A7 `x02020` can use fingers 2 and 3. In folk/blues contexts, the muted 6th
  string is commonly handled by the fretting-hand thumb.
- Esus4 / E7sus-family `022200`-type shapes should not be treated as a barre by
  default in the folk/open review. Practical fingerings include 1,2,3 or 2,3,4
  from the 5th string, resolving to E.
