#!/bin/bash
set -euo pipefail
recovery="$1"
base="$recovery/consumer"
repo=/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6
mount --make-rprivate /
mount --bind "$recovery/source" "$repo"
mount -o remount,bind,ro "$repo"
mount --bind /mnt/nfl-engine-profiles/runtime-restored-20260923-attempt2 /opt/nfl-runtime/env
mount -o remount,bind,ro /opt/nfl-runtime/env
cd "$repo"
exec runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B "$recovery/restored_consumer.py" "$base"
