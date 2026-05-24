#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fix-git-push.sh — Fix "push rejected" by pulling remote changes first
#
# Run this when GitHub rejects your push because the remote has commits
# you don't have locally.
#
# Usage:
#   chmod +x fix-git-push.sh
#   ./fix-git-push.sh
#
# What it does:
#   1. Fetch the latest state from GitHub (read-only, safe)
#   2. Rebase your local commits on top of the remote commits
#   3. Push cleanly
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REMOTE="${1:-origin}"
BRANCH="${2:-main}"

echo ""
echo "┌─────────────────────────────────────────────────────┐"
echo "│  Virtual Bank — Git Push Fix                        │"
echo "└─────────────────────────────────────────────────────┘"
echo ""
echo "Remote : $REMOTE  ($(git remote get-url "$REMOTE"))"
echo "Branch : $BRANCH"
echo ""

# ── Step 1: Fetch (safe — no changes to your files) ──────────────────────────
echo "▶ Step 1/3 — Fetching latest from $REMOTE…"
git fetch "$REMOTE"
echo "  Done."
echo ""

# ── Step 2: Rebase ────────────────────────────────────────────────────────────
echo "▶ Step 2/3 — Rebasing your local commits on top of $REMOTE/$BRANCH…"
if git rebase "$REMOTE/$BRANCH"; then
  echo "  Rebase successful — no conflicts."
else
  echo ""
  echo "  ⚠  CONFLICT DETECTED."
  echo "  Open the conflicting file(s) listed above, fix the markers,"
  echo "  then run:"
  echo ""
  echo "      git add <file>          # mark each conflict as resolved"
  echo "      git rebase --continue   # continue the rebase"
  echo ""
  echo "  Or, to abandon and go back to where you were:"
  echo "      git rebase --abort"
  echo ""
  exit 1
fi
echo ""

# ── Step 3: Push ──────────────────────────────────────────────────────────────
echo "▶ Step 3/3 — Pushing to $REMOTE/$BRANCH…"
git push "$REMOTE" "$BRANCH"
echo ""
echo "✅  All done. Your push went through."
echo ""
