#!/bin/bash
# 64PEの旧RSSバナー自動更新フック（停止済み）
#
# RSS記事は、ブログ公開後にVaultの
# build_64pe_notifications.py が共通通知フィードへ反映する。
# このLaunchAgentがindex.htmlを直接書き換えたり、mainへ自動pushしたり
# すると、記事通知とアプリ本体の公開が再び分離するため、互換ログだけを残す。

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO="${REPO:-$(dirname "$SCRIPT_DIR")}"
LOG_DIR="${LOG_DIR:-${HOME:?HOME must be set}/Library/Logs/urinami}"
LOG="$LOG_DIR/64pe-banner-refresh.log"

mkdir -p "$LOG_DIR"
{
    echo "[$(date '+%F %T')] deprecated: no index.html mutation or git push"
    echo "[$(date '+%F %T')] use the Vault blog publication propagation command"
    echo "[$(date '+%F %T')] repo=$REPO"
} >>"$LOG"

exit 0
