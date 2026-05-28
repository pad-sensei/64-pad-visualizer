# 64Pad Explorer テストマニュアル草案

**状態**: 草案  
**対象**: 64Pad Explorer Web / Desktop / PUSH関連のリリース前確認。  
**SSOT**: `CLAUDE.md`、`docs/AUDIO_SPEC.md`、`tests/`、`pad-core/`、`audio-core/`。

## 絶対ルール

- うりなみさんにリロード、ハードリロード、キャッシュ削除、開き直し、定型検証を依頼しない。
- このアプリは PWA で Service Worker が現役なので、ローカルWeb確認は `_nocache_server.py` を使う。
- テストマニュアル作成中は、実装、テストコード、`CLAUDE.md`、`pad-core`、`audio-core` を編集しない。
- Web版 / Browser版 / VST3 / AU plugin で Push 3 Control Surface を操作できるように誤解させない。
- Push 3 の Setup で表示設定を開けるのは Desktop 版だけ。
- PUSH2 は完全対応ではなく、ディスプレイ表示と部分的対応。
- HPS TASTY は採譜・実用データなので、通常のコードビルダー理論と完全一致しないことがある。
- 6系統は `6(9)` 系で表示し、Lydian 系は `#11` として扱う。

## ローカル確認コマンド

PWA-safe local server:

```bash
python3 _nocache_server.py 8080
```

基本テスト:

```bash
npm test
npx playwright test tests/e2e/deploy.spec.js --project=chromium
BASE_URL=https://murinaikurashi.com/apps/64-pad npx playwright test tests/e2e/deploy.spec.js --project=chromium
```

audio / preset / effect / routing / `audio-core` に触れた時:

```bash
npx playwright test tests/e2e/audio-invariants.spec.js --project=chromium
BASE_URL=https://murinaikurashi.com/apps/64-pad npx playwright test tests/e2e/audio-invariants.spec.js --project=chromium
```

submodule が関係する時:

```bash
git status -sb
git -C pad-core status -sb
git -C audio-core status -sb
```

## 既知ベースライン

`CLAUDE.md` の 2026-05-27 現在地より:

| Check | Baseline |
|---|---|
| `npm test` | 146 tests passed |
| local `deploy.spec.js` | 2 passed / 1 skipped |
| production deploy E2E | deploy系通過 |
| production audio E2E | 既存不合格 2件 |

audio E2E の既存不合格は、リリース判断前に今回差分由来か既存課題かを必ず切り分ける。

## テストマトリクス

| 変更範囲 | Codex / Playwright / Computer Use に任せる | 人間 / うりなみさんが見る |
|---|---|---|
| 理論、コード判定、表記 | `npm test`、関連unit確認、表示ラベル比較 | 仕様が曖昧な時の教育的な言い方 |
| TASTY / STOCK / Guitar data | `npm test`、選択状態と Note/Degree のスクショ、HPS gate確認 | 音楽的自然さ、実用フォーム、フィンガリング |
| 8x8 pad layout | desktop / narrow viewport のPlaywrightスクショ、Note/Degree被り確認 | 学習・演奏に使いやすいか |
| Chord builder | Root -> Quality -> Tension -> Voicing のBrowser/Playwright確認 | 操作名、教える順序、言い回し |
| Plain / Memory / Export | slot、label、button、download action のBrowser/Playwright確認 | ワークフロー説明の分かりやすさ |
| Perform mode | 4x4 grid、keyboard/click、slot state の確認 | ハードウェア演奏時のタイミング・感触 |
| Parent Scale | scale logic unit、table/filter/selected row のスクショ | 教育的な優先順位、説明文 |
| Audio UI / effects | audio E2E、`docs/AUDIO_SPEC.md` invariant、control screenshot | 音質、音楽的意味、preset名 |
| PWA / deploy | `deploy.spec.js` local / production、cache/SW/version consistency | リリース可否 |
| Desktop app | Computer Useで起動、window、menu、簡単なクリック、スクショ | Control Surface、MIDI、実機連携の感触 |
| Push 3 / Push 2 | code path確認、Desktop UIスクショ、設定画面確認 | LED色、点滅疲労、ボタン導線、演奏感 |
| i18n / visible copy | visible key検索、lang file確認、必要なら言語別スクショ | 最終文体 |

## リリース前チェックリスト

- [ ] `git status -sb` を確認し、既存変更を戻していない。
- [ ] submodule 変更があり得る場合、`pad-core` / `audio-core` の status を個別確認した。
- [ ] `npm test` が通った、または失敗を分類した。
- [ ] local `deploy.spec.js` が通った、または失敗を分類した。
- [ ] Web公開時は production `deploy.spec.js` をdeploy後に実行する予定がある。
- [ ] audio / preset / effect / routing / `audio-core` 変更時は audio E2E を実行した。
- [ ] audio E2E失敗は本番またはmainと比較して分類した。
- [ ] Desktop / installer / window / MIDI / Push setup 変更時は Computer Use で確認した。
- [ ] visible layout 変更時は Browser / Playwright screenshot を確認した。
- [ ] Help / Tutorial / Guide / online manual の影響を分類した。
- [ ] HPSポータル更新履歴 / release notes の影響を分類した。
- [ ] visible text の i18n 影響を分類した。
- [ ] スクショ差し替え候補を作った。
- [ ] 動画要否を判定した。
- [ ] うりなみさん確認リストを人間判断だけに絞った。

