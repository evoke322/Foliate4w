<img src="web/public/assets/foliate.svg" align="left" width="72" height="72" alt="Foliate icon" style="margin-right:12px">
<br>

# Foliate for Windows

Read books in style on Windows.

[简体中文](README-zh.md) | English

Foliate for Windows is a lightweight Windows port of
[Foliate](https://github.com/johnfactotum/foliate). It reuses the
[`foliate-js`](https://github.com/johnfactotum/foliate-js) reading engine and
rebuilds the desktop shell with [Tauri 2](https://tauri.app/) and Microsoft
WebView2.

The project targets Windows only. Its interface and reading experience aim to
follow the original Foliate as closely as practical, while avoiding the GTK,
GJS, libadwaita, WebKitGTK, Electron, and bundled Chromium runtimes.

> [!IMPORTANT]
> This project is in early development and is not release-ready yet. The basic
> reader shell has been created, but Windows packaging, portable data isolation,
> file associations, and end-to-end testing are still in progress.

## Goals

- Preserve the visual style and core reading experience of the original
  Foliate.
- Support Windows 10 and Windows 11 on x64.
- Reuse the WebView2 Runtime normally available on modern Windows systems.
- Keep the executable and release packages as small as practical.
- Produce both an installer and a truly portable ZIP package with GitHub
  Actions.
- Keep the portable edition self-contained and free of application-created
  registry entries.

## Book Formats

- EPUB
- Mobipocket (`.mobi`)
- Kindle (`.azw`, `.azw3`)
- FictionBook (`.fb2`, `.fb2.zip`, `.fbz`)
- Comic Book Archive (`.cbz`)
- PDF (experimental)

Format parsing and rendering are provided primarily by `foliate-js`. PDF
support uses PDF.js and should currently be considered experimental, as it is
in the upstream project.

## Current Features

- Open local books with the system file picker
- Open books by dragging and dropping them into the window
- Paginated and scrolling layouts
- Table of contents
- Reading progress and position restore
- Book title, author, and cover display
- Light and dark themes
- Keyboard and toolbar page navigation

The original Foliate also includes a library, search, bookmarks, annotations,
dictionary lookup, text-to-speech, additional themes, and extensive reading
preferences. These features are intended to be ported progressively; they are
not all available in this Windows version yet.

## Windows Packages

The release workflow is intended to produce two x64 packages from the same
source code.

### Installer Edition

The installer edition will:

- be distributed as `Foliate-Windows-x64-Setup.exe`;
- install Foliate for the current Windows user;
- add normal uninstall information;
- optionally install or bootstrap the WebView2 Runtime when it is missing;
- associate supported e-book formats with Foliate;
- open associated books when they are double-clicked in File Explorer;
- store settings and application data in the normal per-user Windows
  locations.

The initial file associations will use a static Foliate file icon. The original
Linux application can extract and display book covers inside its own library,
but it does not provide a Windows Explorer thumbnail handler.

Displaying each book cover as its Explorer thumbnail would require a separate
Windows COM shell extension implementing `IThumbnailProvider`. Such an
extension is outside the initial release scope and would only be suitable as an
optional installer component.

### Portable Edition

The portable edition will:

- be distributed as `Foliate-Windows-x64-Portable.zip`;
- run after extraction without installation;
- create no file associations;
- intentionally create no application registry entries;
- keep settings, library data, reading positions, covers, caches, logs, and the
  WebView2 user-data directory under `Data` beside the executable;
- never silently fall back to `%APPDATA%`, `%LOCALAPPDATA%`, or another
  application data directory;
- show an error and stop if its directory is not writable.

The planned layout is:

```text
Foliate-Portable/
├── Foliate.exe
├── portable.flag
└── Data/
    ├── cache/
    ├── config/
    ├── covers/
    ├── library/
    └── WebView2/
```

The application can control where its own data is stored. Windows itself may
still maintain operating-system records such as Prefetch, recent-file history,
or security scan information.

## Requirements

For release packages:

- 64-bit Windows 10 or Windows 11
- Microsoft WebView2 Runtime

Windows 11 and most maintained Windows 10 installations already include the
Evergreen WebView2 Runtime. The installer edition may bootstrap it when
required. To remain self-contained and avoid system changes, the portable
edition expects WebView2 to be available already.

For development:

- Node.js 24
- npm
- Rust stable with Cargo
- A Windows build environment for native builds

The project currently uses the dedicated Conda environment named `foliate` for
Rust and Cargo. Dependencies must not be installed into the Conda `base`
environment.

## Obtaining the Source

Clone the repository and enter this project directory:

```bash
git clone <repository-url>
cd Foliate4w
```

The bundled `foliate-js` sources are kept under
`web/public/foliate-js` so their runtime dynamic imports and PDF.js resource
paths remain unchanged.

## Development

Activate the existing Conda environment:

```bash
conda activate foliate
```

Install the project-level JavaScript dependencies:

```bash
npm install
```

Run the web interface in a browser:

```bash
npm run web:dev
```

Build only the web frontend:

```bash
npm run web:build
```

Run the combined frontend and Rust checks:

```bash
npm run check
```

Run the complete Tauri application:

```bash
npm run dev
```

Run a native release build:

```bash
npm run build
```

Native Tauri development on Linux requires additional Linux WebKitGTK system
packages and does not test the Windows WebView2 integration. Full packaging and
runtime verification should be performed on Windows.

Once a lockfile has been committed, reproducible local and CI installs should
use `npm ci` instead of `npm install`.

## GitHub Actions

The Windows workflow lives at
[`.github/workflows/windows.yml`](.github/workflows/windows.yml) and uses a
GitHub-hosted `windows-latest` runner.

The completed workflow will:

1. check out the source;
2. set up Node.js and the Rust MSVC toolchain;
3. restore npm and Cargo caches;
4. install dependencies from lockfiles;
5. build and validate the web frontend;
6. build the Windows x64 executable;
7. create the installer edition with file associations;
8. create the isolated portable directory;
9. archive the portable directory as a ZIP file;
10. upload both packages as workflow artifacts;
11. attach both packages to GitHub Releases for version tags.

The current workflow is only an initial installer build skeleton. The
two-edition packaging and release steps described above still need to be
implemented and verified.

## Architecture

- `web/` — Windows-oriented user interface and reader integration
- `web/public/foliate-js/` — upstream e-book rendering engine and bundled
  format dependencies
- `src-tauri/` — lightweight native Windows shell
- `.github/workflows/` — automated Windows builds

The reader receives local files directly as browser `File` objects. This avoids
copying entire books through JSON or Tauri IPC and keeps the Rust permission
surface small.

## Lightweight Packaging

The project keeps package size down by:

- using the system WebView2 Runtime instead of bundling Chromium;
- avoiding GTK/GJS and Electron;
- keeping the Rust shell minimal;
- preserving modular `foliate-js` dynamic imports;
- excluding development-only files such as source maps from release packages;
- enabling release optimization, link-time optimization, symbol stripping, and
  size-oriented Rust settings where appropriate;
- building only Windows x64 initially.

The exact package size will be measured after the first verified Windows
release. The intended range is a portable archive in the tens of megabytes,
without bundling WebView2.

## Security and Privacy

- Books are opened locally and are not uploaded by the reader.
- The current reader does not grant arbitrary filesystem access to book
  content.
- E-book scripts and unrestricted network connections are blocked by the
  reader's content security policy.
- External links are not opened automatically in the current implementation.
- The portable edition will isolate all application-controlled persistent data
  beneath its local `Data` directory.

## Relationship to Foliate

Foliate for Windows is based on the design and reading engine of the original
Foliate project. It is a platform port, not a direct build of the GTK
application. Linux-specific components such as GTK, libadwaita, GJS,
WebKitGTK, Tracker, and `speech-dispatcher` are replaced or omitted on Windows.

Please report Windows-port issues to this project's issue tracker. Issues with
the upstream GTK application or `foliate-js` should be reproduced and reported
to their respective upstream projects when appropriate.

## License

Foliate for Windows is free software licensed under the
[GNU General Public License](COPYING), version 3 or, at your option, any later
version.

Bundled or used components include:

- [Foliate](https://github.com/johnfactotum/foliate), GPL-3.0-or-later
- [foliate-js](https://github.com/johnfactotum/foliate-js), MIT
- [zip.js](https://github.com/gildas-lormeau/zip.js), BSD-3-Clause
- [fflate](https://github.com/101arrowz/fflate), MIT
- [PDF.js](https://github.com/mozilla/pdf.js), Apache-2.0
- [Tauri](https://tauri.app/), Apache-2.0 and MIT
- [Lucide](https://lucide.dev/), ISC

Microsoft WebView2 is a Windows runtime dependency and is not bundled in the
planned lightweight packages.
