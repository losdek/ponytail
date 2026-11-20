#!/usr/bin/env node
// ponytail — codebase map: what already exists, so "reuse first" costs no search.
//
// Lists the top-level functions, classes and exports of the project's source files, one line
// per folder, inside a character budget. No model, no dependencies: `git ls-files` (or a short
// directory walk) plus a regex per language. Tests, generated and vendored files are skipped;
// shared code (utils, lib, services, components, hooks) is listed first when the budget is tight.
//
// ponytail: regex, not a parser. Misses nested or dynamic definitions; a tree-sitter index is the
// upgrade if the map ever needs to be exact.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BUDGET = Number(process.env.PONYTAIL_MAP_CHARS || 2000);
const MAX_FILES = 4000;
const SRC = /\.(py|js|jsx|mjs|cjs|ts|tsx|go|rs|rb|java|kt|php|swift|cs)$/;
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|vendor|venv|\.venv|__pycache__|coverage|\.next|target|benches|migrations|versions|fixtures|tests?|__tests__|spec)(\/|$)/;
const SKIP_FILE = /(^|\/)(test_[^/]*|[^/]*(_test|\.test|\.spec|\.gen|\.min|\.d)\.[a-z]+)$/;
const NAME = /^(?:type\s+)?(?:[\w$]+\s+as\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)$/;
const SAFE_PATH = /^[\w.@+$()[\]\/-]+$/;
const SHARED = /(util|helper|lib|common|shared|service|component|hook|core|model|schema|api)/i;

const PATTERNS = {
  py: [/^(?:async\s+)?def\s+([A-Za-z]\w*)/gm, /^class\s+([A-Za-z]\w*)/gm],
  js: [/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
       /^export\s*\{([^}]*)\}/gm],
  go: [/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm, /^type\s+([A-Z]\w*)/gm],
  // Rust: `pub` and `pub(crate)` items with any qualifiers (const, async, unsafe, extern "C"), plus
  // exported macros. Indented items (impl methods, inline test modules) stay out on purpose.
  rs: [/^pub(?:\([^)\n]*\))?\s+(?:(?:default|const|async|unsafe|extern\s+"[\w-]*")\s+)*(?:fn|struct|enum|trait|type|union)\s+(\w+)/gm,
       /^#\[macro_export\]\s*(?:#\[[^\]\n]*\]\s*)*macro_rules!\s*(\w+)/gm],
  rb: [/^\s*(?:def|class|module)\s+([A-Za-z][\w.]*)/gm],
  jvm: [/^\s*(?:public\s+)?(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+(\w+)/gm],
};
const LANG = { py: 'py', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', go: 'go', rs: 'rs',
               rb: 'rb', java: 'jvm', kt: 'jvm', swift: 'jvm', cs: 'jvm', php: 'jvm' };

function listFiles(root) {
  try {
    // 64 MiB: in repos with many tracked files `git ls-files` overflows Node's 1 MiB
    // default, and the catch below reads that as "not a git repo" and falls back to a
    // walk that ignores .gitignore. The list is capped at MAX_FILES * 5 lines anyway.
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, maxBuffer: 64 * 1024 * 1024 })
      .split('\n').filter(Boolean).slice(0, MAX_FILES * 5);
    if (tracked.length) return tracked;
  } catch (e) { /* not a git repo: walk below */ }
  {
    // No git, or an untracked folder inside a parent repo (git ls-files is then empty, not an error).
    const out = [];
    (function walk(dir, depth) {
      if (depth > 6 || out.length > MAX_FILES * 5) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith('.')) continue;
        const rel = path.relative(root, path.join(dir, ent.name)).replace(/\\/g, '/');
        if (ent.isDirectory()) { if (!SKIP_DIR.test(rel + '/')) walk(path.join(dir, ent.name), depth + 1); }
        else out.push(rel);
      }
    })(root, 0);
    return out;
  }
}

function namesIn(file, text) {
  const lang = LANG[path.extname(file).slice(1)];
  const names = [];
  for (const re of PATTERNS[lang] || []) {
    for (const m of text.matchAll(re)) {
      for (const n of m[1].split(',').map((s) => (s.trim().match(NAME) || [])[1]).filter(Boolean)) {
        if (!n.startsWith('_') && !names.includes(n)) names.push(n);
      }
    }
  }
  return names;
}

