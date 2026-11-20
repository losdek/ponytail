# Rust speed

Measure first, change one thing, measure again, report both numbers.

Keep measuring cheap: size the test input so one run takes 1-5 seconds, build
release once and reuse the binary, one run before and one after (or
`hyperfine -r 3` if installed). A 300 MB benchmark on a busy machine costs
minutes and gives noisy numbers; a 20 MB one answers the same question.

## Step 0: is it a debug build?

The most common "Rust is slow" report is a debug build: `cargo run` and
`cargo test` without `--release` are often 10-100x slower. Ask how it is run,
or check the command the user quoted. If it was a debug build, time one
release run first. If that already fixes it, the answer is
`cargo run --release`, not new code.

If a slow debug build is the real need (tests, games, tools that must run in
dev), optimize only the dependencies:
`[profile.dev.package."*"] opt-level = 2`.

## Slow program

- Find where time goes: `perf record` / `cargo flamegraph`, `criterion` only
  if the crate already has benches. A quick `Instant::now()` print is fine;
  remove it after.
- Cheapest wins, in order:
  1. Release profile: `lto = "thin"`, `codegen-units = 1`. `panic = "abort"`
     only for binaries that never catch panics. `-C target-cpu=native` only for
     binaries that run on the machine that built them. Keep them only if they
     measurably help.
  2. Buffered I/O: `BufReader` / `BufWriter`, and lock stdout once
     (`let mut out = io::stdout().lock();`) instead of `println!` in a loop.
  3. Allocation in hot loops: `Vec::with_capacity`, reuse a buffer with
     `clear()`, no `collect()` in the middle of an iterator chain, no
     `format!` / `to_string()` per item, `&str` keys that borrow the input.
  4. Algorithm: `HashMap`/`HashSet` instead of a linear `contains`, one
     `entry()` instead of `contains_key` + `get` + `insert`, `sort_unstable`,
     a faster hasher only if a hasher crate is already a dependency
     (`rustc-hash`, `ahash`).
  5. Parallel: `par_iter()` if `rayon` is already a dependency, otherwise
     `std::thread::scope`.
- Do not reach for `unsafe`, SIMD intrinsics or a custom allocator unless the
  profile names that exact spot and the simpler wins are done.

## Slow builds (and slow agent loops)

- Find the cost: `cargo build --timings` (which crate takes how long) and
  `cargo tree -d` (duplicate crate versions).
- Smallest wins, in order:
  1. `cargo check` in the edit loop instead of `cargo build`.
  2. Drop unused dependencies and features: `default-features = false` plus
     only the features used (e.g. tokio `full` -> `rt-multi-thread`, `macros`).
  3. `[profile.dev] debug = "line-tables-only"`: smaller debug info, faster
     links, backtraces keep line numbers.
  4. Linker: Linux x86_64 links with `lld` by default since Rust 1.90. Try
     `mold` only if `--timings` shows linking dominates.
  5. Split a crate into a workspace only when one crate's check time hurts.
