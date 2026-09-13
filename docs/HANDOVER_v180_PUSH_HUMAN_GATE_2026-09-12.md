# 64 Pad Explorer v1.8.0 — Push 修正・dev・実機Gate 引き継ぎ

更新: 2026-09-12。作業の再開記録であり、製品設計の新しいSSOTではない。最新のPR head・監査コメント・Actionsを読み直してから再開する。

## 再開先と製品目標

- Web repo: `pad-sensei/64-pad-visualizer`
- Issue #21 / Draft PR #22。branch: `codex/web-v180-push-human-gate-followup`
- stacked base: PR #20、`codex/web-v180-push-cc-parity` / `348404360df602b737f9f43353f1d9e8a08bd7f6`
- Desktop repo: `pad-sensei/64-pad-explorer-desktop`。ペダル Issue #54、版統合 Issue #58 / Draft PR #59。
- 公開製品名・版: **64 Pad Explorer v1.8.0**。Web / Standalone / VST3 / AUは別バージョン系列にしない。内部cache番号とcore SHAは製品版ではない。
- 操作の基準はStandaloneの既存動作。Web独自の割り当てを作らない。ただし現在のStandaloneを「ペダル成功済み」とみなさない。

## 実機報告を優先する

| 項目 | 現在の証拠 |
| --- | --- |
| 普通の音の切れ方 | owner: 問題なし。維持する |
| Jog / カーソル | owner: 動くようになった。操作の全項目PASSではない |
| Pedal 2 | owner: 効かない。現在のWeb候補は一度も可聴成功していない |
| 半音上下 | owner: 「D-Session」「ROUTEの変更になる」。語を勝手に確定・置換せず、モード・押下中スロット・実際のhandlerを照合する |
| キー / スケール表示 | owner: Push Displayに変更が反映されない。表示修正を実装したが、まだ実機未受理 |
| 過去の成功例 | Keys Standaloneと初期64PEでは難しくなく動いたというowner情報あり。正確な成功時native binary/commitは未特定 |

「すべて出来た」という語から、明示されたペダルFAILや半音FAILを消さない。テスト/監査の緑を音・手触り・実機画素のPASSに置き換えない。ユーザーは前回の要求された実機確認を終えている。同じ未修正候補で同じ確認を求めない。

## コード・監査・配備を分ける

1. `7777b005dd2b61cfd54c90e1898523755b1f5804`: Standalone操作差の修正。**最後に配備成功を確認したdev runtime**。run `34647879489`（trigger SHAは別。ログ内でcandidateを生成・検証・配備した過去方式）。
2. `62bc8f2a92f041a43bb4a5334a2fb69f009ef4d6`: 検証2ファイルだけ追加。独立監査 **PASS / BLOCKER 0 / CONFIRM 0 / MINOR 2**、comment `5640917311`。exact-head run `34649273076`、18ケースと全Web286件PASS。完了した監査を再び待ち扱いにしない。
3. `f30d0e00c0fba72fb1785d32994b47310c74ca88`: `#pad-grid`描画も観測する表示更新修正。exact-head run `34671114106`、表示5件・全Web291件PASS。**未配備**。監査comment `5643304002`は完了し、**BLOCKER 0 / CONFIRM 1 / MINOR 2**。未接続でもrenderごとに描画する点をdeploy前に是正する指摘。
4. **本書と同じcommit**: f30を親とし、表示sessionが`running` / `recovering`の時だけobserver経由で描画するガードを追加。表示テストを10件へ拡張。cacheを`64pad-v180-preview-20260912-display-active-4`へ更新。本書執筆時点ではcommit後のCI・是正差分監査・dev配備は未確認。**PR #22の最新コメントで結果とexact SHAを読む。**

本書と同じcommitの差分はdisplay consumer、display state test、cache、exposure test、本書の5ファイル。音・MIDI handler・操作割り当て・core pin・製品版・workflowは変更しない。

### 表示ガードの証拠と限界

10ケースは、稼働中のkey-only / scale-only / 往復 / detect更新、未接続・接続待ち・停止中・エラーで追加描画なし、WebUSB無し/非secure環境で追加描画なし、idle中の変更後の明示接続、stop/reconnect、recovering、Desktop除外を確認する。canvas readback / encode / setFrameの呼出数を観測し、接続しないだけでなく仕事をしないことを検証する。

f30のexact app blob `7be9ef15951fbec5357efc92d8a0ecb11bf69036`に新テストを当てると **6 PASS / 4 FAIL**。ガード追加後は **10 PASS**。ローカルではテストimportだけNode標準runnerに置き換えて実行した。正式Vitestと全suiteの結果はcommit後のActionsを確認する。これは実機・実ブラウザの性能測定ではない。既存の初回1フレーム生成は変更していない。

### Cache方針（今回のpreview限定、監査MINOR-1への明記）

この2段階の表示修正は`push-display-webusb-app.js?v=webusb-20260912-11`を維持し、**SW cache generationを更新identity**として扱う。既存installの`fetch(..., {cache:'reload'})`で新cacheへ各assetを取り直す。これは通常の「ファイル内容変更に合わせqueryを更新」からの明示的な例外であり、製品全体の新規version policyではない。index/SWのURL一致を維持する。CIのliteral一致だけで実際の配備/読込を保証したとは言わない。配備後はserved sourceとcache名を確認し、既存タブが新コードを実行していることをGate前に確認する。

