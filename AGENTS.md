# AGENTS.md

Notes for OpenCode sessions working in this repo. The app is a Windows-only
Tauri 2 port of the Linux Foliate e-book reader: a thin Rust shell + a fat
WebView2 frontend that reuses the upstream `foliate-js` reading engine
unchanged. Read `README.md` for product context before editing.

## Toolchain & commands

- The release build path is **CI-only**. There is no local Rust toolchain on
  the maintainer machine (no `cargo` / `rustc` / `rustup` / `conda`). Any
  Rust-side change is verified by GitHub Actions on `windows-latest`; do not
  attempt `cargo check` / `npm run dev` / `npm run build` locally unless you
  have explicitly installed Rust + WebView2. The inherited conda-instruction
  below was upstream's pattern and is retained only as a fallback for
  contributors who keep a working Rust env.
- (`cargo check` works on Linux if a Rust toolchain is present, because every
  Windows API call in `lib.rs` is gated by `cfg(target_os = "windows")` with
  non-Windows stubs.)
- If you do maintain a local env: conda env `foliate` upstream convention.
  Activate before any Rust command: `conda activate foliate`. Do **not**
  install Rust deps into Conda `base`.
- Node 24. `package-lock.json` is committed; use `npm ci`, not `npm install`.
  Only `npm run web:build` and `npm run web:dev` are runnable on the
  maintainer machine today.
- Dev server port `1420` is fixed (`vite.config.js` `strictPort`). Tauri dev
  hard-codes `http://127.0.0.1:1420`; changing the port breaks `npm run dev`.

Common commands (from repo root):

```
npm run web:dev       # vite dev server only (browser, no Tauri)
npm run web:build     # build frontend to ../dist
npm run dev          # full Tauri app (needs Windows or Linux WebKitGTK)
npm run build        # tauri build --no-bundle  (release exe, no installer)
npm run check        # web:build + cargo check (src-tauri/Cargo.toml)
```

There is **no test runner** and **no project-level lint/format config**. Do
not invent `npm test`, do not run ESLint/Prettier on `web/` — and never lint
or reformat `web/public/foliate-js/` (see below).

`cargo check` works on Linux because every Windows API call in `lib.rs` is
gated by `cfg(target_os = "windows")` with non-Windows stubs. Keep that
pattern when adding OS calls. Full packaging/runtime verification only runs
meaningfully on Windows.

## Vendored `foliate-js` — do not treat as project code

`web/public/foliate-js/` is the upstream MIT engine copied verbatim. It is
**deliberately excluded from Vite bundling**: `main.js` loads it with
runtime `import('/foliate-js/view.js')` styled `@vite-ignore`, so the served
URLs match what `foliate-js`'s own dynamic imports and PDF.js resource
paths expect.

- Do not rewrite these as bundled imports — it breaks `foliate-js` and PDF.js.
- Do not lint, format, or "modernize" files under that tree (its
  `eslint.config.js` / `rollup.config.js` upstream its own tooling).
- Treat it as read-only. Engine fixes belong upstream at
  `johnfactotum/foliate-js`, then re-vendored.

## Architecture constraints an agent will get wrong

- **One HTML page** (`web/index.html`) serves both the library view and every
  reader window. There is no router. Reader windows are spawned by the Rust
  `new_window` command, which injects either `globalThis.__FOLIATE_STARTUP_BOOK__`
  (a library id) or `globalThis.__FOLIATE_STARTUP_PATH__` (`{pathHex, size,
  lastModified}`) as an init script. `main.js` branches on whichever is
  present. New window types: follow the same init-script pattern.
- **Range-byte IPC, not whole-file IPC.** `NativeBookFile` / `NativeBookSlice`
  in `main.js` implement the `Blob`/`File` interface on top of
  `invoke('read_book_range', { path, begin, end })`. EPUB/MOBI/PDF parsers
  pull slices on demand via `file.slice(...).arrayBuffer()`. Never pass a
  whole book through `invoke`. Extend `NativeBookSlice`, don't add an ad-hoc
  "load full file" command.
- **Stateless Rust shell.** There is **no Rust-side database**. The library
  lives in IndexedDB (`web/library.js`, store `books`, keyed by content id,
  indexed on `lastOpened`/`importedAt`) plus `localStorage` for per-book
  `position:`/`reader-data:` and global prefs. Cross-window sync uses
  `BroadcastChannel` inside `LibraryStore`. New persistence belongs in
  `library.js`, not in SQLite/`tauri-plugin-sql`.
- **Book identity is content-derived**, not path-based. `getBookIdentity`
  prefers the publication's normalized EPUB `identifier` (SHA-256 →
  `identifier:<hex>`); only as a fallback does it fingerprint first/last
  256 KiB + file size (`fingerprint:<hex>`). Always go through
  `getBookIdentity`. Renaming or moving a file on disk must not invalidate
  the library record — that's the point.
- **Rust shell stays minimal on purpose.** Only `serde` + `tai` + `windows-sys`.
  No Tauri plugins. New OS-side features go in `src-tauri/src/lib.rs` via
  `windows-sys` FFI and must be registered in the `tauri::generate_handler!`
  list inside `run()`. Binary size is a stated project goal.
