use serde::Serialize;
#[cfg(target_os = "windows")]
use std::{
    collections::BTreeSet,
    os::windows::process::CommandExt,
    process::{Command, Output},
};
use std::{
    ffi::OsStr,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::UNIX_EPOCH,
};
use tauri::{
    ipc::Response, webview::WebviewWindowBuilder, AppHandle, PhysicalSize, Size, State, WebviewUrl,
    WebviewWindow,
};

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "epub", "mobi", "azw", "azw3", "fb2", "fbz", "zip", "cbz", "pdf",
];
static WINDOW_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
struct RuntimeState {
    portable: bool,
    data_dir: Option<PathBuf>,
    startup_book: Option<PathBuf>,
    startup_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    portable: bool,
    startup_book: Option<String>,
    startup_book_size: Option<u64>,
    startup_error: Option<String>,
    version: &'static str,
    data_dir: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowState {
    width: u32,
    height: u32,
    maximized: bool,
    fullscreen: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BookPathInfo {
    path: String,
    name: String,
    size: u64,
    last_modified: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanupResult {
    files: u64,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemIntegrationStatus {
    associations: bool,
    desktop_shortcut: bool,
}

fn is_supported_book(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(OsStr::to_str)
            .is_some_and(|ext| SUPPORTED_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

fn canonical_book_path(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let path = path.as_ref();
    if !path.exists() {
        return Err(format!("Book file does not exist: {}", path.display()));
    }
    let path = path
        .canonicalize()
        .map_err(|error| format!("Cannot resolve book path: {error}"))?;
    if !is_supported_book(&path) {
        return Err(format!("Unsupported book format: {}", path.display()));
    }
    Ok(path)
}

fn book_path_info(path: impl AsRef<Path>) -> Result<BookPathInfo, String> {
    let path = canonical_book_path(path)?;
    let metadata = fs::metadata(&path).map_err(|error| format!("Cannot read book info: {error}"))?;
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| u64::try_from(value.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0);
    Ok(BookPathInfo {
        name: path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("book")
            .to_string(),
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
        last_modified,
    })
}

fn hex_encode(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    value
        .as_bytes()
        .iter()
        .flat_map(|&byte| {
            [
                HEX[(byte >> 4) as usize] as char,
                HEX[(byte & 0x0f) as usize] as char,
            ]
        })
        .collect()
}

fn startup_book() -> (Option<PathBuf>, Option<String>) {
    let Some(path) = std::env::args_os().skip(1).map(PathBuf::from).next() else {
        return (None, None);
    };
    if !path.exists() {
        return (
            None,
            Some(format!("File specified by startup argument does not exist: {}", path.display())),
        );
    }
    if !is_supported_book(&path) {
        return (None, Some(format!("Unsupported book format: {}", path.display())));
    }
    (path.canonicalize().ok().or(Some(path)), None)
}

fn prepare_runtime() -> Result<RuntimeState, String> {
    let executable =
        std::env::current_exe()
        .map_err(|error| format!("Cannot determine program location: {error}"))?;
    let executable_dir = executable
        .parent()
        .ok_or_else(|| "Cannot determine program directory".to_string())?
        .to_path_buf();
    let portable = executable_dir.join("portable.flag").is_file();

    let data_dir = if portable {
        let root = executable_dir.join("Data");
        for child in [
            "books", "cache", "config", "covers", "library", "logs", "temp", "WebView2",
        ] {
            fs::create_dir_all(root.join(child))
                .map_err(|error| format!("Cannot create Data\\{child}: {error}"))?;
        }
        let initialized = root.join(".initialized");
        if !initialized.exists() {
            fs::write(&initialized, b"Foliate Portable data directory\n")
                .map_err(|error| format!("Portable edition directory is not writable: {error}"))?;
        }

        let temp = root.join("temp");
        std::env::set_var("TEMP", &temp);
        std::env::set_var("TMP", &temp);
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", root.join("WebView2"));
        std::env::set_current_dir(&executable_dir)
            .map_err(|error| format!("Cannot change to portable edition directory: {error}"))?;
        Some(root)
    } else {
        None
    };

    let (startup_book, startup_error) = startup_book();
    Ok(RuntimeState {
        portable,
        data_dir,
        startup_book,
        startup_error,
    })
}

// Managed "library folder" — a per-installation directory under our own
// control where we copy imported books so the reader keeps working after
// the user moves or deletes the original file. Portable: `Data/books/`
// (created by prepare_runtime alongside the rest of the portable tree).
// Installed: `%LOCALAPPDATA%\Foliate\books\`.
fn library_books_dir(state: &RuntimeState) -> Result<PathBuf, String> {
    if let Some(data_dir) = state.data_dir.as_ref() {
        return Ok(data_dir.join("books"));
    }
    let base = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "LOCALAPPDATA is not set".to_string())?;
    Ok(PathBuf::from(base).join("Foliate").join("books"))
}

// ponytail: monotonically-incrementing `_N` suffix on file-name collisions.
// O(n) scan of existing files; fine while a user imports tens to hundreds
// of books into one flat directory. If this ever becomes hot, switch to a
// book-id-keyed subfolder layout (one rename instead of a scan).
fn unique_library_book_path(dir: &Path, file_name: Option<&OsStr>) -> Result<PathBuf, String> {
    let name = file_name.and_then(OsStr::to_str).unwrap_or("book");
    let path = Path::new(name);
    let stem = path.file_stem().and_then(OsStr::to_str).unwrap_or("book");
    let ext = path.extension().and_then(OsStr::to_str).unwrap_or("");
    let mut candidate = dir.join(name);
    let mut counter = 1;
    while candidate.exists() {
        counter += 1;
        if counter > 9999 {
            return Err("Too many file name collisions in books directory".to_string());
        }
        let new_name = if ext.is_empty() {
            format!("{stem}_{counter}")
        } else {
            format!("{stem}_{counter}.{ext}")
        };
        candidate = dir.join(new_name);
    }
    Ok(candidate)
}

#[tauri::command]
fn import_book_to_library(
    src_path: String,
    state: State<'_, RuntimeState>,
) -> Result<BookPathInfo, String> {
    let src = canonical_book_path(&src_path)?;
    let dir = library_books_dir(&state)?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Cannot create books directory: {error}"))?;
    // Self-copy guard: if the user re-imports a file we already manage,
    // fs::copy would otherwise try to copy a file onto itself, which
    // Windows rejects with a sharing violation.
    let dest = if src.parent().map(|parent| parent == dir).unwrap_or(false) {
        src
    } else {
        let dest = unique_library_book_path(&dir, src.file_name())?;
        fs::copy(&src, &dest)
            .map_err(|error| format!("Cannot copy book to library folder: {error}"))?;
        dest
    };
    book_path_info(&dest)
}

#[tauri::command]
fn missing_book_paths(paths: Vec<String>) -> Vec<String> {
    paths.into_iter().filter(|path| !Path::new(path).is_file()).collect()
}

#[cfg(target_os = "windows")]
fn show_fatal_error(message: &str) {
    use std::{iter, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let title: Vec<u16> = OsStr::new("Foliate")
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let message: Vec<u16> = OsStr::new(message)
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    unsafe {
        MessageBoxW(
            ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_fatal_error(message: &str) {
    eprintln!("Foliate: {message}");
}

#[tauri::command]
fn runtime_info(state: State<'_, RuntimeState>) -> RuntimeInfo {
    RuntimeInfo {
        portable: state.portable,
        startup_book: state
            .startup_book
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        startup_book_size: state
            .startup_book
            .as_ref()
            .and_then(|path| fs::metadata(path).ok())
            .map(|metadata| metadata.len()),
        startup_error: state.startup_error.clone(),
        version: env!("CARGO_PKG_VERSION"),
        data_dir: state
            .data_dir
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
    }
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(target_os = "windows")]
const FOLIATE_PROGID: &str = "Foliate4w.Book";

#[cfg(target_os = "windows")]
fn hidden_command_output(program: &str, args: &[String]) -> Result<Output, String> {
    Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Cannot run {program}: {error}"))
}

#[cfg(target_os = "windows")]
fn checked_command(program: &str, args: &[String]) -> Result<Output, String> {
    let output = hidden_command_output(program, args)?;
    if output.status.success() {
        Ok(output)
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if detail.is_empty() {
            format!("{program} failed: {}", output.status)
        } else {
            detail
        })
    }
}

#[cfg(target_os = "windows")]
fn reg_add(key: &str, name: Option<&str>, value: &str) -> Result<(), String> {
    let mut args = vec!["add".to_string(), key.to_string()];
    if let Some(name) = name {
        args.extend(["/v".to_string(), name.to_string()]);
    } else {
        args.push("/ve".to_string());
    }
    args.extend([
        "/t".to_string(),
        "REG_SZ".to_string(),
        "/d".to_string(),
        value.to_string(),
        "/f".to_string(),
    ]);
    checked_command("reg.exe", &args).map(|_| ())
}

#[cfg(target_os = "windows")]
fn reg_delete_key(key: &str) {
    let _ = hidden_command_output(
        "reg.exe",
        &["delete".to_string(), key.to_string(), "/f".to_string()],
    );
}

#[cfg(target_os = "windows")]
fn reg_delete_value(key: &str, name: &str) {
    let _ = hidden_command_output(
        "reg.exe",
        &[
            "delete".to_string(),
            key.to_string(),
            "/v".to_string(),
            name.to_string(),
            "/f".to_string(),
        ],
    );
}

#[cfg(target_os = "windows")]
fn notify_file_association_changed() {
    use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    unsafe {
        SHChangeNotify(
            SHCNE_ASSOCCHANGED as i32,
            SHCNF_IDLIST,
            std::ptr::null(),
            std::ptr::null(),
        );
    }
}

#[cfg(target_os = "windows")]
fn current_executable() -> Result<PathBuf, String> {
    std::env::current_exe()
        .and_then(|path| path.canonicalize())
        .map_err(|error| format!("Cannot determine Foliate program location: {error}"))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn set_file_associations(enabled: bool) -> Result<(), String> {
    let executable = current_executable()?;
    let executable_text = executable.to_string_lossy();
    let executable_name = executable
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "Cannot determine Foliate program filename".to_string())?;
    let classes = r"HKCU\Software\Classes";
    let progid_key = format!(r"{classes}\{FOLIATE_PROGID}");
    let application_key = format!(r"{classes}\Applications\{executable_name}");

    if enabled {
        let icon = format!(r#""{executable_text}",0"#);
        let open_command = format!(r#""{executable_text}" "%1""#);
        reg_add(&progid_key, None, "Foliate e-book")?;
        reg_add(&format!(r"{progid_key}\DefaultIcon"), None, &icon)?;
        reg_add(&format!(r"{progid_key}\shell"), None, "open")?;
        reg_add(
            &format!(r"{progid_key}\shell\open\command"),
            None,
            &open_command,
        )?;
        reg_add(&application_key, Some("FriendlyAppName"), "Foliate")?;
        reg_add(&format!(r"{application_key}\DefaultIcon"), None, &icon)?;
        reg_add(
            &format!(r"{application_key}\shell\open\command"),
            None,
            &open_command,
        )?;
        for extension in SUPPORTED_EXTENSIONS {
            let extension = format!(".{extension}");
            reg_add(
                &format!(r"{classes}\{extension}\OpenWithProgids"),
                Some(FOLIATE_PROGID),
                "",
            )?;
            reg_add(
                &format!(r"{application_key}\SupportedTypes"),
                Some(&extension),
                "",
            )?;
        }
    } else {
        for extension in SUPPORTED_EXTENSIONS {
            reg_delete_value(
                &format!(r"{classes}\.{}\OpenWithProgids", extension),
                FOLIATE_PROGID,
            );
        }
        reg_delete_key(&application_key);
        reg_delete_key(&progid_key);
    }
    notify_file_association_changed();
    Ok(())
}

#[cfg(target_os = "windows")]
fn powershell_shortcut_output(script: &str) -> Result<Output, String> {
    let executable = current_executable()?;
    let mut command = Command::new("powershell.exe");
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ])
        .env("FOLIATE4W_SHORTCUT_TARGET", executable)
        .creation_flags(CREATE_NO_WINDOW);
    let output = command
        .output()
        .map_err(|error| format!("Cannot start Windows PowerShell: {error}"))?;
    if output.status.success() {
        Ok(output)
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if detail.is_empty() {
            "Cannot manage desktop shortcut".to_string()
        } else {
            detail
        })
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn create_desktop_shortcut() -> Result<String, String> {
    let output = powershell_shortcut_output(
        r#"$target=$env:FOLIATE4W_SHORTCUT_TARGET
$desktop=[Environment]::GetFolderPath('Desktop')
$link=Join-Path $desktop 'Foliate.lnk'
$shell=New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $link) {
  $existing=$shell.CreateShortcut($link)
  if ([IO.Path]::GetFullPath($existing.TargetPath) -cne [IO.Path]::GetFullPath($target)) {
    throw 'A Foliate shortcut pointing to a different program already exists on the desktop. The shortcut was not overwritten.'
  }
}
$shortcut=$shell.CreateShortcut($link)
$shortcut.TargetPath=$target
$shortcut.WorkingDirectory=[IO.Path]::GetDirectoryName($target)
$shortcut.IconLocation="$target,0"
$shortcut.Description='Foliate e-book reader'
$shortcut.Save()
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Write-Output $link"#,
    )?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn remove_desktop_shortcut() -> Result<(), String> {
    powershell_shortcut_output(
        r#"$target=$env:FOLIATE4W_SHORTCUT_TARGET
$link=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Foliate.lnk'
if (Test-Path -LiteralPath $link) {
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut($link)
  if ([IO.Path]::GetFullPath($shortcut.TargetPath) -cne [IO.Path]::GetFullPath($target)) {
    throw 'Foliate.lnk points to a different program. The shortcut was not removed.'
  }
  Remove-Item -LiteralPath $link -Force
}"#,
    )?;
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn system_integration_status() -> SystemIntegrationStatus {
    let association_output = powershell_shortcut_output(
        r#"$target=$env:FOLIATE4W_SHORTCUT_TARGET
$key='Registry::HKEY_CURRENT_USER\Software\Classes\Foliate4w.Book\shell\open\command'
if (-not (Test-Path -LiteralPath $key)) { exit 1 }
$command=(Get-Item -LiteralPath $key).GetValue('')
$expected='"'+$target+'" "%1"'
if ($command -ceq $expected) { exit 0 } else { exit 1 }"#,
    );
    let shortcut_output = powershell_shortcut_output(
        r#"$link=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Foliate.lnk'
if (-not (Test-Path -LiteralPath $link)) { exit 1 }
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($link)
$target=[IO.Path]::GetFullPath($env:FOLIATE4W_SHORTCUT_TARGET)
$actual=[IO.Path]::GetFullPath($shortcut.TargetPath)
if ($actual -ceq $target) { exit 0 } else { exit 1 }"#,
    );
    SystemIntegrationStatus {
        associations: association_output.is_ok(),
        desktop_shortcut: shortcut_output.is_ok(),
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_file_associations(_enabled: bool) -> Result<(), String> {
    Err("Windows file association is not supported on this platform".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn create_desktop_shortcut() -> Result<String, String> {
    Err("Windows desktop shortcut is not supported on this platform".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn remove_desktop_shortcut() -> Result<(), String> {
    Err("Windows desktop shortcut is not supported on this platform".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn system_integration_status() -> SystemIntegrationStatus {
    SystemIntegrationStatus {
        associations: false,
        desktop_shortcut: false,
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    use windows_sys::Win32::Graphics::Gdi::{
        EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW,
    };

    unsafe extern "system" fn collect_font(
        log_font: *const LOGFONTW,
        _text_metric: *const TEXTMETRICW,
        _font_type: u32,
        data: isize,
    ) -> i32 {
        if log_font.is_null() || data == 0 {
            return 1;
        }
        let face = &(*log_font).lfFaceName;
        let length = face
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(face.len());
        let name = String::from_utf16_lossy(&face[..length]).trim().to_string();
        if !name.is_empty() && !name.starts_with('@') {
            (*(data as *mut BTreeSet<String>)).insert(name);
        }
        1
    }

    let mut fonts = BTreeSet::new();
    unsafe {
        let hdc = GetDC(std::ptr::null_mut());
        if !hdc.is_null() {
            let mut query = LOGFONTW::default();
            query.lfCharSet = DEFAULT_CHARSET;
            EnumFontFamiliesExW(
                hdc,
                &query,
                Some(collect_font),
                &mut fonts as *mut BTreeSet<String> as isize,
                0,
            );
            ReleaseDC(std::ptr::null_mut(), hdc);
        }
    }
    fonts.into_iter().collect()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    [
        "Arial",
        "Calibri",
        "Cambria",
        "Consolas",
        "Georgia",
        "Microsoft YaHei UI",
        "Segoe UI",
        "SimSun",
        "Times New Roman",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

#[tauri::command]
fn get_window_state(window: WebviewWindow) -> Result<WindowState, String> {
    let size = window.inner_size().map_err(|error| error.to_string())?;
    Ok(WindowState {
        width: size.width,
        height: size.height,
        maximized: window.is_maximized().map_err(|error| error.to_string())?,
        fullscreen: window.is_fullscreen().map_err(|error| error.to_string())?,
    })
}

#[tauri::command]
fn restore_window_state(
    width: u32,
    height: u32,
    maximized: bool,
    fullscreen: bool,
    window: WebviewWindow,
) -> Result<(), String> {
    if width >= 640 && height >= 480 {
        window
            .set_size(Size::Physical(PhysicalSize::new(width, height)))
            .map_err(|error| error.to_string())?;
    }
    if maximized {
        window.maximize().map_err(|error| error.to_string())?;
    }
    if fullscreen {
        window
            .set_fullscreen(true)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    let fullscreen = window.is_fullscreen().map_err(|error| error.to_string())?;
    window
        .set_fullscreen(!fullscreen)
        .map_err(|error| error.to_string())?;
    Ok(!fullscreen)
}

#[tauri::command]
fn print_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn choose_books(multiple: bool) -> Result<Vec<BookPathInfo>, String> {
    use std::{iter, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::UI::Controls::Dialogs::{
        CommDlgExtendedError, GetOpenFileNameW, OFN_ALLOWMULTISELECT, OFN_EXPLORER,
        OFN_FILEMUSTEXIST, OFN_HIDEREADONLY, OFN_NOCHANGEDIR, OFN_PATHMUSTEXIST, OPENFILENAMEW,
    };

    let filter: Vec<u16> = OsStr::new(
        "E-books (*.epub;*.mobi;*.azw;*.azw3;*.fb2;*.fbz;*.zip;*.cbz;*.pdf)\0\
         *.epub;*.mobi;*.azw;*.azw3;*.fb2;*.fbz;*.zip;*.cbz;*.pdf\0All files (*.*)\0*.*\0",
    )
    .encode_wide()
    .chain(iter::once(0))
    .collect();
    let title: Vec<u16> = OsStr::new(if multiple {
        "Import Books to Library"
    } else {
        "Open Book"
    })
    .encode_wide()
    .chain(iter::once(0))
    .collect();
    let mut buffer = vec![0u16; 64 * 1024];
    let mut dialog = OPENFILENAMEW {
        lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
        lpstrFilter: filter.as_ptr(),
        lpstrFile: buffer.as_mut_ptr(),
        nMaxFile: buffer.len() as u32,
        lpstrTitle: title.as_ptr(),
        Flags: OFN_EXPLORER
            | OFN_FILEMUSTEXIST
            | OFN_PATHMUSTEXIST
            | OFN_HIDEREADONLY
            | OFN_NOCHANGEDIR
            | if multiple { OFN_ALLOWMULTISELECT } else { 0 },
        ..Default::default()
    };
    let selected = unsafe { GetOpenFileNameW(&mut dialog) };
    if selected == 0 {
        let error = unsafe { CommDlgExtendedError() };
        return if error == 0 {
            Ok(Vec::new())
        } else {
            Err(format!("Windows file chooser error: 0x{error:04X}"))
        };
    }

    let values = buffer
        .split(|value| *value == 0)
        .take_while(|value| !value.is_empty())
        .map(String::from_utf16_lossy)
        .collect::<Vec<_>>();
    let paths = if values.len() <= 1 {
        values.into_iter().map(PathBuf::from).collect::<Vec<_>>()
    } else {
        let directory = PathBuf::from(&values[0]);
        values[1..]
            .iter()
            .map(|name| directory.join(name))
            .collect::<Vec<_>>()
    };
    paths.into_iter().map(book_path_info).collect()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn choose_books(_multiple: bool) -> Result<Vec<BookPathInfo>, String> {
    Err("Windows file chooser is not supported on this platform".to_string())
}

#[tauri::command]
async fn new_window(
    book_id: Option<String>,
    book_path: Option<String>,
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<(), String> {
    let book_id = book_id
        .map(|book_id| {
            let valid = book_id.len() <= 96
                && ["identifier:", "fingerprint:"].iter().any(|prefix| {
                    book_id.strip_prefix(prefix).is_some_and(|digest| {
                        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
                    })
                });
            if valid {
                Ok(book_id)
            } else {
                Err("Invalid library book identifier".to_string())
            }
        })
        .transpose()?;
    let book_path = book_path.map(book_path_info).transpose()?;
    let id = WINDOW_ID.fetch_add(1, Ordering::Relaxed);
    let mut builder = WebviewWindowBuilder::new(
        &app,
        format!("reader-{id}"),
        WebviewUrl::App("index.html".into()),
    )
    .title("Foliate")
    .inner_size(1180.0, 780.0)
    .min_inner_size(640.0, 480.0)
    .center()
    .resizable(true)
    .disable_drag_drop_handler()
    .devtools(cfg!(debug_assertions));
    if let Some(book_id) = book_id {
        builder = builder.initialization_script(format!(
            "globalThis.__FOLIATE_STARTUP_BOOK__ = \"{book_id}\";"
        ));
    } else if let Some(book) = book_path {
        builder = builder.initialization_script(format!(
            "globalThis.__FOLIATE_STARTUP_PATH__ = {{ pathHex: \"{}\", size: {}, lastModified: {} }};",
            hex_encode(&book.path),
            book.size,
            book.last_modified,
        ));
    }
    if let Some(directory) = state.data_dir.as_ref().map(|path| path.join("WebView2")) {
        builder = builder.data_directory(directory);
    }
    builder.build().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_book_range(path: String, begin: u64, end: u64) -> Result<Response, String> {
    let path = canonical_book_path(path)?;
    let size = fs::metadata(&path)
        .map_err(|error| format!("Cannot read book info: {error}"))?
        .len();
    if begin > end || end > size {
        return Err(format!("Invalid book read range: {begin}..{end} / {size}"));
    }

    let length = usize::try_from(end - begin).map_err(|_| "Requested book data chunk is too large".to_string())?;
    let mut bytes = vec![0; length];
    let mut file = File::open(path).map_err(|error| format!("Cannot open book: {error}"))?;
    file.seek(SeekFrom::Start(begin))
        .map_err(|error| format!("Cannot seek book data: {error}"))?;
    file.read_exact(&mut bytes)
        .map_err(|error| format!("Cannot read book data: {error}"))?;
    Ok(Response::new(bytes))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    use std::{iter, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::UI::Shell::ShellExecuteW;

    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only HTTP or HTTPS links are allowed".to_string());
    }
    let operation: Vec<u16> = OsStr::new("open")
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let url: Vec<u16> = OsStr::new(&url)
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            operation.as_ptr(),
            url.as_ptr(),
            ptr::null(),
            ptr::null(),
            1,
        )
    };
    if result as isize <= 32 {
        Err("Cannot open link in system browser".to_string())
    } else {
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn shell_open_path(path: &Path) -> Result<(), String> {
    use std::{iter, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::UI::Shell::ShellExecuteW;

    let operation: Vec<u16> = OsStr::new("open")
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let path: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            operation.as_ptr(),
            path.as_ptr(),
            ptr::null(),
            ptr::null(),
            1,
        )
    };
    if result as isize <= 32 {
        Err("Cannot open book with system default program".to_string())
    } else {
        Ok(())
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn open_book_path(path: String) -> Result<(), String> {
    let path = canonical_book_path(path)?;
    shell_open_path(&path)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn open_external(_url: String) -> Result<(), String> {
    Err("Opening external links is not supported on this platform".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn open_book_path(_path: String) -> Result<(), String> {
    Err("Opening books with external programs is not supported on this platform".to_string())
}

fn remove_directory_contents(path: &Path) -> Result<CleanupResult, String> {
    let mut result = CleanupResult { files: 0, bytes: 0 };
    if !path.exists() {
        return Ok(result);
    }
    for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
            result.files += 1;
        } else if file_type.is_dir() {
            let nested = remove_directory_contents(&entry.path())?;
            result.files += nested.files;
            result.bytes += nested.bytes;
            fs::remove_dir(entry.path()).map_err(|error| error.to_string())?;
        } else {
            let metadata = entry.metadata().map_err(|error| error.to_string())?;
            result.files += 1;
            result.bytes += metadata.len();
            fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
        }
    }
    Ok(result)
}

#[tauri::command]
fn clean_temporary_files(state: State<'_, RuntimeState>) -> Result<CleanupResult, String> {
    let directory = state
        .data_dir
        .as_ref()
        .map(|path| path.join("temp"))
        .unwrap_or_else(|| std::env::temp_dir().join("Foliate"));
    remove_directory_contents(&directory)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = match prepare_runtime() {
        Ok(runtime) => runtime,
        Err(error) => {
            show_fatal_error(&error);
            return;
        }
    };
    let webview_data_dir = runtime.data_dir.as_ref().map(|path| path.join("WebView2"));

    let result = tauri::Builder::default()
        .manage(runtime)
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            system_integration_status,
            set_file_associations,
            create_desktop_shortcut,
            remove_desktop_shortcut,
            list_system_fonts,
            get_window_state,
            restore_window_state,
            toggle_fullscreen,
            print_window,
            choose_books,
            new_window,
            read_book_range,
            open_external,
            open_book_path,
            clean_temporary_files,
            import_book_to_library,
            missing_book_paths
        ])
        .setup(move |app| {
            let mut window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Foliate")
                    .inner_size(1180.0, 780.0)
                    .min_inner_size(640.0, 480.0)
                    .center()
                    .resizable(true)
                    .disable_drag_drop_handler()
                    .devtools(cfg!(debug_assertions));

            if let Some(directory) = webview_data_dir.clone() {
                window = window.data_directory(directory);
            }
            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(error) = result {
        show_fatal_error(&format!("Foliate failed to start: {error}"));
    }
}
