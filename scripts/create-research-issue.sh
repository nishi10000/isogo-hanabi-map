#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/create-research-issue.sh [owner/repo]
# Hermes等で調査した内容を research/candidates.md に追記した後、確認用Issueを作る補助スクリプト。

repo="${1:-}"
if [[ -z "$repo" ]]; then
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
fi

today=$(date -u +%F)
body=$(mktemp)
{
  echo "# 定期調査結果 $today"
  echo
  echo "このIssueは直接JSONへ反映せず、人間確認のために作成します。"
  echo
  echo "## Hermes調査プロンプト"
  cat research/research-prompt.md
  echo
  echo "## 現在の候補メモ"
  cat research/candidates.md
} > "$body"

gh issue create --repo "$repo" --title "定期調査 $today: 磯子周辺 花火観覧候補" --label "research,scheduled-research" --body-file "$body"
rm -f "$body"
