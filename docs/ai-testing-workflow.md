# AI横断テストワークフロー草案

**状態**: 草案  
**対象**: 64Pad Explorer と周辺アプリ共通の、機能変更後テスト・公開物更新フロー。  
**SSOT**: `CLAUDE.md`、各アプリの `docs/`、各アプリの `tests/`。

## 目的

機能変更を「実装できた」で止めず、テスト、スクリーンショット、マニュアル、更新履歴、公開判断まで流す。GPT本体は仕様判断・音楽判断・教育的判断に集中し、Codex / Claude Code / Gemini には反復可能な確認、スクショ、草案、漏れ検出を任せる。

## 役割分担

| 担当 | 任せること | 任せないこと |
|---|---|---|
| GPT / 対話本体 | 仕様判断、音楽判断、教育的意味づけ、UIの意味、リリース可否 | 反復テスト、スクショ収集、差分表の作成 |
| Codex | ローカルコマンド、Playwright、Browser、Computer Use、スクショ、デプロイ確認、狭い編集 | 音楽的良し悪し、演奏感、PUSH LEDの快不快、最終文体 |
| Claude Code | 広いコード読解、既存仕様との差分調査、マニュアル漏れ・重複・矛盾検出 | 最終仕様判断、音楽判断 |
| Gemini | 長い公開文・FAQ・マニュアルの読者視点レビュー、重複検出 | 音楽判断、リリース判断 |
| うりなみさん | 実機演奏感、PUSHの身体感覚、音楽的自然さ、最終公開文体 | リロード、キャッシュ削除、定型テスト実行 |

## 機能変更後の標準フロー

1. **ユーザーに見える変更を抽出する**
   - 新しい操作、表示、ボタン、状態、制限、注意点、権限差、文言を列挙する。
   - ユーザー体験に関係しない内部実装は除外する。

2. **変更種別を分類する**
   - UI / レイアウト
   - audio / DSP
   - theory / chord / voicing
   - MIDI / control surface
   - release / deploy / PWA
   - docs / copy / i18n のみ

3. **機械で潰せる確認を実行する**
   - 変更面に関係する unit / integrity test。
   - PWA / cache / deploy に関係する Playwright deploy check。
   - レイアウト変更時の Browser / Playwright screenshot。
   - Desktop、インストーラー、OSウィンドウ、ブラウザ外UIだけ Computer Use。

4. **既存不合格を切り分ける**
   - 可能なら変更ブランチ、現行main、本番を比較する。
   - `new regression`、`existing non-blocker`、`unstable`、`not applicable` に分類する。
   - 既存不合格は自動ブロッカーにしない。ただし必ず記録する。

5. **公開物更新の影響を判定する**
   - Help / Tutorial / Guide / オンラインマニュアル / 更新履歴 / i18n / スクショ / 動画の要否を判定する。
   - 人間に返す前に、貼り付け可能な粒度の草案を作る。

6. **うりなみさん確認タスクだけを残す**
   - 音楽判断、実機判断、最終文体など、人間でないと判断できないものだけに絞る。
   - リロード、キャッシュ削除、開き直し、定型テストは依頼しない。

## ツール別に任せる項目

| ツール | 向いている確認 | 報告に必要なもの |
|---|---|---|
| Codex shell | `npm test`、lint/build/test、git/submodule status、差分確認、リリース成果物確認 | コマンド、pass/fail、重要な失敗行 |
| Playwright | ブラウザE2E、deploy invariant、スクショ、レスポンシブ、文字被り | テスト結果、viewport、必要ならスクショパス |
| Browser | ローカルWeb画面の対話確認 | 観測状態、レイアウトならスクショ |
| Computer Use | Desktop起動、インストーラー、メニュー、簡単なクリック、非ブラウザUI | 観測状態、スクショ |
| Claude Code | 広いリポジトリ調査、マニュアル漏れ、重複・矛盾検出 | findings表、修正案 |
| Gemini | 長文公開ページ・FAQ・マニュアルの読者視点レビュー | 抜け、重複、読者が迷う箇所 |

## 人間が見る項目

- TASTY / STOCK / Guitar ボイシングの音楽的自然さ。
- ボイシング、フォーム、フィンガリングが教育的に有用か。
- PUSH 3 のLED色、点滅疲労、ボタン導線、演奏中の身体感覚。
- Browser / Playwright / Computer Use では観測できない実機挙動。
- 公開文の最終トーン、AI臭さ、誇張、ブランド違和感。

## 既存不合格とリリースブロッカーのルール

| 不合格の種類 | リリース判断 |
|---|---|
| 今回差分が変更面に新しく起こした失敗 | 修正、または GPT / うりなみさんが明示許可するまでブロック |
| 現行mainまたは本番でも同じ既存失敗 | 原則ブロックしない。既存課題として記録 |
| 今回差分で既存失敗が悪化した | ブロック |
| ユーザー影響の証拠がないテスト不安定 | 1回再実行し、ログ/スクショを添えて `unstable` として報告 |
| 人間確認待ち | その判断がリリース対象に必要な場合だけブロック |

