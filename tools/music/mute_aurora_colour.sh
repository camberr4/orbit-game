#!/bin/sh
# The "Other" stem of both Aurora songs is nothing but white-noise risers and sweeps. Replace those colour stems by silence of the same length
# (the game still loads the file, it just plays nothing). Run from the repo root.
for s in aurora aurora_b; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 www/audio/$s/colour.ogg)
  ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=48000:cl=stereo -t "$d" -c:a libvorbis -q:a 1 www/audio/$s/colour.ogg
  echo "$s colour -> silence ($d s)"
done
