#!/bin/bash
# Rebuilds every athlete (hi and lo) into apps/web/public/sinverse-cricket/athletes.
# BLENDER points at a Blender with MPFB 2 and the CC0 asset packs installed.
set -e
BLENDER="${BLENDER:-blender}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../apps/web/public/sinverse-cricket/athletes"
w() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
for spec in "$HERE"/athletes/athlete-*.json; do
  name="$(basename "$spec" .json)"
  for lod in hi lo; do
    suffix=""; [ "$lod" = lo ] && suffix="-lo"
    "$BLENDER" -b --python-exit-code 1 -P "$(w "$HERE/build_athlete.py")" -- "$(w "$spec")" "$(w "$OUT/$name$suffix.glb")" "$lod" 2>&1 | grep -E "ATHLETE_REPORT|Error" | sed "s/^/$name $lod: /" | cut -c1-400
  done
done