// Crates the Rust project already depends on: rung 4 of the ladder ("an installed dependency")
// without opening Cargo.toml. Only [dependencies], [workspace.dependencies] and target-specific
// ones; dev- and build-dependencies are not usable from the main code.
// shortcut: line-based TOML scan, misses inline-table section names split over lines; a TOML parser
// is the upgrade if a real Cargo.toml ever slips through.
function cargoDeps(root, files) {
  const deps = new Set();
  for (const f of files.filter((f) => /(^|\/)Cargo\.toml$/.test(f) && SAFE_PATH.test(f) && !SKIP_DIR.test(f)).slice(0, 50)) {
    let text;
    try {
      if (!fs.lstatSync(path.join(root, f)).isFile()) continue;
      text = fs.readFileSync(path.join(root, f), 'utf8').slice(0, 65536);
    } catch (e) { continue; }
    let inDeps = false;
    for (const line of text.split(/\r?\n/)) {
      const sec = line.match(/^\s*\[([^\]]+)\]/);
      if (sec) {
        const t = sec[1].trim().match(/^(?:workspace\.|target\..+\.)?dependencies(?:\.([A-Za-z0-9_-]+))?$/);
        inDeps = Boolean(t) && !t[1];
        if (t && t[1]) deps.add(t[1]);
        continue;
      }
      const m = inDeps && line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
      if (m) deps.add(m[1]);
    }
  }
  return [...deps];
}

const RUST_GUIDE = path.join(__dirname, '..', 'skills', 'ponytail', 'references', 'rust.md');

function rustHeader(root, files) {
  if (!files.some((f) => /(^|\/)Cargo\.toml$/.test(f))) return '';
  const deps = cargoDeps(root, files);
  let out = '';
  if (fs.existsSync(RUST_GUIDE) && !/[\r\n]/.test(RUST_GUIDE)) {
    out += `Rust project: read ${RUST_GUIDE} before writing, fixing or speeding up Rust.\n`;
  }
  if (deps.length) {
    out += `Crates already in Cargo.toml (use these before adding one): ${deps.slice(0, 40).join(', ')}` +
      `${deps.length > 40 ? ', ...' : ''}\n`;
  }
  return out;
}

function buildMap(root = process.cwd()) {
  const all = listFiles(root);
  const rust = rustHeader(root, all);
  const files = all
    .filter((f) => SAFE_PATH.test(f) && SRC.test(f) && !SKIP_DIR.test(f) && !SKIP_FILE.test(f))
    .slice(0, MAX_FILES)
    .sort((a, b) => (SHARED.test(b) - SHARED.test(a)) || a.localeCompare(b));
  // One line per directory: names are enough to know something exists; grep finds the file.
  const dirs = new Map();
  for (const f of files) {
    let text;
    try {
      if (!fs.lstatSync(path.join(root, f)).isFile()) continue;
      text = fs.readFileSync(path.join(root, f), 'utf8').slice(0, 65536);
    } catch (e) { continue; }
    const names = namesIn(f, text);
    if (!names.length) continue;
    const dir = path.dirname(f) === '.' ? '.' : path.dirname(f);
    dirs.set(dir, [...(dirs.get(dir) || []), names]);
  }
  const lines = [];
  let used = rust.length;
  let skipped = 0;
  for (const [dir, perFile] of dirs) {
    // The first exports say what a file is; in a folder of many files (a UI kit) one name each.
    const names = [...new Set(perFile.flatMap((n) => n.slice(0, perFile.length > 8 ? 1 : 3)))];
    const line = `${dir}/: ${names.slice(0, 30).join(', ')}${names.length > 30 ? ', ...' : ''}`;
    if (used + line.length > BUDGET) { skipped++; continue; }
    lines.push(line);
    used += line.length + 1;
  }
  if (!lines.length) return rust.trimEnd();
  return rust + 'Codebase map (what already exists; reuse it, read a file only when you need its details):\n' +
    lines.join('\n') + (skipped ? `\n(${skipped} more folders not listed)` : '');
}

module.exports = { buildMap };

if (require.main === module) process.stdout.write(buildMap(process.argv[2] || process.cwd()) + '\n');
