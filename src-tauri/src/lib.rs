// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::fs as tokio_fs;

// 処理中断フラグ（グローバル）
static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

// エラーラッピング用のヘルパー関数（エラー処理を短くするため）
fn map_err<T, E: std::fmt::Display>(result: Result<T, E>, message: &str) -> Result<T, String> {
    result.map_err(|e| format!("{}: {}", message, e))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Config {
    categories: HashMap<String, Vec<String>>,
    output_folders: Vec<String>,
    input_folder: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        let mut categories = HashMap::new();
        categories.insert("Images".to_string(), vec![".jpg".to_string(), ".jpeg".to_string(), ".png".to_string(), ".gif".to_string(), ".bmp".to_string()]);
        categories.insert("Documents".to_string(), vec![".pdf".to_string(), ".doc".to_string(), ".docx".to_string(), ".txt".to_string(), ".xlsx".to_string(), ".pptx".to_string()]);
        categories.insert("Videos".to_string(), vec![".mp4".to_string(), ".avi".to_string(), ".mov".to_string(), ".wmv".to_string(), ".mkv".to_string()]);
        categories.insert("Audio".to_string(), vec![".mp3".to_string(), ".wav".to_string(), ".ogg".to_string(), ".flac".to_string(), ".aac".to_string()]);
        categories.insert("Archives".to_string(), vec![".zip".to_string(), ".rar".to_string(), ".7z".to_string(), ".tar".to_string(), ".gz".to_string()]);
        
        Config {
            categories,
            output_folders: vec![],
            input_folder: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct FileResult {
    file_path: String,
    success: bool,
    message: String,
}

fn get_config_path() -> PathBuf {
    dirs::home_dir()
        .expect("Failed to get home directory")
        .join(".shiwakekunrc.json")
}

#[tauri::command]
fn load_config() -> Result<Config, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(Config::default());
    }

    let mut file = map_err(File::open(&config_path), "設定ファイルを開けません")?;
    let mut contents = String::new();
    map_err(file.read_to_string(&mut contents), "設定ファイルを読み込めません")?;

    map_err(serde_json::from_str(&contents), "設定ファイルの解析に失敗しました")
}

#[tauri::command]
fn save_config(config: Config) -> Result<(), String> {
    let config_path = get_config_path();
    let serialized = map_err(serde_json::to_string_pretty(&config), "設定のシリアル化に失敗しました")?;
    
    let mut file = map_err(File::create(&config_path), "設定ファイルの作成に失敗しました")?;
    map_err(file.write_all(serialized.as_bytes()), "設定ファイルの書き込みに失敗しました")
}

fn get_category(ext: &str, categories: &HashMap<String, Vec<String>>) -> String {
    let ext_lower = ext.to_lowercase();
    for (category, exts) in categories {
        if exts.iter().any(|e| e.to_lowercase() == ext_lower) {
            return category.clone();
        }
    }
    "Others".to_string()
}

// ファイルを移動するヘルパー関数を追加
async fn move_file_async(src: &Path, dst: &Path) -> Result<(), std::io::Error> {
    // 最大リトライ回数
    let max_retries = 3;
    let mut last_error = None;

    // いくつかの方法を試みる
    for attempt in 0..max_retries {
        if attempt > 0 {
            // リトライ前に少し待機
            thread::sleep(Duration::from_millis(100 * attempt as u64));
        }

        // まず、tokioの非同期FSを使用した方法を試みる
        match tokio_fs::copy(src, dst).await {
            Ok(_) => {
                match tokio_fs::remove_file(src).await {
                    Ok(_) => return Ok(()),
                    Err(e) => {
                        last_error = Some(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("削除エラー: {}", e)
                        ));
                    }
                }
            },
            Err(_e) => {
                // 代替方法としてstandard fsライブラリを試す
                match fs::rename(src, dst) {
                    Ok(_) => return Ok(()),
                    Err(_) => {
                        // 最後の手段としてコピー&削除を試みる
                        match fs::copy(src, dst) {
                            Ok(_) => {
                                match fs::remove_file(src) {
                                    Ok(_) => return Ok(()),
                                    Err(e3) => {
                                        // macOSでの権限エラー (os error 13) の場合、コマンドラインツールを試す
                                        #[cfg(target_os = "macos")]
                                        {
                                            if e3.kind() == std::io::ErrorKind::PermissionDenied || 
                                               format!("{}", e3).contains("Permission denied") {
                                                // mvコマンドを実行してファイルを移動
                                                if let (Some(src_str), Some(dst_str)) = (src.to_str(), dst.to_str()) {
                                                    let output = std::process::Command::new("mv")
                                                        .arg("-f")
                                                        .arg(src_str)
                                                        .arg(dst_str)
                                                        .output();
                                                    
                                                    match output {
                                                        Ok(output) if output.status.success() => return Ok(()),
                                                        _ => {}
                                                    }
                                                }
                                            }
                                        }
                                        last_error = Some(e3);
                                    }
                                }
                            },
                            Err(e3) => {
                                last_error = Some(e3);
                            }
                        }
                    }
                }
            }
        }
    }

    // すべての方法が失敗した場合は最後のエラーを返す
    Err(last_error.unwrap_or_else(|| std::io::Error::new(
        std::io::ErrorKind::Other,
        "ファイル移動に失敗しました"
    )))
}