PWA既知債務: local static JS/CSSは40URL、precache39、既存`error-logger.js`だけ欠落。数値版だけの旧checkerは32件。既存債務を今回の表示修正と混ぜて拡大しない。

## dev更新と次のHuman Gate

owner方針: **是正・必要な監査が終わった改善はdevへ反映する。ペダルまで全件解決するのを待たない。Human Gateを返す時は先にdevを更新する。** 本番公開の承認とは別。

次の順序:

1. PR #22のfresh headと最新監査を読む。追加ガードの狭い是正差分だけをレビュー対象にし、過去の監査を繰り返さない。
2. exact-head `Verify Push parity (exact head)`が緑で、必要な是正受理が揃ったら、既存 `.github/workflows/deploy-dev.yml` をその対象refで実行。開始時SHA、checkout、test、配備内容が同一であることを証拠化する。途中でbranchが動けば結果を混同しない。
3. deployment runと対象SHA、served app内容/cache generationを照合してから、通常のHTTPS devをownerへ示す。古い配備記録だけで「新修正が入った」と報告しない。
4. 最初の表示Gateは、**音を弾かず、モードを切り替えず、キーとスケールだけを変えてPush表示が追従するか**。必要な物理操作/耳だけをownerへ渡す。GitHub操作、console script、build、手動キャッシュ削除はownerへ押し付けない。
5. FAILはIssue #21へ具体的な操作・観測として戻す。ペダル・半音は別の未解決項目のまま保持。

現セッションのGitHubツールにはworkflow dispatch操作が見つからなかった。利用可能な実行経路で解決し、必要ならTUNER監督点へ既存workflowの実行を渡す。**read用fetchをPOST代わりに使わない、無承認の本番mergeで代用しない、テスト中に製品コードを書き換えるcarrier方式へ戻らない。** これはownerの作業ではない。

## ペダルを再開する際の具体的な境界

- 既に確認済み: Push 3 Live PortのCC64がブラウザに到達した過去の実機証拠。故障仮説やport discoveryからやり直さない。
- 未確定: 直近のFAILで実際に読まれたasset、選択音色、受理CC64の値/時刻、MIDI/audio/Worklet state、鳴っているvoiceへの伝播。その同一動作を結びつける。
- 既存`midi.js`の`__64PE_PUSH_MIDI_DIAG__` / `padWebRenderPushMidiDiag`には、lastCC/lastPedal、MIDI/audio/worklet sustain、selected engine、workletReady、rebinds、errorの観測口がある。新しい大きな仕組みを作る前に使う。読込identityと後続reset/releaseの時刻も照合する。追加instrumentationが必要なら小さな独立差分で行う。
- Webのvoice管理とnativeのhosted-plugin経路は別。MK1の`instrument.setSustain`成功を64PEのcollector/hosted-plugin成功へ流用しない。
- 初回Web実装は`e7af1b0fc7009c4f8ef5f25e9552a6252a9c6ba9`。参考にはなるが成功時native binaryと同一扱いしない。
- audio-core pin: `dd1ef52e7681eb459bb35c729226063c5638c506`。bootstrap修正は本当の欠陥修正だが、今回の可聴FAIL全体の原因確定ではない。既存18-case VM/PCMテストはFDTD資産・実デバイス・実際の出力を含まない。

## 共有依存・統合

pad-coreは`eded0b6f1108a75f889b5e62ac8198e2b27de3d0`。audio-coreの旧pin `99a2538c0ec829aae6f82ac824a2692224dd76a8`から現pinまでの全5commitはPR #22本文に列挙済み。今回pin前進なし。今後前進する場合も跨ぐ全commitを開示し、音・見た目・操作が変わるconsumer hostごとに必要な実機Gateを持つ。

Desktop #59のPR本文には古いSHAが残った時期がある。`webui-source-pin.json`とbranch headをfreshで照合し、generated `WebUI/`を手編集しない。版統合ができても音源実装や実機受理が同一になるわけではない。

## 固定境界

通常Chat / GitHub実行経路。Work/Coworkなし。TUNERは差配/監督、設計判断はSolへ戻す。Routine運用契約と対象製品契約を読む。製品哲学・Human rulingの正本はVault、code/checksの正本はGitHub。共有manifest mirrorを新しい製品SSOTにしない。

Operational Push MIDIはLive Portのみ。User/Externalを通常の演奏/LED経路へ戻さない。**Pedal/CV自動SysEx禁止**（`initializePush3PedalMode` / `0x37,0x26,0x50`を戻さない）。Layoutからペダルイベントを捏造しない。WebUSBは明示接続、Chrome+HTTPS、他ブラウザparity不要。表示stopだけでMIDI/LED所有を壊さない。

既存runnerはscope/labelsが合うrepoで使う。DOJOの`dojo-mac-local`をWeb repoのrunnerとみなさない。既存Web verificationのUbuntu/Node22経路を変更していない。runner再登録、scheduler追加、サービス/cap/reset/cache/backoff変更、勝手なbootstrapなし。

本番merge/deploy、tag/release、Desktop最終パッケージ公開、R2/Gumroad publication、force-push、admin overrideは禁止。devへの配備許可を本番承認へ拡張しない。次の担当者も、確認済み/未確認/配備済みを分けて短く報告する。
