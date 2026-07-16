use serde::Serialize;
use std::{
    ffi::OsStr,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
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

fn is_supported_book(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(OsStr::to_str)
            .is_some_and(|ext| SUPPORTED_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
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

#[tauri::command]
fn new_window(
    book_id: Option<String>,
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<(), String> {
    let id = WINDOW_ID.fetch_add(1, Ordering::Relaxed);
    let url = book_id
        .map(|book_id| format!("index.html?book={book_id}"))
        .unwrap_or_else(|| "index.html".to_string());
    let mut builder =
        WebviewWindowBuilder::new(&app, format!("reader-{id}"), WebviewUrl::App(url.into()))
            .title("Foliate")
            .inner_size(1180.0, 780.0)
            .min_inner_size(640.0, 480.0)
            .center()
            .resizable(true)
            .disable_drag_drop_handler()
            .devtools(cfg!(debug_assertions));
    if let Some(directory) = state.data_dir.as_ref().map(|path| path.join("WebView2")) {
        builder = builder.data_directory(directory);
    }
    builder.build().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_startup_book_range(
    begin: u64,
    end: u64,
    state: State<'_, RuntimeState>,
) -> Result<Response, String> {
    let path = state
        .startup_book
        .as_ref()
        .ok_or_else(|| "没有通过启动参数传入图书".to_string())?;
    let size = fs::metadata(path)
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

fn safe_file_name(name: &str) -> String {
    let name: String = name
        .chars()
        .map(|character| {
            if matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    if name.trim().is_empty() {
        "book".to_string()
    } else {
        name
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
fn open_book_copy(
    name: String,
    bytes: Vec<u8>,
    state: State<'_, RuntimeState>,
) -> Result<(), String> {
    let directory = state
        .data_dir
        .as_ref()
        .map(|path| path.join("temp"))
        .unwrap_or_else(std::env::temp_dir)
        .join("Foliate");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(safe_file_name(&name));
    fs::write(&path, bytes).map_err(|error| format!("无法创建临时图书副本：{error}"))?;
    shell_open_path(&path)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn open_external(_url: String) -> Result<(), String> {
    Err("当前平台不支持打开外部链接".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn open_book_copy(
    _name: String,
    _bytes: Vec<u8>,
    _state: State<'_, RuntimeState>,
) -> Result<(), String> {
    Err("当前平台不支持使用外部程序打开图书".to_string())
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
            get_window_state,
            restore_window_state,
            toggle_fullscreen,
            print_window,
            new_window,
            read_startup_book_range,
            open_external,
            open_book_copy
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
