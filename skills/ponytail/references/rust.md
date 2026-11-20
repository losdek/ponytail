# Ponytail for Rust

The ponytail rules, applied to Rust. Rust punishes guessing, and the compiler
is fast, free feedback: let it check you instead of reasoning about borrows or
API versions in your head.

Read only what the task needs:
- writing or fixing Rust: this file
- something is slow (the program, the build, the test suite): `rust-speed.md`
- reviewing or auditing Rust: `rust-review.md`

## Before you write

Open `Cargo.toml` first. It answers three questions the code depends on:
- `rust-version` (MSRV): the oldest compiler the code must build on. Use no
  std API newer than that (table below). No `rust-version`? Any stable API is fine.
- `[dependencies]` and `[workspace.dependencies]`: what you may use without adding.
- `[workspace] members`: other crates whose code you can reuse.

## The ladder, in Rust

1. **Does it need to exist?** Same as everywhere.
2. **In this crate or workspace?** `grep -rn "fn name" --include=*.rs`. Check
   `lib.rs` / `mod.rs` for `pub use` re-exports and the other members.
3. **std.** Iterator adaptors (`map`, `filter_map`, `fold`, `sum`, `zip`,
   `windows`, `chunks`, `max_by_key`), `?` with `Option`/`Result`
   combinators, `HashMap::entry`, `Vec::retain`, `sort_unstable_by_key`,
   `str::split_once`, `str::parse`, `fs::read_to_string`, `std::thread::scope`.
4. **A crate already in `Cargo.toml`.** Use it the way the crate already does.
   Never add `itertools`, `once_cell`, `lazy_static`, `anyhow`, `thiserror`,
   `regex` or `rayon` for a few lines std can do.
5. **One readable line**, then **the minimum code**.

### std APIs by the Rust version that added them

Check these against `rust-version` before you use them:

| Rust | API |
|---|---|
| 1.63 | `std::thread::scope`, `Mutex::new` / `RwLock::new` in a `static` (const) |
| 1.65 | `let ... else`, generic associated types |
| 1.70 | `OnceLock`, `Option::is_some_and`, `std::io::IsTerminal` |
| 1.73 | `u32::div_ceil` (unsigned ints) |
| 1.75 | `async fn` and `-> impl Trait` in traits |
| 1.76 | `Result::inspect_err`, `Option::inspect` |
| 1.80 | `LazyLock`, `LazyCell`, `Option::take_if` |
| 1.82 | `Option::is_none_or`, `std::iter::repeat_n` |

A global value on an old MSRV: before 1.70, a `static X: Mutex<Option<T>> =
Mutex::new(None);` works from 1.63 on, with no crate. Better still, pass the
value as an argument instead of making it global.

## Lean Rust

- No trait with one implementation, no generic with one concrete type, no
  `Box<dyn Trait>` where an enum or the concrete type works, no builder for a
  few fields, no newtype unless it guards an invariant.
- Take borrowed arguments (`&str`, `&[T]`, `&Path`), return owned values.
- Errors follow the crate: a binary on `anyhow` uses `?` and `.context(..)`; a
  library adds a variant to its existing error enum. No new error type for one
  case. `Box<dyn Error>` is fine for a small binary.
- `.clone()` to calm the borrow checker is fine outside hot loops. Do not
  reach for `Rc<RefCell<_>>` or `Arc<Mutex<_>>` unless the data is really shared.
- `unwrap()` / `expect("why")` are fine in tests and on invariants the code
  itself guarantees. On input from users, files, the network or env vars they
  are a crash, so they fall under "validation at trust boundaries".
- No `unsafe` to make code shorter or faster without a measurement. Every
  `unsafe` block gets a `// SAFETY:` line saying why it holds.
- The check for new logic is one `#[test]` in a `#[cfg(test)] mod tests` next to
  the code, matching how the crate already tests.
- Shortcut marker: `// shortcut: <the limit>, <when to upgrade>`.

## The working loop (fast and cheap)

- After each edit: `cargo check -q --message-format=short 2>&1 | head -30`
  (in a workspace add `-p <crate>`; add `--tests` once you touch tests).
  Fix the first error first; later ones are often caused by it. Unclear
  code: `rustc --explain E0502`.
- Need an API's exact signature? Read the crate source at the version in
  `Cargo.lock`: `~/.cargo/registry/src/*/<crate>-<version>/`. Do not guess
  signatures from memory; crates change between versions.
- Tests: `cargo test -q -p <crate> <name_filter>`, or `cargo nextest run` if
  the project uses nextest.
- Before you finish: `cargo clippy -q --all-targets -- -D warnings` when the
  project uses clippy (CI config, `clippy.toml`, `[lints]` in `Cargo.toml`).
  Run `cargo fmt` only if `cargo fmt --check` was clean before your change.
- Never `cargo clean`, `cargo update` or edit `Cargo.lock` beyond what your
  change needs.

## The answer

Say what changed and how you checked it (`cargo test` passed, the numbers you
measured). When the user has to do something, give the exact command
(`cargo run --release -- big.log`). Then the ponytail closing line: what you
skipped and any risk.
