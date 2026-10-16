#!/usr/bin/env bash
# FR premium comparison clips (offline review only).
#   scripts/fr-premium/compare.sh <A.mp4> <B.mp4> <C.mp4> <outDir>
# side-by-side: 1920x1080, three 9:16 panels, audio = C only (labelled); A and B hold an "ENDED" card after they finish.
# first-3-seconds: A, B, C first 3 s in sequence at 1080x1920, each with its OWN audio, then a 3 s silent triptych.
set -euo pipefail
A="$1"; B="$2"; C="$3"; OUT="$4"
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
DC=$(dur "$C")
lab() { echo "drawtext=fontfile='$FONT':text='$1':fontcolor=white:fontsize=$2:x=(w-tw)/2:y=$3"; }
panel() { # input label, title, sub
  echo "[$1:v]fps=30,scale=540:960,setsar=1,tpad=stop_mode=add:stop_duration=60:color=0x0b0e13,trim=0:${DC},$(lab "ENDED" 40 460):enable='gte(t,$4)',pad=600:1080:30:90:color=0x0b0e13,$(lab "$2" 34 22),$(lab "$3" 22 1052)[$5]"
}
DA=$(dur "$A"); DB=$(dur "$B")
ffmpeg -v error -y -i "$A" -i "$B" -i "$C" -filter_complex \
"$(panel 0 'A  ORIGINAL (muted)' 'YouTube transcode of bqTpdauhlHo' "$DA" a);\
$(panel 1 'B  CRAFT V2 (muted)' 'same script and footage, SHORTS_CRAFT_V2' "$DB" b);\
$(panel 2 'C  PREMIUM V1 (audio on)' 'new script, NASA stills, explanatory animation' 99 c);\
[a][b][c]hstack=inputs=3,pad=1920:1080:60:0:color=0x0b0e13[v]" \
  -map "[v]" -map 2:a -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -t "$DC" -movflags +faststart "$OUT/challenger-side-by-side.mp4"

seg() { # input, label -> 3 s at 1080x1920 with label band, own audio normalised to 48k stereo
  ffmpeg -v error -y -t 3 -i "$1" -filter_complex "[0:v]fps=30,scale=1080:1920,setsar=1,drawbox=y=1780:w=iw:h=140:color=black@0.72:t=fill,$(lab "$2" 46 1825)[v];[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:3[a]" \
    -map "[v]" -map "[a]" -t 3 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k "$3"
}
T=$(mktemp -d)
seg "$A" "A  ORIGINAL  -  first 3 s" "$T/a.mp4"; seg "$B" "B  CRAFT V2  -  first 3 s" "$T/b.mp4"; seg "$C" "C  PREMIUM V1  -  first 3 s" "$T/c.mp4"
ffmpeg -v error -y -t 3 -i "$A" -t 3 -i "$B" -t 3 -i "$C" -f lavfi -t 3 -i anullsrc=r=48000:cl=stereo -filter_complex \
"[0:v]fps=30,scale=360:640,setsar=1[x];[1:v]fps=30,scale=360:640,setsar=1[y];[2:v]fps=30,scale=360:640,setsar=1[z];[x][y][z]hstack=inputs=3,pad=1080:1920:0:560:color=0x0b0e13,$(lab 'A           B           C' 44 470),$(lab 'side by side, silent' 32 1300)[v]" \
  -map "[v]" -map 3:a -t 3 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k "$T/t.mp4"
printf "file '%s'\n" "$T/a.mp4" "$T/b.mp4" "$T/c.mp4" "$T/t.mp4" > "$T/l.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$T/l.txt" -c copy -movflags +faststart "$OUT/challenger-first-3-seconds-comparison.mp4"
rm -rf "$T"
echo "ok: $OUT/challenger-side-by-side.mp4 $OUT/challenger-first-3-seconds-comparison.mp4"
