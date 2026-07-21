# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.1.4] - 2026-07-21

### Added

- Simplified Chinese interface mode, opt-in via **Settings → Change
  Language**. English is the default DOM text; selecting **Chinese
  (简体中文)** applies ~157 translations via a bilingual overlay
  (`chineseText` / `applyLanguage`) that walks DOM text nodes and
  translates English strings with a known mapping. The language selector
  and its option labels stay English so the control itself remains
  discoverable in either mode. Strings without a `chineseText` mapping
  stay English when Chinese is selected — by design, not a gap.
  `localStorage['language']` is the persistence key, defaulting to `'en'`
  on fresh installs.
- New **White Background** preference under **E-book Reading → Behavior**.
  On by default, giving a white page background with dark text
  (book-like). Turning it off switches the reader content to the dark
  reading palette (dark page background with light text), independent of
  the interface theme. Persists across sessions via
  `localStorage['reader-white-bg']` and applies live without reloading
  the book.
- `Licenses/` directory at repo root with static license texts for
  vendored components whose upstream did not ship a LICENSE alongside the
  vendored copy: `zip.js-BSD-3-Clause.txt`, `fflate-MIT.txt`,
  `Tauri-LICENSE-MIT.txt`. All three texts fetched verbatim from the
  upstream repositories.
- README.md gains a **Fork notice** subsection under "Relationship to
  Foliate" stating that this repository is a modified fork of
  `evoke322/Foliate4w`, citing the merge base and listing the change
  ranges documented in this file. Satisfies the GPLv3 §5(a) "prominent
  notices stating that You modified it" obligation.
- **NSIS installer** for Windows x64 and x86. `tauri.conf.json` enables
  `bundle.targets: ["nsis"]` with `installMode: "currentUser"` and the
  existing `installer-hooks.nsh`, which already pre-wired file-association
  registration. The release ships two installers
  (`Foliate-Windows-x64-Installer.exe` and
  `Foliate-Windows-x86-Installer.exe`) alongside the portable zip.
- The installer uses the project's existing `icons/icon.ico` (the Foliate
  logo, derived from `web/public/assets/foliate.svg` referenced in the
  README) as both the installer .exe icon and the installed Foliate
  application icon.
- Installer **uninstall hook** removes the WebView2 user-data folder
  (`%LOCALAPPDATA%\<binary-name>` and known alternative paths) on
  uninstall so the system is left clean — no orphaned library, settings,
  or cache after removing the app.
- Application **settings, library, and per-book state persist across app
  and device restarts** for the installed edition by default, since
  WebView2 stores `localStorage` and `IndexedDB` under the per-user
  `%LOCALAPPDATA%` tree (no `WEBVIEW2_USER_DATA_FOLDER` override in
  installed mode).

### Changed

- Default interface language is now English (was Simplified Chinese in
  the upstream base). The bilingual overlay is inverted from the
  original Simplified-Chinese-first design: English lives directly in the
  source and Chinese is applied only when selected.
- All user-facing Rust error messages updated to English.
- Removed the Simplified Chinese README (`README-zh.md`); English
  README is the sole readme.
- README.md License section: the Tauri entry now reads "Apache-2.0 OR
  MIT" (was "and MIT"), reflecting the actual dual-or grant. The fork
  invokes the MIT arm, which carries no Apache-2.0 §4(d) NOTICE-file
  obligation.
- `.github/workflows/windows.yml` now `Copy-Item`s the three new license
  texts into `Licenses/` inside the portable zip, alongside the existing
  `COPYING` → `Foliate-GPL-3.0.txt`, `foliate-js-MIT.txt`, and the PDF.js
  component licenses. Closes the inherited BSD-3-Clause §2 and MIT
  attribution obligations for the binary distribution.
- `.github/workflows/windows.yml` now also `Copy-Item`s `CHANGELOG.md`
  to the portable zip root (next to `Foliate.exe`). A recipient without
  GitHub access can now see the modification history bundled with the
  binary, satisfying GPLv3 §5(a) for the binary path.

### Fixed

- The "Cannot parse or import …" error for a book whose underlying parse
  fails was being overwritten by a
  `TypeError: Cannot read properties of undefined (reading 'destroy')`
  raised inside the cleanup path (`view.close()` in `finally` blocks).
  The real parse or import error now surfaces in the Error Details
  dialog so the book can be diagnosed instead of all failures collapsing
  into the same `TypeError`. Applies to both the import/inspection path
  and the reader's `close()` cleanup.

[0.1.4]: https://github.com/vihaanvp/Foliate4w/releases/tag/v0.1.4
[Unreleased]: https://github.com/vihaanvp/Foliate4w/compare/v0.1.4...HEAD