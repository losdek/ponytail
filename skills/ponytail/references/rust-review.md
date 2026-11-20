# Rust review checklist (for ponytail-review and ponytail-audit)

Most of these are visible by reading. Build and run the code only to settle a
finding you really doubt; a panic on `parts[1]` needs no reproduction, and a
build per finding turns a one-minute review into five.

## Bugs and risk

- Panics on outside data: `unwrap`, `expect`, `[i]` indexing or `[a..b]`
  slicing (also on a non-char boundary in a `&str`). A panic in a thread drops
  that connection; in `main` or while holding a lock it takes the process
  down or poisons the lock for everyone.
- `as` casts that truncate or wrap (`i64 as usize` turns -1 into a huge
  number, `u64 as u32` drops bits); use `try_from`. Integer overflow wraps
  silently in release builds.
- Unbounded reads from the network: `lines()` / `read_to_string` with no size
  limit lets one client exhaust memory. Use `take(limit)`.
- `unsafe` without a `// SAFETY:` reason, or one whose invariant a caller can
  break.
- async:
  - a `std::sync::Mutex` (or `RefCell`) guard held across `.await`: the
    future is not `Send`, or the lock blocks the runtime thread;
  - blocking calls inside an async fn (`std::fs`, `std::thread::sleep`,
    `std::net`, heavy CPU) without `spawn_blocking`;
  - `tokio::spawn` whose `JoinHandle` is dropped, so its error or panic is lost;
  - `select!` branches that are not cancel-safe.
- Dropped errors: `let _ = ` on a `Result`, `.ok()` on a write.
- `RefCell` borrowed twice (panic), `Rc` cycles (leak).

## Lean

Trait with one impl, generic with one type, `Arc<Mutex<_>>` never shared
across threads, `clone()` in a hot loop, `collect::<Vec<_>>()` only to iterate
once, `pub` items nothing outside the module uses, Cargo features or
dependencies nothing uses.
