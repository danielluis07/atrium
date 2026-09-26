#!/bin/sh
# pairs.sh <dir A> <label A> <dir B> <label B> <pairs> <out.jsonl> [frames.ts options...]
# Alternating whole-frame runs of two built checkouts (A B, B A, A B, ...), one server at a time, each run
# appending one line to <out.jsonl> (an error line if it failed, so the pairs stay aligned). Compare them
# with `bun scripts/perf/report.ts frames <out.jsonl> --a <label A> --b <label B>`.
#
#   sh scripts/perf/pairs.sh /c/tmp/atrium-main main . branch 7 scripts/perf/out/frames4.jsonl --select Lyngen
#   sh scripts/perf/pairs.sh /c/tmp/atrium-main main . branch 12 scripts/perf/out/frames6.jsonl --select Lyngen --rung 6
#
# Holds scripts/perf/out/drive.lock so a second driver can't run alongside. If Claude Code reaps the shell
# for low memory, the loop can outlive it: run scripts/perf/reap.sh before starting again.
set -u
[ $# -ge 6 ] || { echo "usage: pairs.sh <dir A> <label A> <dir B> <label B> <pairs> <out.jsonl> [frames.ts options...]" >&2; exit 2; }
root=$(cd "$(dirname "$0")/../.." && pwd)
dirA=$(cd "$1" && pwd); la=$2; dirB=$(cd "$3" && pwd); lb=$4; n=$5; out=$6; shift 6
cd "$root"
mkdir -p scripts/perf/out "$(dirname "$out")"
lock=scripts/perf/out/drive.lock
mkdir "$lock" 2>/dev/null || { echo "another driver holds $lock (scripts/perf/reap.sh clears a stale one)" >&2; exit 1; }
trap 'sh scripts/perf/serve.sh stop; rmdir "$lock"' EXIT

one() {
  dir=$1; label=$2; shift 2
  if sh scripts/perf/serve.sh start "$dir" && timeout 300 bun scripts/perf/frames.ts --label "$label" --out "$out" "$@"; then :
  else echo "{\"label\":\"$label\",\"error\":true}" >> "$out"; fi
  sh scripts/perf/serve.sh stop
}

for i in $(seq 1 "$n"); do
  if [ $((i % 2)) = 1 ]; then one "$dirA" "$la" "$@"; one "$dirB" "$lb" "$@"
  else one "$dirB" "$lb" "$@"; one "$dirA" "$la" "$@"; fi
  echo "pair $i of $n done"
done
