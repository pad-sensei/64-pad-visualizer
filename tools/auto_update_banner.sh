#!/bin/bash
# 64PE banner 自動更新スクリプト（LaunchAgent から1時間毎に実行）
#
# 動作:
# 1. origin/main を fetch
# 2. dirty working tree なら skip（手動作業中の可能性）
# 3. main が origin/main より遅れていたら ff-only で追従
# 4. tools/update_note_banner.py を実行 (3フィードRSS→index.html)
# 5. index.html に差分があれば commit → push (--no-verify)
# 6. GitHub Actions が deploy.yml を走らせて Xserver に rsync 反映
#
# インストール:
#   chmod +x tools/auto_update_banner.sh
#   cp /path/to/com.urinami.64pe-banner-refresh.plist ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/com.urinami.64pe-banner-refresh.plist
#
# 作成: 2026-04-19

set -eo pipefail

REPO="/Users/nozakidaikai/64-pad-visualizer"
LOG_DIR="/Users/nozakidaikai/Library/Logs/urinami"
LOG="$LOG_DIR/64pe-banner-refresh.log"

mkdir -p "$LOG_DIR"

cd "$REPO"

log() {
    echo "[$(date '+%F %T')] $*" >>"$LOG"
}

log "=== start ==="

# origin から最新を取得
if ! git fetch origin main >>"$LOG" 2>&1; then
    log "fetch failed; abort"
    exit 1
fi

# 現在ブランチが main でなければ skip
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    log "not on main (current=$CURRENT_BRANCH); skip"
    exit 0
fi

# index.html に手動の未コミット変更があれば skip
# （他のファイルの dirty は無視。LaunchAgent の仕事は index.html バナーだけ）
if ! git diff --quiet index.html || ! git diff --cached --quiet index.html; then
    log "index.html has pending manual changes; skip"
    exit 0
fi

# origin/main より遅れていれば ff-only で追従
LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
    if ! git merge --ff-only origin/main >>"$LOG" 2>&1; then
        log "cannot ff merge; skip (manual rebase needed)"
        exit 0
    fi
    log "ff merged to $(git rev-parse --short main)"
fi

# バナー更新スクリプト実行
if ! python3 tools/update_note_banner.py >>"$LOG" 2>&1; then
    log "update_note_banner.py failed"
    exit 1
fi

# index.html に差分がなければ終了
if git diff --quiet index.html; then
    log "no banner changes"
    exit 0
fi

# 差分あり → commit → push
git add index.html
git commit -m "banner: auto-refresh RSS feeds" >>"$LOG" 2>&1

# pre-push hook は対話プロンプトを要求するため --no-verify でバイパス
# （memory/feedback: 自動実行では --no-verify を使う方針）
if ! git push --no-verify origin main >>"$LOG" 2>&1; then
    log "push failed; leave local commit for manual intervention"
    exit 1
fi

NEW_SHA=$(git rev-parse --short main)
log "pushed $NEW_SHA — GitHub Actions will deploy"
