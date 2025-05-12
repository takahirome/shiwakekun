// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod file_utils;
use file_utils::safe_move_file;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    categories: HashMap<String, Vec<String>>,
    output_folders: Vec<String>,
    input_folder: Option<String>,
}

// ファイル移動関数
#[tauri::command]
fn move_file(source_path: String, dest_path: String) -> Result<(), String> {
    let source = Path::new(&source_path);
    let destination = Path::new(&dest_path);

    // 安全なファイル移動関数を使用（ファイル移動中に権限修正を行う）
    safe_move_file(source, destination).map_err(|e| format!("ファイル移動エラー: {}", e))
}

// 入力フォルダからファイルを読み込む関数
#[tauri::command]
fn load_files_from_input_folder(config: Config, recursive: bool) -> Result<Vec<String>, String> {
    let input_folder = match &config.input_folder {
        Some(folder) => folder,
        None => return Err("入力フォルダが設定されていません".to_string()),
    };

    let input_folder_path = Path::new(input_folder);

    if !input_folder_path.exists() || !input_folder_path.is_dir() {
        return Err(format!(
            "入力フォルダが存在しないか、ディレクトリではありません: {}",
            input_folder
        ));
    }

    let mut result = Vec::new();

    // 再帰的または非再帰的にファイルを収集
    if recursive {
        collect_files_recursive(input_folder_path, &mut result)?;
    } else {
        collect_files_non_recursive(input_folder_path, &mut result)?;
    }

    Ok(result)
}

// 再帰的にファイルを収集する補助関数
fn collect_files_recursive(dir: &Path, files: &mut Vec<String>) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|e| format!("ディレクトリの読み取りエラー: {}", e))?
    {
        let entry = entry.map_err(|e| format!("エントリの読み取りエラー: {}", e))?;
        let path = entry.path();

        if path.is_file() {
            if let Some(path_str) = path.to_str() {
                files.push(path_str.to_string());
            }
        } else if path.is_dir() {
            collect_files_recursive(&path, files)?;
        }
    }

    Ok(())
}

// 非再帰的にファイルを収集する補助関数
fn collect_files_non_recursive(dir: &Path, files: &mut Vec<String>) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|e| format!("ディレクトリの読み取りエラー: {}", e))?
    {
        let entry = entry.map_err(|e| format!("エントリの読み取りエラー: {}", e))?;
        let path = entry.path();

        if path.is_file() {
            if let Some(path_str) = path.to_str() {
                files.push(path_str.to_string());
            }
        }
    }

    Ok(())
}

fn main() {
    // Tauriアプリケーションを実行
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| Ok(()))
        .invoke_handler(tauri::generate_handler![
            move_file,
            load_files_from_input_folder
        ]);

    #[cfg(desktop)]
    app.run(tauri::generate_context!())
        .expect("アプリの実行中にエラーが発生しました");
}