- **Capabilities** (`src-tauri/capabilities/default.json`) scope `core:default`
  to windows `main` and `reader-*`. New reader windows must keep the
  `reader-{n}` id pattern; a different prefix loses its permissions.

## Portable vs installed runtime

`lib.rs::prepare_runtime` checks for `portable.flag` beside the executable.
If present it relocates `TEMP`, `TMP`, and `WEBVIEW2_USER_DATA_FOLDER` under
a sibling `Data/` and verifies the directory is writable. Mandatory
contract: **never silently fall back to `%APPDATA%` / `%LOCALAPPDATA%`** —
the portable edition must fail loudly if its directory isn't usable. Every
`WebviewWindowBuilder` reuses the same `data_directory` so reader windows
share the portable WebView2 profile rather than stamping a new one.

File associations and desktop shortcuts are written via `reg.exe` and
PowerShell `WScript.Shell` directly (`set_file_associations`,
`create_desktop_shortcut`), not a Tauri plugin. They refuse to overwrite a
Foliate shortcut/file-association that points to a different executable —
preserve that guard. A parallel NSIS hook
(`src-tauri/installer-hooks.nsh`) does the same at install time for an
installer variant.

## Security surface

- `tauri.conf.json` sets `"csp": null` at the shell level. The real CSP
  lives as a `<meta http-equiv="Content-Security-Policy">` tag in
  `web/index.html`. Edit CSP **there**, not in `tauri.conf.json`.
- `open_external` (Rust) only accepts `http://` / `https://`. The page CSP
  further restricts `connect-src` to `*.wikipedia.org`, `*.wiktionary.org`,
  and `translate.googleapis.com`. Don't broaden either without an explicit
  reason; this is a stated privacy property.
- `object-src 'none'`, `form-action 'none'`, `base-uri 'none'`,
  `script-src 'self' 'wasm-unsafe-eval'`. E-book-script and unrestricted
  network blocking is intentional.

## Release / packaging

- The release workflow (`.github/workflows/windows.yml`) has two triggers:
  `release.published` (legacy) and `workflow_dispatch:` (the path used
  since v0.1.4). Pushes to `main`, PRs, and tag pushes alone do NOT build.
- The workflow produces a single Windows x64 **portable ZIP**
  (`Foliate-Windows-x64-Portable.zip`) staged in `release/Foliate-Portable/`
  with `Foliate.exe`, `portable.flag`, `Licenses/`, `Data/` skeleton, and
  (since the compliance fix) `CHANGELOG.md` at archive root for GPLv3 §5(a).
- The legacy `release` job that auto-uploaded the asset to the GitHub
  Release was removed in v0.1.4; on this fork `release.published` fires the
  `build` job only and produces a workflow artifact, not a release asset.
- **Cutting a release:** 1) bump version in `package.json`,
  `package-lock.json` (2 spots), `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (foliate4w stanza only),
   nd the `'0.1.x'` fallback literals in `web/main.js` `showAbout()`; 2)
  commit with bare version-number message; 3) tag `v0.1.x` and push; 4)
  create Release (notes from `CHANGELOG.md`); 5) `gh workflow run windows.yml
  --ref <branch>`; 6) poll to green; 7) `gh run download <id> --name
  Foliate-Windows-x64-Portable --dir <tmp>`; 8) `gh release upload v0.1.x
  <tmp>/Foliate-Windows-x64-Portable.zip --clobber`.
- License-text bundling: `Licenses/` at repo root carries static license
  texts for vendored components whose upstream did not ship a `LICENSE`
  alongside the vendored copy (zip.js BSD-3-Clause, fflate MIT, Tauri MIT).
  These are copied into the portable zip's `Licenses/` folder by the
  workflow, alongside the existing `COPYING` → `Foliate-GPL-3.0.txt`,
  `foliate-js/LICENSE` → `foliate-js-MIT.txt`, and the PDF.js component
  licenses.
- `tauri build --no-bundle` — no MSI/NSIS installer in the normal flow; the
  NSIS hooks are for a separate installer variant.
- Release profile: `opt-level = "s"`, `lto = true`, `panic = "abort"`,
  `codegen-units = 1`, `strip = true`. Don't enable Tauri features you
  don't need.

## Style / conventions

- UI is **English-first, Chinese-opt-in**. English strings live directly
  in `web/index.html` and `web/main.js`. A `chineseText` map (English →
  Simplified Chinese, ~157 entries, derived from upstream's `englishText`
  inversion) plus a `applyLanguage()` DOM walker re-render the visible text
  when the user picks Chinese in **Settings → Change Language**. Default is
  English (`localStorage['language'] || 'en'`). Strings without a
  `chineseText` entry stay English in both modes — by design, not a gap.
  When you add user-facing text, leave the English form inline and (if you
  want it translated) add the inverse pair to `chineseText`. Match the
  language of surrounding UI text and comments.
- User-facing Rust error messages are in English (e.g.
  `format!("Book file does not exist: …")`).
- `URL.revokeObjectURL` discipline is uneven across `main.js` (cover URLs,
  library cover URLs, footnote views, image viewer). If you add an
  object-URL path, revoke it along the same pattern you find nearby.
- Fork relationship: this repo is a fork of `evoke322/Foliate4w`. Don't push
  to upstream; raise PRs against the user's fork unless told otherwise.