## 既存不合格の分類表

テストが落ちたら、リリース報告でこの形にする。

| Failure | 変更ブランチ | 現行production/main | Classification | Release blocker? | Note |
|---|---|---|---|---|---|
| 例: audio E2E cross-preset bleed | fail | fail | existing non-blocker | no | 記録するが今回リリースの直接ブロッカーにしない |
| 例: deploy SW mismatch | fail | pass | new regression | yes | 修正してから公開 |

ルール:

- production/mainでも同じ落ち方をし、今回差分がその面に触れていなければ `existing non-blocker`。
- 今回差分が失敗を作った、悪化させた、対象範囲を広げた場合は `new regression` としてブロック。
- docs-only作業中の audio E2E 失敗は、docsがaudio挙動変更を主張していない限り unrelated として切り分ける。
- human-only項目が未確認の場合、その判断が今回リリースに必要かを明記する。

## スクショ差し替え判断リスト

64Pad ExplorerでUI変更があったら、次を確認する。

| Area | 既存asset / surface | 差し替え条件 |
|---|---|---|
| Scale mode | `img/screenshot-scale.png` | scale grid、mode tabs、colors、root/scale legend、instrument panels、header が変わった |
| Chord mode | `img/screenshot-chord.png` | builder、tension grid、voicing boxes、Note/Degree、guitar/piano/staff が変わった |
| Plain mode | `img/screenshot-plain.png` | capture/edit/end、active notes、chord detection、memory slots、export buttons が変わった |
| Perform mode | `img/screenshot-perform.png` | 4x4 perform grid、slot state、undo/D&D、keyboard pad labels が変わった |
| Parent Scale | `img/screenshot-parent-scale.png` | parent-scale table、filters、symbols、selected scale behavior が変わった |
| Online guide | `guide.html` とリンク画像 | 現行default UIまたはHPS/free状態と合わない |
| App icons | `img/icon-192.png`、`img/icon-512.png`、`favicon.svg` | branding / app identity が変わった |
| Store pages | BOOTH / itch / Gumroad screenshots | Desktop window、価値説明、Push/MIDI対応、価格面が変わった |

新機能が既存スクショに収まらない別状態なら、差し替えではなく新規追加にする。

## 動画要否リスト

動画が向くもの:

- Perform mode で複数slotを演奏する流れ。
- Plain capture -> edit -> memory slot -> export の流れ。
- Desktop の Push 3 setup / display workflow。
- controller操作でボタン順や表示変化が重要なもの。
- before/after audio behavior が静止画では伝わらないもの。

動画が不要なことが多いもの:

- 静的なラベル変更。
- 表やfilter optionの追加。
- 内部deploy/cache修正。
- tests / docs のみ変更。

## 64Pad Explorer 機能変更後マニュアル草案チェック

```markdown
## 64Pad Explorer Manual Impact

- Feature / change name:
- User-visible behavior:
- Free or HPS-only:
- Web / Desktop / plugin applicability:
- PUSH applicability:
- Existing manual location to update:
- New section needed:
- Screenshot candidate:
- Video candidate:
- Do not document:

## Suggested Manual Draft

ユーザーに見える効果を先に書く。
操作手順は短く書く。
内部実装名、テスト名、AI由来の抽象表現は入れない。
```

## うりなみさん確認タスクリストテンプレート

```markdown
## うりなみさん確認タスクリスト

- [ ] 操作名・機能名はこの言い方でよいか
- [ ] マニュアルに独立章が必要か、既存ページ追記でよいか
- [ ] レイアウト変更により差し替えが必要なスクショはどれか
- [ ] PUSH実機写真が必要な状態はどれか
- [ ] 動画の方が伝わる操作はどれか
- [ ] ユーザーにとって不要な技術説明が混じっていないか
- [ ] AI臭い表現、抽象的すぎる表現、誇張がないか
- [ ] 実機でしか確認できない項目が残っているか
```

## 未反映・重複・矛盾表

| Topic | 現在の根拠 | 草案への反映 | Risk |
|---|---|---|---|
| AI分業とテスト原則 | `CLAUDE.md` | `docs/ai-testing-workflow.md` に反映 | CLAUDE.md更新時にdocsが古くなる |
| 64PEリリース確認 | `CLAUDE.md`、`tests/`、`docs/AUDIO_SPEC.md` | 本ファイルに反映 | test名・コマンド変更時に更新が必要 |
| audio E2E既存不合格 | `CLAUDE.md`現在地、`test-results/` | 既存不合格分類ルールに反映 | リリース直前に件数と内容の再確認が必要 |
| Push 3 human checks | `CLAUDE.md` | human-only項目に反映 | 実機判断はスクショで代替不可 |
| Store/public screenshots | `img/`、`docs/BOOTH_itch_出品チェックリスト.md` | スクショ差し替え表に反映 | Store実ページはrepo外にある可能性 |

## 返答テンプレート

```markdown
## 64Pad Explorer 確認結果

- 変更した公開物:
- 実行したテスト:
- スクショ差し替え候補:
- 動画候補:
- 既存不合格:
- リリースブロッカー:
- 未確認:
- GPT / うりなみさん判断待ち:
```
