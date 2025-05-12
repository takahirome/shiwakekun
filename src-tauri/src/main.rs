// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod file_utils;
use file_utils::{fix_file_permissions, safe_move_file};
use std::path::Path;

// ファイル移動関数
#[tauri::command]
fn move_file(source_path: String, dest_path: String) -> Result<(), String> {
    let source = Path::new(&source_path);
    let destination = Path::new(&dest_path);

    // 安全なファイル移動関数を使用
    safe_move_file(source, destination).map_err(|e| format!("ファイル移動エラー: {}", e))
}

fn main() {
    // Tauriアプリケーションを実行
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| Ok(()))
        .invoke_handler(tauri::generate_handler![move_file]);

    #[cfg(desktop)]
    app.run(tauri::generate_context!())
        .expect("アプリの実行中にエラーが発生しました");
}