報告時は `new regression`、`existing non-blocker`、`blocked pending human judgment`、`not checked` のいずれかを明記する。

## リリース前チェックリスト

- [ ] ユーザーに見える変更を平易な言葉で列挙した。
- [ ] 関連 unit / integrity test が通った、または失敗を分類した。
- [ ] 関連 Playwright E2E が通った、または失敗を分類した。
- [ ] Web公開時の production deploy / PWA check を予定または実行した。
- [ ] レイアウト変更は Browser / Playwright screenshot で確認した。
- [ ] Desktop / 非ブラウザUI変更は Computer Use で確認した。
- [ ] Help / Tutorial / Guide / online manual の影響を分類した。
- [ ] 更新履歴 / release notes の影響を分類した。
- [ ] visible text の i18n 影響を分類した。
- [ ] スクショ差し替え候補を作った。
- [ ] 動画要否を判定した。
- [ ] うりなみさん確認タスクを人間判断だけに絞った。
- [ ] 既存不合格をリリースブロッカーと混ぜずに記録した。

## スクショ差し替え判断リスト

次のどれかに該当したら、既存スクショの差し替えまたは新規追加を検討する。

- ナビゲーション、ヘッダー、フッター、タブ、モード切替が変わった。
- 既存スクショ内のボタン、コントロール、ラベル、パネル、権限表示が変わった。
- レイアウト、余白、折り返し、breakpoint、表示順が変わった。
- マニュアルで示している状態がデフォルトで再現できなくなった。
- 新機能が文章だけでは理解しにくい。
- 警告、disabled、empty、loading、error state がユーザーに関係するようになった。
- ハードウェア / control surface の設定画面が変わった。
- HPS / free の表示差が現行スクショと違う。
- 既存スクショに古い文言や古いブランディングが写っている。

内部実装、リファクタ、写っていない文言変更だけなら差し替えない。

## 動画要否判断リスト

動画が向くもの:

- 手順の順番や時間変化が価値になる操作。
- controller / PUSH 操作で画面やLEDが変化するもの。
- drag/drop、perform、recording、playback、animation。
- before/after audio やタイミングの違い。
- スクショだけだとユーザーが操作順を誤りそうなもの。

スクショで十分なもの:

- 静的なラベル変更。
- 表やフィルタの選択肢追加。
- 内部deploy/cache修正。
- テスト・docsのみ変更。

## マニュアル草案テンプレート

```markdown
## ユーザーに見える変更

- 何が変わったか:
- 誰に見えるか:
- どこに出るか:
- ユーザー体験上の意味:

## 公開物更新判断

| 公開物 | 判断 | 草案 / メモ |
|---|---|---|
| In-app Help | update / no change / unknown | |
| Tutorial | update / no change / unknown | |
| Guide / online manual | update / no change / unknown | |
| Release notes | update / no change / unknown | |
| i18n | update / no change / unknown | |
| Screenshots | replace / add / no change / unknown | |
| Video | needed / not needed / unknown | |

## 書かないこと

- 内部実装:
- 一時的なdebug情報:
- ユーザー体験に関係しない技術名:

## テスト分類

| Check | Result | Blocker? | Note |
|---|---|---|---|
| Unit / integrity | pass / fail / not run | yes / no | |
| Browser / Playwright layout | pass / fail / not run | yes / no | |
| Deploy / PWA | pass / fail / not run | yes / no | |
| Desktop / Computer Use | pass / fail / not run | yes / no | |
| Human-only | pending / done / not needed | yes / no | |
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

## 未反映・重複・矛盾チェック表

| 種別 | 見る場所 | 判定 |
|---|---|---|
| 未反映 | コード差分に見えるUI/機能が Help / Tutorial / Guide / release notes にない | 公開前に草案を作る |
| 重複 | 同じ説明が複数ページで別表現になっている | SSOTページを決め、他はリンクまたは短縮 |
| 矛盾 | Web / Desktop / plugin / PUSH の対応範囲がページごとに違う | `CLAUDE.md` と対象アプリdocsを優先して修正候補化 |
| 古い画像 | 画像内UIが現行画面と違う | 差し替え候補に入れる |
| 既存不合格 | 既存失敗がリリース失敗として報告されている | `existing non-blocker` として分離 |

## 返答テンプレート

```markdown
## 変更・確認まとめ

- 変更した公開物:
- 実行したテスト:
- スクショ差し替え候補:
- 動画候補:
- 既存不合格:
- リリースブロッカー:
- GPT / うりなみさん判断待ち:
```
