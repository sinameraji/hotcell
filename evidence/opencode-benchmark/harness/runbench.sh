#!/bin/bash
# Guest-side wrapper: run dax's provider-benchmark.sh while sampling whole-guest
# memory so we can report the true peak working set (the floor for this workload)
# — measured, not guessed. tsgo is a Go binary whose heap tracks the working set,
# so this peak is stable across RAM sizes and pins the memory floor from one run.
( while :; do awk '/MemAvailable/{print $2}' /proc/meminfo; sleep 0.1; done ) > /tmp/mem.log 2>/dev/null &
S=$!
CGROUP_MEMORY="/sys/fs/cgroup"
if [ -f "$CGROUP_MEMORY/memory.current" ]; then
  ( while :; do
      set -- $(cat "$CGROUP_MEMORY/memory.events" 2>/dev/null | awk '$1=="oom"{oom=$2} $1=="oom_kill"{kill=$2} END{print oom+0, kill+0}')
      printf '%s\t%s\t%s\t%s\n' \
        "$(date +%s%3N)" \
        "$(cat "$CGROUP_MEMORY/memory.current" 2>/dev/null || echo 0)" \
        "${1:-0}" "${2:-0}"
      sleep 0.1
    done ) > /tmp/cgroup-memory.log 2>/dev/null &
  CS=$!
else
  CS=""
fi
cd /tmp
BENCH_PROVIDER="${BENCH_PROVIDER:-hotcell}" BENCH_REGION="${BENCH_REGION:-unknown}" \
  TURBO_CONCURRENCY="${TURBO_CONCURRENCY:-}" \
  BENCH_ROOT=/workspace/bench bash /tmp/pb.sh 2>&1
RC=$?
kill "$S" 2>/dev/null
if [ -n "$CS" ]; then
  kill "$CS" 2>/dev/null
  awk '
    BEGIN { max=0; oom=0; kill=0 }
    { if ($2 > max) max=$2; if ($3 > oom) oom=$3; if ($4 > kill) kill=$4 }
    END { printf "BENCH_MEM\tcgroup_peak_current_bytes\t%d\nBENCH_MEM\tcgroup_oom\t%d\nBENCH_MEM\tcgroup_oom_kill\t%d\n", max, oom, kill }
  ' /tmp/cgroup-memory.log 2>/dev/null
fi
TOTAL=$(awk '/MemTotal/{print $2}' /proc/meminfo)
MIN=$(sort -n /tmp/mem.log 2>/dev/null | head -1)
[ -z "$MIN" ] && MIN=$TOTAL
echo "BENCH_MEM	total_kib	$TOTAL"
echo "BENCH_MEM	min_avail_kib	$MIN"
echo "BENCH_MEM	peak_used_kib	$((TOTAL - MIN))"
awk -v x="$((TOTAL - MIN))" 'BEGIN{printf "BENCH_MEM\tpeak_used_gib\t%.2f\n", x/1048576}'
exit "$RC"