// 互換性のために同期バージョンも維持
fn move_file(src: &Path, dst: &Path) -> Result<(), std::io::Error> {
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(move_file_async(src, dst))
}

#[tauri::command]
fn organize_files(files: Vec<String>, output_folder: String, config: Config) -> Result<Vec<FileResult>, String> {
    let output_path = Path::new(&output_folder);
    if !output_path.exists() {
        fs::create_dir_all(output_path).map_err(|e| e.to_string())?;
    }

    // カテゴリ名のリスト
    let category_names: Vec<String> = config.categories.keys()
        .cloned()
        .chain(std::iter::once("Others".to_string())) // デフォルトカテゴリも追加
        .collect();

    // 出力先フォルダの下位階層にあるカテゴリフォルダ内のファイルを対象外にするためにフィルタリング
    let filtered_files: Vec<String> = files
        .into_iter()
        .filter(|file_path| {
            let path = Path::new(file_path);
            if path.starts_with(&output_folder) {
                // パスが出力フォルダから始まる場合、カテゴリフォルダ内かチェック
                if let Some(rel_path) = path.strip_prefix(output_path).ok() {
                    let first_component = rel_path.components().next();
                    if let Some(std::path::Component::Normal(component)) = first_component {
                        if let Some(component_str) = component.to_str() {
                            // カテゴリフォルダ内ならスキップ
                            return !category_names.iter().any(|category| category == component_str);
                        }
                    }
                }
            }
            true
        })
        .collect();

    let mut results = Vec::new();

    for file_path in filtered_files {
        let path = Path::new(&file_path);
        if !path.exists() {
            results.push(FileResult {
                file_path: file_path.clone(),
                success: false,
                message: "ファイルが存在しません".to_string(),
            });
            continue;
        }

        // カテゴリを取得
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e))
            .unwrap_or_else(|| String::new());
        
        let category = get_category(&ext, &config.categories);
        
        // カテゴリフォルダを作成
        let category_dir = output_path.join(&category);
        if !category_dir.exists() {
            fs::create_dir_all(&category_dir).map_err(|e| e.to_string())?;
        }
        
        // 移動先のパスを作成
        let file_name = path.file_name().and_then(|n| n.to_str()).ok_or("無効なファイル名")?;
        let mut dest_path = category_dir.join(file_name);
        
        // 既に同名ファイルがある場合は連番を付与
        let mut counter = 1;
        while dest_path.exists() {
            let stem = path.file_stem().and_then(|s| s.to_str()).ok_or("無効なファイル名")?;
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let new_name = format!("{}_{}.{}", stem, counter, ext);
            dest_path = category_dir.join(new_name);
            counter += 1;
        }
        
        // ファイルを移動
        match move_file(path, &dest_path) {
            Ok(_) => {
                results.push(FileResult {
                    file_path: file_path.clone(),
                    success: true,
                    message: format!("{}に移動", category),
                });
            },
            Err(e) => {
                results.push(FileResult {
                    file_path: file_path.clone(),
                    success: false,
                    message: format!("移動エラー: {}", e),
                });
            }
        }
    }
    
    Ok(results)
}

#[tauri::command]
fn add_output_folder(folder: String, config: Config) -> Result<Config, String> {
    let mut new_config = config.clone();
    if !new_config.output_folders.contains(&folder) {
        new_config.output_folders.push(folder);
    }
    save_config(new_config.clone())?;
    Ok(new_config)
}

#[tauri::command]
fn set_input_folder(folder: String, config: Config) -> Result<Config, String> {
    let mut new_config = config.clone();
    new_config.input_folder = Some(folder);
    save_config(new_config.clone())?;
    Ok(new_config)
}

