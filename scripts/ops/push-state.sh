#!/usr/bin/env bash
# Push the state commit at HEAD, rebasing over state commits that concurrent jobs pushed meanwhile.
#
#   scripts/ops/push-state.sh <branch> [attempts]
#
# The watchdog's CriticalThread and ImpossibleBrief verify jobs both regenerate
# reports/daily-operations.{json,md} and push at the same time. The old loop
# (`git pull --rebase ... && git push` five times) stopped mid-rebase on a conflict in those
# generated files and then retried `git pull` with unmerged files, so every retry failed
# (run 38084156846, 2026-10-10). Here:
#   * a conflict only in generated reports takes the upstream copy and the report is rebuilt
#     afterwards from the merged state (REGEN_CMD, default `node daily-operations-report.js`);
#   * any other conflict aborts the rebase cleanly and the attempt is retried from a clean tree;
#   * channel state JSON keeps using the json-union merge driver (.gitattributes).
set -u
BRANCH="${1:?usage: push-state.sh <branch> [attempts]}"
ATTEMPTS="${2:-5}"
REGEN_CMD="${REGEN_CMD:-node daily-operations-report.js}"
SLEEP_UNIT="${PUSH_STATE_SLEEP:-5}"
GENERATED='^reports/daily-operations\.(json|md)$'

in_rebase() { [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; }

# Finish a stopped rebase if every conflict is in a generated report. Returns 1 otherwise.
resolve_generated() {
  while in_rebase; do
    conflicts="$(git diff --name-only --diff-filter=U)"
    if [ -n "$conflicts" ]; then
      if printf '%s\n' "$conflicts" | grep -Evq "$GENERATED"; then
        echo "push-state: conflict outside generated reports: $(printf '%s ' $conflicts)"
        return 1
      fi
      # During a rebase "ours" is the upstream side: keep it, the report is rebuilt below.
      printf '%s\n' "$conflicts" | while read -r f; do git checkout --ours -- "$f" && git add -- "$f"; done
      REGENERATE=1
    fi
    # A commit that only touched the reports becomes empty once upstream's copy is taken: skip it.
    GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || GIT_EDITOR=true git rebase --skip >/dev/null 2>&1 || return 1
  done
  return 0
}

for i in $(seq 1 "$ATTEMPTS"); do
  REGENERATE=0
  if ! git pull --rebase --autostash origin "$BRANCH"; then
    if ! resolve_generated; then
      in_rebase && git rebase --abort
      sleep $((i * SLEEP_UNIT)); continue
    fi
  fi
  if [ "$REGENERATE" = 1 ]; then
    sh -c "$REGEN_CMD" || true
    git add reports
    git diff --cached --quiet || git commit -q -m "chore: refresh daily operations report"
  fi
  if git push origin "HEAD:$BRANCH"; then exit 0; fi
  sleep $((i * SLEEP_UNIT))
done
echo "push-state: could not push to $BRANCH after $ATTEMPTS attempts"
exit 1
