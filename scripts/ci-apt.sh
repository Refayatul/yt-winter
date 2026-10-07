#!/usr/bin/env bash
# CI package install that cannot hang a runner for hours. The Azure Ubuntu
# mirror occasionally stalls `apt-get update`; with a 180-minute job timeout
# and one shared concurrency group, a single stall blocked every channel's
# scheduled run. Each attempt is bounded, mirror requests time out, and a stall
# is retried up to three times.
#
# Usage: bash scripts/ci-apt.sh [apt-get install arguments...]
set -u
APT_OPTS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o DPkg::Lock::Timeout=180)
for attempt in 1 2 3; do
  if timeout 240 sudo apt-get "${APT_OPTS[@]}" update -q \
    && timeout 900 sudo DEBIAN_FRONTEND=noninteractive apt-get "${APT_OPTS[@]}" install -y -q "$@"; then
    exit 0
  fi
  echo "::warning::apt attempt ${attempt} failed or timed out; retrying"
  sleep $((attempt * 15))
done
echo "::error::apt install failed after 3 attempts"
exit 1
