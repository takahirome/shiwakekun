// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod file_utils;
use file_utils::{fix_file_permissions, safe_move_file};
use std::path::Path;

fn main() {
    tauri_app_lib::run()
}

// ファイル移動関数の例（既存のコードに合わせて調整してください）
#[tauri::command]
fn move_file(source_path: String, dest_path: String) -> Result<(), String> {
    let source = Path::new(&source_path);
    let destination = Path::new(&dest_path);

    // 安全なファイル移動関数を使用
    safe_move_file(source, destination).map_err(|e| format!("ファイル移動エラー: {}", e))
}
