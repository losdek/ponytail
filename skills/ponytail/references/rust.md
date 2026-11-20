# Ponytail for Rust

The ponytail rules, applied to Rust. Read this before you write, fix, review or
speed up Rust code. Rust punishes guessing: the compiler is fast feedback and
free, so let it check you instead of reasoning about borrows in your head.

## The ladder, in Rust

1. **Does it need to exist?** Same as everywhere.
2. **In this crate or workspace?** Grep for it (`grep -rn "fn name" --include=*.rs`).
   Check `lib.rs` / `mod.rs` for `pub use` re-exports and the other workspace
   members before you write a helper.
3. **std.** Iterator adaptors (`map`, `filter_map`, `fold`, `sum`, `zip`,
   `windows`, `chunks`, `rev`, `max_by_key`), `?` with `Option`/`Result`
   combinators, `HashMap::entry`, `Vec::retain`, `dedup`, `sort_unstable_by_key`,
   `str::split_once`, `str::parse`, `fs::read_to_string`, `std::thread::scope`,
   `OnceLock` / `LazyLock`, `Instant`.
4. **A crate already in `Cargo.toml`.** Use it the way the crate already does.
   Never add `itertools`, `once_cell`, `lazy_static`, `anyhow`, `thiserror`,
   `regex` or `rayon` for a few lines std can do. Respect `rust-version` and
   `edition` in `Cargo.toml`: no API newer than the MSRV.
5. **One readable line**, then **the minimum code**.

## Lean Rust

- No trait with one implementation, no generic with one concrete type, no
  `Box<dyn Trait>` where an enum or the concrete type works, no builder for a
  few fields, no newtype unless it guards an invariant.
- Take borrowed arguments (`&str`, `&[T]`, `&Path`), return owned values. Do
  not convert between `String`/`&str`/`PathBuf` more than the call sites need.
- Errors follow the crate: a binary on `anyhow` uses `?` and `.context(..)`; a
  library adds a variant to its existing error enum. No new error type for one
  case. `Box<dyn Error>` is fine for a small binary.
- `.clone()` to calm the borrow checker is fine outside hot loops. Inside one,
  restructure the borrow. Do not reach for `Rc<RefCell<_>>` or `Arc<Mutex<_>>`
  unless the data is really shared.
- `unwrap()` / `expect("why")` are fine in tests and on invariants the code
  itself guarantees. On input from users, files, the network or env vars they
  are a crash, so they fall under "validation at trust boundaries".
- No `unsafe` to make code shorter or faster without a measurement. Every
  `unsafe` block gets a `// SAFETY:` line saying why it holds.
- The check for new logic is one `#[test]` in a `#[cfg(test)] mod tests` next to
  the code, matching how the crate already tests.
- Shortcut marker: `// shortcut: <the limit>, <when to upgrade>`.

## The working loop (fast and cheap)

- After each edit run `cargo check` (in a workspace, `cargo check -p <crate>`),
  not `cargo build`. Build or run `--release` only when you need the binary or
  are measuring speed.
- Keep compiler output small: `cargo check --message-format=short 2>&1 | head -40`.
  Fix the first error first; later ones are often caused by it. Unclear error
  code: `rustc --explain E0502`.
- Need an API's exact signature? Read the crate source at the version in
  `Cargo.lock`: `~/.cargo/registry/src/*/<crate>-<version>/`. Do not guess
  signatures from memory; crates change between versions.
- Tests: `cargo test -q -p <crate> <name_filter>`, or `cargo nextest run` if
  the project uses nextest.
- Before you finish: `cargo clippy --all-targets -q -- -D warnings` when the
  project uses clippy (CI config, `clippy.toml`, `[lints]` in `Cargo.toml`).
  Run `cargo fmt` only if `cargo fmt --check` was clean before your change,
  otherwise it rewrites files you did not touch.
- Never `cargo clean`, `cargo update` or edit `Cargo.lock` beyond what your
  change needs: a clean rebuild costs minutes, an update changes every user's
  dependencies.

## Speed

Measure first, change one thing, measure again, report both numbers.

### Slow builds (and slow agent loops)

- Find the cost: `cargo build --timings` (opens a report of which crate takes
  how long) and `cargo tree -d` (duplicate crate versions).
- Smallest wins, in order:
  1. Use `cargo check` in the loop instead of `cargo build` (above).
  2. Drop unused dependencies and features: `default-features = false` plus
     only the features used (e.g. tokio `full` -> `rt-multi-thread`, `macros`).
  3. `[profile.dev] debug = "line-tables-only"`: smaller debug info, faster
     links, backtraces still have line numbers.
  4. Linker: Linux x86_64 already links with `lld` by default since Rust 1.90.
     Try `mold` only if `--timings` shows linking dominates.
  5. Split a crate into a workspace only when one crate's check time hurts.
- Slow debug binary (tests or games too slow to run)? Optimize only the
  dependencies: `[profile.dev.package."*"] opt-level = 2`.

### Slow program

- First make sure it is a release build: debug builds are often 10-100x
  slower, and that is most "Rust is slow" reports.
- Measure: `hyperfine` for a whole command, `perf record` / `cargo flamegraph`
  for where time goes, `criterion` only if the crate already has benches. A
  quick `Instant::now()` print is fine; remove it after.
- Cheapest wins, in order:
  1. Release profile: `lto = "thin"`, `codegen-units = 1`. `panic = "abort"`
     only for binaries that never catch panics. `-C target-cpu=native` only for
     binaries that run on the machine that built them.
  2. Buffered I/O: `BufReader` / `BufWriter`, and lock stdout once
     (`let mut out = io::stdout().lock();`) instead of `println!` in a loop.
  3. Allocation in hot loops: `Vec::with_capacity`, reuse a buffer with
     `clear()`, no `collect()` in the middle of an iterator chain, no
     `format!` / `to_string()` per item, `&str` instead of `String` keys
     where lifetimes allow.
  4. Algorithm: `HashMap`/`HashSet` instead of a linear `contains`,
     `sort_unstable`, a faster hasher only if a hasher crate is already a
     dependency (`rustc-hash`, `ahash`).
  5. Parallel: `par_iter()` if `rayon` is already a dependency, otherwise
     `std::thread::scope`.
- Do not reach for `unsafe`, SIMD intrinsics or a custom allocator unless the
  profile names that exact spot and the simpler wins are done.

## Review checklist (for ponytail-review and ponytail-audit)

Bugs and risk:
- `unwrap`, `expect`, `[i]` indexing or slicing on outside data: a panic, so a
  crash (or a denial of service on a server).
- `as` casts that truncate or wrap (`u64 as u32`, `i64 as usize`); use
  `try_from`. Integer overflow wraps silently in release builds.
- `unsafe` without a `// SAFETY:` reason, or one whose invariant a caller can
  break.
- async: blocking calls (`std::fs`, `std::thread::sleep`, heavy CPU) inside an
  async fn without `spawn_blocking`; a `std::sync::Mutex` guard held across
  `.await`; spawned tasks whose errors nobody reads.
- Dropped errors: `let _ = ` on a `Result`, `.ok()` on a write.
- `RefCell` borrowed twice (panic), `Rc` cycles (leak).

Lean:
- Trait with one impl, generic with one type, `Arc<Mutex<_>>` never shared
  across threads, `clone()` in a hot loop, `collect::<Vec<_>>()` only to
  iterate once, `pub` items nothing outside the module uses, Cargo features or
  dependencies nothing uses.
