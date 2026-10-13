#!/usr/bin/env bash
# Kokoro-82M model files for the offline fallback voice (lib/shorts-tts.js), verified before use.
#
#   bash scripts/kokoro-model.sh [dir]        default dir: kokoro-model
#
# Every file must match scripts/kokoro-model.sha256. A file that is missing or does not match
# (including one restored from a cache) is deleted and downloaded again to a temporary name. It is
# moved into place only after its checksum passes. If any file still fails, every model file is
# removed and the script exits 1, so a later cache-save step finds nothing invalid to persist.
set -euo pipefail

DIR="${1:-kokoro-model}"
MANIFEST="${KOKORO_MANIFEST:-$(dirname "$0")/kokoro-model.sha256}"
BASE_URL="${KOKORO_BASE_URL:-https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0}"

mkdir -p "$DIR"
matches() { [ -s "$2" ] && [ "$(sha256sum "$2" | cut -d' ' -f1)" = "$1" ]; }

failed=0
while read -r sum name; do
  [ -n "$sum" ] || continue
  file="$DIR/$name"
  if matches "$sum" "$file"; then echo "kokoro: $name verified"; continue; fi
  [ -e "$file" ] && echo "kokoro: $name failed verification; downloading again"
  rm -f "$file" "$file.part"
  if curl -fL --retry 3 -sS -o "$file.part" "$BASE_URL/$name" && matches "$sum" "$file.part"; then
    mv "$file.part" "$file"
    echo "kokoro: $name downloaded and verified"
  else
    rm -f "$file.part"
    echo "::error::kokoro: $name could not be downloaded with the pinned sha256"
    failed=1
  fi
done < "$MANIFEST"

if [ "$failed" -ne 0 ]; then
  while read -r _ name; do [ -n "$name" ] && rm -f "$DIR/$name"; done < "$MANIFEST"
  exit 1
fi