#[tauri::command]
fn load_files_from_input_folder(config: Config, recursive: bool) -> Result<Vec<String>, String> {
    let input_folder = match &config.input_folder {
        Some(folder) => folder,
        None => return Err("入力フォルダが設定されていません".to_string()),
    };

    let path = Path::new(input_folder);
    if !path.exists() {
        return Err(format!("入力フォルダが存在しません: {}", input_folder));
    }

    if !path.is_dir() {
        return Err(format!("指定されたパスはディレクトリではありません: {}", input_folder));
    }

    let mut files = Vec::new();
    
    // 出力先フォルダと、カテゴリ名のリストを収集
    let output_folders: Vec<PathBuf> = config.output_folders.iter()
        .map(|f| Path::new(f).to_path_buf())
        .collect();
    
    // カテゴリ名のリスト
    let category_names: Vec<String> = config.categories.keys()
        .cloned()
        .chain(std::iter::once("Others".to_string())) // デフォルトカテゴリも追加
        .collect();
    
    collect_files(&path, &mut files, recursive, &output_folders, &category_names)?;

    Ok(files)
}

fn collect_files(
    dir: &Path, 
    files: &mut Vec<String>, 
    recursive: bool, 
    output_folders: &[PathBuf],
    category_names: &[String]
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        
        // 出力先フォルダの下位階層にあるカテゴリフォルダ内のファイルを除外
        let should_exclude = output_folders.iter().any(|output_folder| {
            if path.starts_with(output_folder) {
                // パスが出力フォルダから始まる場合、カテゴリフォルダ内かチェック
                if let Some(rel_path) = path.strip_prefix(output_folder).ok() {
                    let first_component = rel_path.components().next();
                    if let Some(std::path::Component::Normal(component)) = first_component {
                        if let Some(component_str) = component.to_str() {
                            return category_names.iter().any(|category| category == component_str);
                        }
                    }
                }
            }
            false
        });
        
        if should_exclude {
            continue;
        }
        
        if path.is_file() {
            if let Some(path_str) = path.to_str() {
                files.push(path_str.to_string());
            }
        } else if recursive && path.is_dir() {
            collect_files(&path, files, recursive, output_folders, category_names)?;
        }
    }
    
    Ok(())
}

#[derive(Serialize, Clone, Debug)]
struct OrganizeProgress {
    total_files: usize,
    processed_files: usize,
    current_result: Option<FileResult>,
    finished: bool,
    batch_progress: bool,
}

const BATCH_SIZE: usize = 10; // 一度に処理するファイルの数
const BATCH_DELAY_MS: u64 = 50; // バッチ間の待機時間（ミリ秒）

