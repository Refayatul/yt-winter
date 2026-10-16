#!/usr/bin/env bash
# Scene-level comparison for a Phase 1 prototype (offline only).
#   compare-scene.sh <v2.mp4> <proto.video.mp4> <from> <to> <name> <outdir>
# Writes, for the film-time window [from, to]:
#   <name>.mp4            the prototype with V2's own narration/mix for that window (audio is not re-made)
#   <name>-v2.mp4         the same window cut from V2
#   <name>-vs-v2.mp4      side by side at phone scale (V2 left, prototype right), prototype audio
#   <name>-contact.png    before/after contact sheet, 2 frames per second (top row V2, bottom row prototype)
set -euo pipefail
V2=$1; P=$2; A=$3; B=$4; N=$5; O=$6; mkdir -p "$O"
D=$(python3 -c "print(round($B-$A,3))")
ffmpeg -v error -y -ss "$A" -i "$V2" -t "$D" -map 0:v -map 0:a -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k "$O/$N-v2.mp4"
ffmpeg -v error -y -i "$P" -i "$O/$N-v2.mp4" -map 0:v -map 1:a -c:v copy -c:a copy -shortest -movflags +faststart "$O/$N.mp4"
FONT=/System/Library/Fonts/Supplemental/Arial.ttf
ffmpeg -v error -y -i "$O/$N-v2.mp4" -i "$O/$N.mp4" -filter_complex \
  "[0:v]scale=540:960,drawtext=fontfile=$FONT:text='V2':x=16:y=16:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.6[a];[1:v]scale=540:960,drawtext=fontfile=$FONT:text='Phase 1':x=16:y=16:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.6[b];[a][b]hstack" \
  -map 1:a -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a copy -movflags +faststart "$O/$N-vs-v2.mp4"
COLS=$(python3 -c "import math;print(max(1,math.ceil($D*2)))")
for X in v2 p1; do
  SRC="$O/$N-v2.mp4"; [ "$X" = p1 ] && SRC="$O/$N.mp4"
  ffmpeg -v error -y -i "$SRC" -vf "fps=2,scale=180:320,drawtext=fontfile=$FONT:text='%{pts\:hms}':x=4:y=4:fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${COLS}x1" -frames:v 1 "$O/.$N-$X.png"
done
ffmpeg -v error -y -i "$O/.$N-v2.png" -i "$O/.$N-p1.png" -filter_complex vstack "$O/$N-contact.png"; rm -f "$O/.$N-v2.png" "$O/.$N-p1.png"
echo "$N: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$O/$N.mp4") s -> $O"
