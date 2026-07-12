#!/usr/bin/env bash
# Extract a scroll-scrub frame sequence from the stitched brain fly-through.
# ffmpeg here lacks libwebp, so: ffmpeg → PNG, then ImageMagick → WebP.
set -euo pipefail

CLIP="${1:-public/brain-flythrough.mp4}"
OUT="public/frames"
TMP="$(mktemp -d)"
FPS="${FPS:-8}"       # 20s film * 8 = ~160 frames
WIDTH="${WIDTH:-1600}"
QUALITY="${QUALITY:-80}"

echo "→ extracting PNG frames from $CLIP at ${FPS}fps, ${WIDTH}px"
ffmpeg -hide_banner -loglevel error -i "$CLIP" \
  -vf "fps=${FPS},scale=${WIDTH}:-2:flags=lanczos" \
  "$TMP/f_%03d.png"

rm -rf "$OUT"
mkdir -p "$OUT"

echo "→ converting to WebP q${QUALITY} with ImageMagick"
i=0
for png in "$TMP"/f_*.png; do
  i=$((i+1))
  printf -v name "f_%03d.webp" "$i"
  magick "$png" -quality "$QUALITY" "$OUT/$name"
done

rm -rf "$TMP"
COUNT=$(ls "$OUT"/*.webp | wc -l | tr -d ' ')
TOTAL=$(du -sh "$OUT" | cut -f1)
echo "✓ $COUNT frames → $OUT ($TOTAL total)"
echo "  Set FRAME_COUNT=$COUNT in components/BrainJourney.tsx"