#[tauri::command]
fn cancel_processing() -> Result<(), String> {
    // 中断フラグを立てる
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn organize_files_async(
    files: Vec<String>, 
    output_folder: String, 
    config: Config,
    window: tauri::Window,
) -> Result<Vec<FileResult>, String> {
    // 開始時に中断フラグをリセット
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    
    let output_path = Path::new(&output_folder);
    if !output_path.exists() {
        fs::create_dir_all(output_path).map_err(|e| e.to_string())?;
    }

    // カテゴリ名のリスト
    let category_names: Vec<String> = config.categories.keys()
        .cloned()
        .chain(std::iter::once("Others".to_string())) // デフォルトカテゴリも追加
        .collect();

    // 出力先フォルダの下位階層にあるカテゴリフォルダ内のファイルを対象外にするためにフィルタリング
    let filtered_files: Vec<String> = files
        .into_iter()
        .filter(|file_path| {
            let path = Path::new(file_path);
            if path.starts_with(&output_folder) {
                // パスが出力フォルダから始まる場合、カテゴリフォルダ内かチェック
                if let Some(rel_path) = path.strip_prefix(output_path).ok() {
                    let first_component = rel_path.components().next();
                    if let Some(std::path::Component::Normal(component)) = first_component {
                        if let Some(component_str) = component.to_str() {
                            // カテゴリフォルダ内ならスキップ
                            return !category_names.iter().any(|category| category == component_str);
                        }
                    }
                }
            }
            true
        })
        .collect();

    let total_files = filtered_files.len();
    
    // 処理を別スレッドで実行
    let window_clone = window.clone();
    let config_clone = config.clone();
    let output_folder_clone = output_folder.clone();
    
    // 初期化メッセージを送信
    let _ = window.emit("organize-progress", OrganizeProgress {
        total_files,
        processed_files: 0,
        current_result: None,
        finished: false,
        batch_progress: true,
    });
    
    // 新しいスレッドで処理を実行
    std::thread::spawn(move || {
        let mut results = Vec::new();
        let mut processed = 0;
        let output_path = Path::new(&output_folder_clone);
        
        // バッチサイズごとに処理
        for batch in filtered_files.chunks(BATCH_SIZE) {
            // 中断フラグをチェック
            if CANCEL_FLAG.load(Ordering::SeqCst) {
                // 処理中断を通知
                let _ = window_clone.emit("organize-progress", OrganizeProgress {
                    total_files,
                    processed_files: processed,
                    current_result: None,
                    finished: true, // 処理完了フラグを立てる
                    batch_progress: true,
                });
                return;
            }
            
            for file_path in batch {
                // 各ファイル処理前にも中断フラグをチェック
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    // 処理中断を通知
                    let _ = window_clone.emit("organize-progress", OrganizeProgress {
                        total_files,
                        processed_files: processed,
                        current_result: None,
                        finished: true, // 処理完了フラグを立てる
                        batch_progress: true,
                    });
                    return;
                }
                
                let path = Path::new(file_path);
                let result = if !path.exists() {
                    FileResult {
                        file_path: file_path.clone(),
                        success: false,
                        message: "ファイルが存在しません".to_string(),
                    }
                } else {
                    // カテゴリを取得
                    let ext = path.extension()
                        .and_then(|e| e.to_str())
                        .map(|e| format!(".{}", e))
                        .unwrap_or_else(|| String::new());
                    
                    let category = get_category(&ext, &config_clone.categories);
                    
                    // カテゴリフォルダを作成
                    let category_dir = output_path.join(&category);
                    if !category_dir.exists() {
                        match fs::create_dir_all(&category_dir) {
                            Ok(_) => {},
                            Err(e) => {
                                let result = FileResult {
                                    file_path: file_path.clone(),
                                    success: false,
                                    message: format!("フォルダ作成エラー: {}", e),
                                };
                                results.push(result.clone());
                                processed += 1;
                                
                                let _ = window_clone.emit("organize-progress", OrganizeProgress {
                                    total_files,
                                    processed_files: processed,
                                    current_result: Some(result),
                                    finished: processed == total_files,
                                    batch_progress: true,
                                });
                                
                                continue;
                            }
                        }
                    }
                    
                    // 移動先のパスを作成
                    let file_name = match path.file_name().and_then(|n| n.to_str()) {
                        Some(name) => name,
                        None => {
                            let result = FileResult {
                                file_path: file_path.clone(),
                                success: false,
                                message: "無効なファイル名".to_string(),
                            };
                            results.push(result.clone());
                            processed += 1;
                            
                            let _ = window_clone.emit("organize-progress", OrganizeProgress {
                                total_files,
                                processed_files: processed,
                                current_result: Some(result),
                                finished: processed == total_files,
                                batch_progress: true,
                            });
                            
                            continue;
                        }
                    };
                    
                    let mut dest_path = category_dir.join(file_name);
                    
                    // 既に同名ファイルがある場合は連番を付与
                    let mut counter = 1;
                    while dest_path.exists() {
                        let stem = match path.file_stem().and_then(|s| s.to_str()) {
                            Some(s) => s,
                            None => {
                                let result = FileResult {
                                    file_path: file_path.clone(),
                                    success: false,
                                    message: "無効なファイル名".to_string(),
                                };
                                results.push(result.clone());
                                processed += 1;
                                
                                let _ = window_clone.emit("organize-progress", OrganizeProgress {
                                    total_files,
                                    processed_files: processed,
                                    current_result: Some(result),
                                    finished: processed == total_files,
                                    batch_progress: true,
                                });
                                
                                continue;
                            }
                        };
                        
                        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                        let new_name = format!("{}_{}.{}", stem, counter, ext);
                        dest_path = category_dir.join(new_name);
                        counter += 1;
                    }
                    
                    // ファイルを移動
                    match move_file(path, &dest_path) {
                        Ok(_) => FileResult {
                            file_path: file_path.clone(),
                            success: true,
                            message: format!("{}に移動", category),
                        },
                        Err(e) => FileResult {
                            file_path: file_path.clone(),
                            success: false,
                            message: format!("移動エラー: {}", e),
                        }
                    }
                };

                results.push(result.clone());
                processed += 1;

                // 進捗を通知
                let _ = window_clone.emit("organize-progress", OrganizeProgress {
                    total_files,
                    processed_files: processed,
                    current_result: Some(result),
                    finished: processed == total_files,
                    batch_progress: true,
                });
            }
            
            // バッチ処理の後に少し待機してUIの更新時間を確保
            thread::sleep(Duration::from_millis(BATCH_DELAY_MS));
        }
        
        // 全ての処理が完了したことを通知
        let _ = window_clone.emit("organize-progress", OrganizeProgress {
            total_files,
            processed_files: processed,
            current_result: None,
            finished: true,
            batch_progress: true,
        });
    });
    
    // 処理が別スレッドで実行されるため、即座に空の結果を返す
    Ok(Vec::new())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_macos_permissions::init())
        // Instead, we use the built-in shadow support in Tauri v2
        // by setting it in tauri.conf.json
        .invoke_handler(tauri::generate_handler![
            greet,
            organize_files,
            load_config,
            save_config,
            organize_files_async,
            cancel_processing,
            add_output_folder,
            set_input_folder,
            load_files_from_input_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
