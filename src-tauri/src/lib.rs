use serde::Serialize;
use std::{
    ffi::OsStr,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{ipc::Response, webview::WebviewWindowBuilder, State, WebviewUrl};

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "epub", "mobi", "azw", "azw3", "fb2", "fbz", "zip", "cbz", "pdf",
];

#[derive(Clone)]
struct RuntimeState {
    portable: bool,
    data_dir: Option<PathBuf>,
    startup_book: Option<PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    portable: bool,
    startup_book: Option<String>,
}

fn is_supported_book(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(OsStr::to_str)
            .is_some_and(|ext| SUPPORTED_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

fn startup_book() -> Option<PathBuf> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|path| is_supported_book(path))
        .and_then(|path| path.canonicalize().ok().or(Some(path)))
}

fn verify_writable(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|error| format!("无法创建绿色版数据目录：{error}"))?;

    let probe = directory.join(format!(".write-test-{}", std::process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(|error| format!("绿色版所在目录不可写：{error}"))?;
    file.write_all(b"Foliate portable write test")
        .map_err(|error| format!("绿色版数据目录写入失败：{error}"))?;
    drop(file);
    fs::remove_file(&probe).map_err(|error| format!("绿色版数据目录清理失败：{error}"))?;
    Ok(())
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
        verify_writable(&root)?;
        for child in [
            "cache", "config", "covers", "library", "logs", "temp", "WebView2",
        ] {
            fs::create_dir_all(root.join(child))
                .map_err(|error| format!("无法创建 Data\\{child}：{error}"))?;
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

    Ok(RuntimeState {
        portable,
        data_dir,
        startup_book: startup_book(),
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
    }
}

#[tauri::command]
fn read_startup_book(state: State<'_, RuntimeState>) -> Result<Response, String> {
    let path = state
        .startup_book
        .as_ref()
        .ok_or_else(|| "没有通过文件关联传入图书".to_string())?;
    let bytes = fs::read(&path).map_err(|error| format!("无法读取图书：{error}"))?;
    Ok(Response::new(bytes))
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
        .invoke_handler(tauri::generate_handler![runtime_info, read_startup_book])
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
