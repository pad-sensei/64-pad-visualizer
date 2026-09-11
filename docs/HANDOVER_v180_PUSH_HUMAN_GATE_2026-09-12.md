# 64 Pad Explorer v1.8.0 — Push 3 Chrome Human Gate 引き継ぎ

## 対象

- repo: `pad-sensei/64-pad-visualizer`
- parent PR: #20 `feat(push): bring Push 2 / Push 3 parity to Web v1.8.0`
- parent exact head at handoff: `348404360df602b737f9f43353f1d9e8a08bd7f6`
- follow-up Issue: #21 `v1.8.0 follow-up: Push 3 sustain + jog/back/layout Human Gate blockers`
- follow-up branch: `codex/web-v180-push-human-gate-followup`
- browser target for owner Human Gate: Chrome + HTTPS dev URL `/apps/64-pad-dev/`

この follow-up は PR #20 の残り Human Gate だけを扱う。PR #20 で既に通っている display / function LED / Live-Port ownership / WebUSB manual-connect contract を壊さない。

## 2026-09-12 実機 Human Gate 現物

### PASS

- 通常 dev URL で `Push Display` が表示される。`?webusb=1` は不要。
- Chrome から Push 3 を選択すると **物理ディスプレイが表示される**。
- **機能キー LED は点灯する**。

### OPEN / FAIL

1. **サステインペダルは Web Human Gate で一度も成功していない。**
   - 以前の実機診断で Pedal 2 の CC64 は Push 3 **Live Port** からブラウザまで届くことを確認済み。
   - したがって MIDI port discovery や物理ペダル故障を最初の仮説に戻さない。
   - accepted CC64 → Web sustain state → `pad-audio-core` → 実際に選ばれている engine / voice の end-to-end を追う。
   - sampler / WebAudioFont / non-worklet / e-piano worklet を、実際に Web UI から選択できる経路ごとに確認する。
   - pedal-up の release と reconnect / topology reset の release も検証する。

2. **ジョグ／ナビゲーションの実機操作が不足している。**
   - 現状、owner が期待する **転回系操作** と **戻る / Back 系操作** が Push Web の実機ワークフローから使えない。
   - Desktop / Standalone の現在の logical control vocabulary と handler を fresh state で照合し、Web 独自 mapping を作らない。
   - raw CC map が存在しても handler / state transition が繋がっていない可能性を分けて調べる。

3. **Layout ボタンで layout/view 切り替えができるか調査する。**
   - これは owner の明示的な要望。
   - 既存 canonical Web state/function と Desktop/Standalone semantics を優先する。
   - 新しい概念や隠しモードを作らず、既存の layout/view の切替として成立するなら実装する。
   - 既存契約上できない場合は、実装せず根拠を Issue #21 に残す。

## 絶対に維持する契約

### Push MIDI ownership

- supported Push の Note / CC / pad LED / button LED の operational path は **Live Port only**。
- User / External は ordinary performance input / ordinary LED output にしない。
- `All Devices` でも operational Push input は1つだけ。
- topology rebinding は `id/name/state` を正本にし、send/open による connection churn で再 bind しない。

### Pedal/CV

- **Push Pedal/CV 設定 SysEx を自動送信しない。**
- `initializePush3PedalMode` を戻さない。
- `0x37, 0x26, 0x50` の Pedal/CV write を戻さない。
- public Web page はユーザーのハード設定を保存する。
- CC64 は普通の performance MIDI として扱う。

### WebUSB display

- v1.8.0 の supported/recommended path は **Chrome + HTTPS**。
- Firefox / Safari などで Push Display を見せる必要はない。cross-browser WebUSB parity は release requirement ではない。
- WebUSB display は **manual / explicit**。ユーザーが `Push Display` を押した時だけ chooser を出す。
- `getDevices()` で silent reconnect しない。
- WebUSB display ownership と Web MIDI pad/CC ownership を混ぜない。
- display stop/hide で pad LED を勝手に clear しない。

### 既に通った Human Gate を退行させない

- Push 3 physical display: PASS
- function-button LED illumination: PASS
- Live-Port routing / pad LED existing behavior: preserve

## Audio / sustain 現在地

shared `pad-audio-core` の Web pin:

`99a2538c0ec829aae6f82ac824a2692224dd76a8`

この pin には sustain fix と、それ以前の e-piano voicing / spring / 73-key changes が含まれる。sustain fix の意図は:

- non-worklet voice: pedal-down 中は NoteOff defer
- pedal-up で deferred release
- same-note retrigger / `noteOffAll()` cleanup
- e-piano AudioWorklet は DSP 側 sustain authoritative
- stale state は stuck note より release を優先

しかし owner 実機では audible sustain が一度も成功していない。**unit smoke が通っていることを実機 PASS とみなさない。**

次の browser session は、まず Web 側の CC64 dispatch と実際の engine selection / voice path を instrument / source-read して、「CC64 は来ているが sustain state へ届かない」「state は変わるが voice が defer されない」「worklet pathだけ別挙動」などを切り分ける。

## 次セッション開始時に必ず fresh read

1. PR #20 current state
2. Issue #21
3. follow-up PR current state
4. branch head
5. `midi.js`
6. `push-midi-cc-map.js`
7. `push-midi-port-contract.js`
8. `push-web-control.js`
9. `main.js`
10. `host-adapter.js`
11. `audio-core/audio-voice.js`
12. e-piano worklet/engine sustain handling
13. relevant unit tests
14. Desktop/Standalone current Push logical handler for jog/back/layout parity

古い引き継ぎ SHA を fresh state より優先しない。

## 実装ループ

通常 Chat / browser GitHub flow で進める。Work/Cowork は使わない。

1. current state を読む
2. 3課題を root cause 単位に分ける
3. machine-fixable なものは permanent focused test を先に足す
4. 実装
5. focused test
6. full `npm test`
7. PWA/cache contract
8. Pedal/CV negative guards
9. dev deploy `/apps/64-pad-dev/`
10. exact-head independent audit
11. PASS 後だけ owner Human Gate に戻す

Human Gate で FAIL したら、その結果を software blocker として Issue/PR に記録し、再び machine fix へ戻る。

## 今回の完了条件

Push 3 / Chrome 実機で:

- Pedal 2 で audible sustain が効く。
- pedal-up で正しく release する。
- jog/navigation から既存 product vocabulary に沿った inversion/back 操作が使える。
- Layout button の切替は、実装可能なら実機で動く。採用しない場合は根拠が Issue #21 に残る。
- display / function LEDs / Live-Port / pad LEDs が退行していない。

## 禁止

- production merge / deploy
- tag / GitHub Release
- R2 / Gumroad publication
- Desktop package release
- force-push
- admin override
- Pedal/CV auto-configuration SysEx の復活
- Human Gate を unit test / audit で代替すること
