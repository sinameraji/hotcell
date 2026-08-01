# Harness

Scripts that run dax's OpenCode provider benchmark on hotcell Firecracker microVMs
and record the results. See `../README.md` for how to run them and the disclosures.

- **`bench-suite.sh`** — the ladder runner. Takes `CONFIGS` (a list of `MEM:CPU` guest
  configs), `REPS`, `REGION`, `BENCH_IMAGE`, and optionally `WARM_POOL_DEPTH`; creates a
  fresh microVM per run (cold, no reuse),
  samples peak guest memory, and classifies each outcome `PASS` / `OOM` / `INSTALL_FLAKE`
  / `ADMISSION` / `OTHER`. Writes full raw stdout per run + a `summary.tsv`. Per-exec and
  per-create timeouts keep one stalled guest from blocking the whole run. When
  `WARM_POOL_DEPTH` is set, the suite waits for that many ready spares and records the
  capacity response before starting the ladder.
- **`runbench.sh`** — guest-side wrapper: runs the benchmark while sampling
  `/proc/meminfo` `MemAvailable` every 0.1 s and records cgroup memory events, so
  the peak working set and OOM cause are measured.
- **`bench-pauseresume.sh`** — Part B: the pause/resume fidelity contract (not run yet).
- **`bench-spike.sh`** — Part C: the thundering-herd / breaking-point test (not run yet).

Every published number traces back to a raw file under `../raw/<host>/`.

## Prepared image

Build `images/opencode-benchmark/Dockerfile` for an Ubuntu 24.04 image with the
Node 24.14.1 toolchain prerequisites used by the upstream script. Use it as
`BENCH_IMAGE` for a prepared-image comparison. The upstream script is still fetched
and run unmodified, so cold and prepared-image results must remain separate rows.

Set `TURBO_CONCURRENCY` in the guest wrapper to bound concurrent TypeScript workers.
The default remains unlimited for baseline comparability.
