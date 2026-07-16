use serde::Serialize;
#[cfg(target_os = "windows")]
use std::collections::BTreeSet;
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
        return Err(format!("图书文件不存在：{}", path.display()));
    }
    let path = path
        .canonicalize()
        .map_err(|error| format!("无法解析图书路径：{error}"))?;
    if !is_supported_book(&path) {
        return Err(format!("不支持的图书格式：{}", path.display()));
    }
    Ok(path)
}

fn book_path_info(path: impl AsRef<Path>) -> Result<BookPathInfo, String> {
    let path = canonical_book_path(path)?;
    let metadata = fs::metadata(&path).map_err(|error| format!("无法读取图书信息：{error}"))?;
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

fn startup_book() -> (Option<PathBuf>, Option<String>) {
    let Some(path) = std::env::args_os().skip(1).map(PathBuf::from).next() else {
        return (None, None);
    };
    if !path.exists() {
        return (
            None,
            Some(format!("启动参数指定的文件不存在：{}", path.display())),
        );
    }
    if !is_supported_book(&path) {
        return (None, Some(format!("不支持的图书格式：{}", path.display())));
    }
    (path.canonicalize().ok().or(Some(path)), None)
}

fn prepare_runtime() -> Result<RuntimeState, String> {
    let executable =
        std::env::current_exe().map_err(|error| format!("无法确定程序位置：{error}"))?;
    let executable_dir = executable
        .parent()
        .ok_or_else(|| "无法确定程序所在目录".to_string())?
        .to_path_buf();
    let portable = executable_dir.join("portable.flag").is_file();

    let data_dir = if portable {
        let root = executable_dir.join("Data");
        for child in [
            "cache", "config", "covers", "library", "logs", "temp", "WebView2",
        ] {
            fs::create_dir_all(root.join(child))
                .map_err(|error| format!("无法创建 Data\\{child}：{error}"))?;
        }
        let initialized = root.join(".initialized");
        if !initialized.exists() {
            fs::write(&initialized, b"Foliate Portable data directory\n")
                .map_err(|error| format!("绿色版所在目录不可写：{error}"))?;
        }

        let temp = root.join("temp");
        std::env::set_var("TEMP", &temp);
        std::env::set_var("TMP", &temp);
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", root.join("WebView2"));
        std::env::set_current_dir(&executable_dir)
            .map_err(|error| format!("无法切换到绿色版目录：{error}"))?;
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
        "电子书 (*.epub;*.mobi;*.azw;*.azw3;*.fb2;*.fbz;*.zip;*.cbz;*.pdf)\0\
         *.epub;*.mobi;*.azw;*.azw3;*.fb2;*.fbz;*.zip;*.cbz;*.pdf\0所有文件 (*.*)\0*.*\0",
    )
    .encode_wide()
    .chain(iter::once(0))
    .collect();
    let title: Vec<u16> = OsStr::new(if multiple {
        "导入图书到书库"
    } else {
        "打开电子书"
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
            Err(format!("Windows 文件选择器错误：0x{error:04X}"))
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
    Err("当前平台不支持 Windows 文件选择器".to_string())
}

#[tauri::command]
fn new_window(
    book_id: Option<String>,
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
                Err("无效的书库图书标识".to_string())
            }
        })
        .transpose()?;
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
        .map_err(|error| format!("无法读取图书信息：{error}"))?
        .len();
    if begin > end || end > size {
        return Err(format!("无效的图书读取范围：{begin}..{end} / {size}"));
    }

    let length = usize::try_from(end - begin).map_err(|_| "请求的图书数据块过大".to_string())?;
    let mut bytes = vec![0; length];
    let mut file = File::open(path).map_err(|error| format!("无法打开图书：{error}"))?;
    file.seek(SeekFrom::Start(begin))
        .map_err(|error| format!("无法定位图书数据：{error}"))?;
    file.read_exact(&mut bytes)
        .map_err(|error| format!("无法读取图书数据：{error}"))?;
    Ok(Response::new(bytes))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    use std::{iter, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::UI::Shell::ShellExecuteW;

    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("只允许打开 HTTP 或 HTTPS 链接".to_string());
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
        Err("无法使用系统浏览器打开链接".to_string())
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
        Err("无法使用系统默认程序打开图书".to_string())
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
    Err("当前平台不支持打开外部链接".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn open_book_path(_path: String) -> Result<(), String> {
    Err("当前平台不支持使用外部程序打开图书".to_string())
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
            clean_temporary_files
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
        show_fatal_error(&format!("Foliate 启动失败：{error}"));
    }
}
