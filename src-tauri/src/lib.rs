// Rustの標準的なコーディングスタイルに準拠したファイル整理ライブラリ
//
// このライブラリは、ファイルをカテゴリごとに分類・整理するための機能を提供します。
// 設定されたルールに基づいてファイルの拡張子を認識し、適切なフォルダに移動します。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::Emitter;
use tokio::fs as tokio_fs;

// -----------------------------------------------------------------------------
// 定数定義
// -----------------------------------------------------------------------------

/// デフォルトカテゴリ名
const DEFAULT_CATEGORY: &str = "Others";

/// 一度に処理するファイルの数
const BATCH_SIZE: usize = 10;

/// バッチ間の待機時間（ミリ秒）
const BATCH_DELAY_MS: u64 = 50;

// -----------------------------------------------------------------------------
// グローバル状態
// -----------------------------------------------------------------------------

/// 処理中断フラグ（グローバル）
static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

// -----------------------------------------------------------------------------
// エラー処理
// -----------------------------------------------------------------------------

/// アプリケーション内で使用するResult型
type Result<T> = std::result::Result<T, AppError>;

/// アプリケーション固有のエラー型
#[derive(Debug)]
enum AppError {
    /// IOエラー
    Io(std::io::Error),
    /// JSONパース/シリアライズエラー
    Json(serde_json::Error),
    /// アプリケーション固有のエラー
    Custom(String),
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Json(err)
    }
}

impl From<String> for AppError {
    fn from(err: String) -> Self {
        AppError::Custom(err)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Io(err) => write!(f, "I/O エラー: {}", err),
            AppError::Json(err) => write!(f, "JSON エラー: {}", err),
            AppError::Custom(msg) => write!(f, "{}", msg),
        }
    }
}

/// エラーハンドリングヘルパー - TauriコマンドのためにAppErrorをStringに変換
fn to_string_error<T>(result: Result<T>) -> std::result::Result<T, String> {
    result.map_err(|e| e.to_string())
}

// -----------------------------------------------------------------------------
// 設定関連
// -----------------------------------------------------------------------------

/// アプリケーション設定
#[derive(Serialize, Deserialize, Clone, Debug)]
struct Config {
    /// ファイル拡張子とカテゴリのマッピング
    categories: HashMap<String, Vec<String>>,
    /// 出力先フォルダのリスト
    output_folders: Vec<String>,
    /// 入力フォルダ設定
    input_folder: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        let mut categories = HashMap::new();
        categories.insert(
            "Images".to_string(),
            vec![
                ".jpg".to_string(),
                ".jpeg".to_string(),
                ".png".to_string(),
                ".gif".to_string(),
                ".bmp".to_string(),
            ],
        );
        categories.insert(
            "Documents".to_string(),
            vec![
                ".pdf".to_string(),
                ".doc".to_string(),
                ".docx".to_string(),
                ".txt".to_string(),
                ".xlsx".to_string(),
                ".pptx".to_string(),
            ],
        );
        categories.insert(
            "Videos".to_string(),
            vec![
                ".mp4".to_string(),
                ".avi".to_string(),
                ".mov".to_string(),
                ".wmv".to_string(),
                ".mkv".to_string(),
            ],
        );
        categories.insert(
            "Audio".to_string(),
            vec![
                ".mp3".to_string(),
                ".wav".to_string(),
                ".ogg".to_string(),
                ".flac".to_string(),
                ".aac".to_string(),
            ],
        );
        categories.insert(
            "Archives".to_string(),
            vec![
                ".zip".to_string(),
                ".rar".to_string(),
                ".7z".to_string(),
                ".tar".to_string(),
                ".gz".to_string(),
            ],
        );

        Config {
            categories,
            output_folders: vec![],
            input_folder: None,
        }
    }
}

/// 設定ファイルのパスを取得
fn get_config_path() -> PathBuf {
    dirs::home_dir()
        .expect("Failed to get home directory")
        .join(".shiwakekunrc.json")
}

/// 設定を読み込む
#[tauri::command]
fn load_config() -> std::result::Result<Config, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(Config::default());
    }

    let result: Result<Config> = (|| {
        let mut file = File::open(&config_path)?;
        let mut contents = String::new();
        file.read_to_string(&mut contents)?;
        Ok(serde_json::from_str(&contents)?)
    })();

    to_string_error(result)
}

/// 設定を保存する
#[tauri::command]
fn save_config(config: Config) -> std::result::Result<(), String> {
    let result: Result<()> = (|| {
        let config_path = get_config_path();
        let serialized = serde_json::to_string_pretty(&config)?;
        let mut file = File::create(&config_path)?;
        file.write_all(serialized.as_bytes())?;
        Ok(())
    })();

    to_string_error(result)
}

/// 設定を更新して保存する
fn update_and_save_config<F>(config: Config, update_fn: F) -> std::result::Result<Config, String>
where
    F: FnOnce(&mut Config),
{
    let mut new_config = config.clone();
    update_fn(&mut new_config);
    save_config(new_config.clone())?;
    Ok(new_config)
}

/// 出力フォルダを追加
#[tauri::command]
fn add_output_folder(folder: String, config: Config) -> std::result::Result<Config, String> {
    update_and_save_config(config, |new_config| {
        if !new_config.output_folders.contains(&folder) {
            new_config.output_folders.push(folder);
        }
    })
}

/// 入力フォルダを設定
#[tauri::command]
fn set_input_folder(folder: String, config: Config) -> std::result::Result<Config, String> {
    update_and_save_config(config, |new_config| {
        new_config.input_folder = Some(folder);
    })
}

/// カテゴリー名のリストを取得
fn get_category_names(config: &Config) -> Vec<String> {
    config
        .categories
        .keys()
        .cloned()
        .chain(std::iter::once(DEFAULT_CATEGORY.to_string())) // デフォルトカテゴリも追加
        .collect()
}

/// ファイル拡張子からカテゴリを取得
fn get_category(ext: &str, categories: &HashMap<String, Vec<String>>) -> String {
    let ext_lower = ext.to_lowercase();
    for (category, exts) in categories {
        if exts.iter().any(|e| e.to_lowercase() == ext_lower) {
            return category.clone();
        }
    }
    DEFAULT_CATEGORY.to_string()
}

/// ファイル処理結果
#[derive(Serialize, Deserialize, Clone, Debug)]
struct FileResult {
    /// 処理されたファイルのパス
    file_path: String,
    /// 処理が成功したかどうか
    success: bool,
    /// 処理結果のメッセージ
    message: String,
}

impl FileResult {
    /// 成功結果を作成
    fn success(file_path: String, message: String) -> Self {
        Self {
            file_path,
            success: true,
            message,
        }
    }

    /// エラー結果を作成
    fn error(file_path: String, message: String) -> Self {
        Self {
            file_path,
            success: false,
            message,
        }
    }
}

/// ファイルを移動する非同期ヘルパー関数
///
/// 複数の方法でファイル移動を試み、可能な限り確実に移動を実行します
async fn move_file_async(src: &Path, dst: &Path) -> std::io::Result<()> {
    // 最大リトライ回数
    const MAX_RETRIES: u8 = 3;
    let mut last_error = None;

    // 複数回試行する
    for attempt in 0..MAX_RETRIES {
        if attempt > 0 {
            // リトライ前に少し待機（待機時間は試行回数に応じて増加）
            thread::sleep(Duration::from_millis(100 * attempt as u64));
        }

        // 方法1: 非同期コピー&削除を試行
        if let Ok(()) = try_async_copy_remove(src, dst).await {
            return Ok(());
        }

        // 方法2: 通常のrenameを試行（異なるファイルシステム間でも動作する場合がある）
        if fs::rename(src, dst).is_ok() {
            return Ok(());
        }

        // 方法3: 同期的なコピー＆削除を試行
        if let Some(err) = try_sync_copy_remove(src, dst) {
            last_error = Some(err);
        } else {
            return Ok(());
        }
    }

    // すべての方法が失敗した場合は最後のエラーを返す
    Err(last_error.unwrap_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "ファイル移動に失敗しました")
    }))
}

/// 非同期コピー＆削除を試行
///
/// tokioのファイルシステム機能を使用して非同期にファイルをコピーし、削除します
async fn try_async_copy_remove(src: &Path, dst: &Path) -> std::io::Result<()> {
    // まず、tokioの非同期FSを使用した方法を試みる
    tokio_fs::copy(src, dst).await?;

    // ファイル削除を試行
    if tokio_fs::remove_file(src).await.is_ok() {
        return Ok(());
    }

    // パーミッション問題を解決してから削除を再試行
    if try_fix_permissions(src).is_ok() && tokio_fs::remove_file(src).await.is_ok() {
        return Ok(());
    }

    // エラーを返す
    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "ファイルのコピー後に元ファイルを削除できませんでした",
    ))
}

/// 同期的なコピー＆削除を試行
///
/// 標準ライブラリのファイル操作機能を使用して同期的にファイルをコピーし、削除します
fn try_sync_copy_remove(src: &Path, dst: &Path) -> Option<std::io::Error> {
    match fs::copy(src, dst) {
        Ok(_) => {
            // 削除を試行
            if fs::remove_file(src).is_ok() {
                return None;
            }

            // macOSでの権限エラーの場合、コマンドラインツールを試す
            #[cfg(target_os = "macos")]
            if let (Some(src_str), Some(dst_str)) = (src.to_str(), dst.to_str()) {
                if std::process::Command::new("mv")
                    .arg("-f")
                    .arg(src_str)
                    .arg(dst_str)
                    .output()
                    .ok()
                    .filter(|output| output.status.success())
                    .is_some()
                {
                    return None;
                }
            }

            Some(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "ファイルのコピー後に元ファイルを削除できませんでした",
            ))
        }
        Err(e) => Some(e),
    }
}

/// ファイルのパーミッション問題を解決しようとする
///
/// Unix系システムでは読み書き権限を設定します
#[cfg(unix)]
fn try_fix_permissions(path: &Path) -> std::io::Result<()> {
    let metadata = fs::metadata(path)?;
    let mut permissions = metadata.permissions();
    permissions.set_mode(0o644); // 読み書き権限を設定
    fs::set_permissions(path, permissions)
}

/// ファイルのパーミッション問題を解決しようとする
///
/// Windows系システムでは読み取り専用属性を解除します
#[cfg(not(unix))]
fn try_fix_permissions(path: &Path) -> std::io::Result<()> {
    let metadata = fs::metadata(path)?;
    let mut permissions = metadata.permissions();
    permissions.set_readonly(false);
    fs::set_permissions(path, permissions)
}

/// 互換性のために同期バージョンも維持
///
/// 非同期関数をブロッキング方式で呼び出すためのラッパー
fn move_file(src: &Path, dst: &Path) -> std::io::Result<()> {
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(move_file_async(src, dst))
}

/// パスがカテゴリフォルダ内かどうかチェック
///
/// 指定されたパスが出力フォルダ内の特定のカテゴリフォルダに含まれるかを判定します
fn is_in_category_folder(path: &Path, output_folder: &Path, category_names: &[String]) -> bool {
    // 出力フォルダからの相対パスを取得
    if let Some(rel_path) = path.strip_prefix(output_folder).ok() {
        // 最初のコンポーネント（フォルダ名）を取得
        if let Some(component_str) = rel_path.components().next().and_then(|comp| {
            if let std::path::Component::Normal(component) = comp {
                component.to_str()
            } else {
                None
            }
        }) {
            // そのフォルダ名がカテゴリ名と一致するか確認
            return category_names
                .iter()
                .any(|category| category == component_str);
        }
    }
    false
}

/// 出力フォルダにあるカテゴリフォルダ内のファイルをフィルタリング
///
/// 入力ファイルリストから、既に出力フォルダのカテゴリ内にあるファイルを除外します
fn filter_output_category_files(
    files: Vec<String>,
    output_folder: &str,
    category_names: &[String],
) -> Vec<String> {
    let output_path = Path::new(output_folder);

    files
        .into_iter()
        .filter(|file_path| {
            let path = Path::new(file_path);
            if path.starts_with(output_folder) {
                // パスが出力フォルダから始まる場合、カテゴリフォルダ内かチェック
                !is_in_category_folder(path, output_path, category_names)
            } else {
                true
            }
        })
        .collect()
}

/// 単一ファイルを処理してカテゴリフォルダに移動
///
/// ファイルの拡張子に基づいて適切なカテゴリを判断し、そのカテゴリフォルダに移動します
fn process_single_file(
    file_path: &str,
    output_path: &Path,
    categories: &HashMap<String, Vec<String>>,
) -> FileResult {
    let path = Path::new(file_path);

    // ファイルが存在しない場合
    if !path.exists() {
        return FileResult::error(file_path.to_string(), "ファイルが存在しません".to_string());
    }

    // カテゴリを取得
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_else(String::new);

    let category = get_category(&ext, categories);

    // カテゴリフォルダを作成
    let category_dir = output_path.join(&category);
    if !category_dir.exists() {
        if let Err(e) = fs::create_dir_all(&category_dir) {
            return FileResult::error(file_path.to_string(), format!("フォルダ作成エラー: {}", e));
        }
    }

    // 移動先のパスを作成
    let file_name = match path.file_name().and_then(|n| n.to_str()) {
        Some(name) => name,
        None => return FileResult::error(file_path.to_string(), "無効なファイル名".to_string()),
    };

    let mut dest_path = category_dir.join(file_name);

    // 既に同名ファイルがある場合は連番を付与
    let mut counter = 1;
    while dest_path.exists() {
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => {
                return FileResult::error(file_path.to_string(), "無効なファイル名".to_string())
            }
        };

        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let new_name = format!("{}_{}.{}", stem, counter, ext);
        dest_path = category_dir.join(new_name);
        counter += 1;
    }

    // ファイルを移動
    match move_file(path, &dest_path) {
        Ok(_) => FileResult::success(file_path.to_string(), format!("{}に移動", category)),
        Err(e) => FileResult::error(file_path.to_string(), format!("移動エラー: {}", e)),
    }
}

/// 処理の進捗状況
#[derive(Serialize, Clone, Debug)]
struct OrganizeProgress {
    /// 処理対象の総ファイル数
    total_files: usize,
    /// 処理済みファイル数
    processed_files: usize,
    /// 現在の処理結果
    current_result: Option<FileResult>,
    /// 処理が完了したかどうか
    finished: bool,
    /// バッチ処理モードか
    batch_progress: bool,
}

/// 進捗通知を送信
fn send_progress_notification(
    window: &tauri::Window,
    total_files: usize,
    processed_files: usize,
    current_result: Option<FileResult>,
    finished: bool,
) {
    let _ = window.emit(
        "organize-progress",
        OrganizeProgress {
            total_files,
            processed_files,
            current_result,
            finished,
            batch_progress: true,
        },
    );
}

/// キャンセル時の処理
fn handle_cancel(window: &tauri::Window, total_files: usize, processed_files: usize) -> bool {
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        // 処理中断を通知
        send_progress_notification(window, total_files, processed_files, None, true);
        return true;
    }
    false
}

/// 処理を中断
#[tauri::command]
fn cancel_processing() -> std::result::Result<(), String> {
    // 中断フラグを立てる
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    Ok(())
}

/// ファイルを整理
#[tauri::command]
fn organize_files(
    files: Vec<String>,
    output_folder: String,
    config: Config,
) -> std::result::Result<Vec<FileResult>, String> {
    let result: Result<Vec<FileResult>> = (|| {
        let output_path = Path::new(&output_folder);
        if !output_path.exists() {
            fs::create_dir_all(output_path)?;
        }

        // カテゴリ名のリストを取得
        let category_names = get_category_names(&config);

        // 出力先フォルダのカテゴリ内ファイルをフィルタリング
        let filtered_files = filter_output_category_files(files, &output_folder, &category_names);

        let mut results = Vec::new();

        // 各ファイルを処理
        for file_path in filtered_files {
            let result = process_single_file(&file_path, output_path, &config.categories);
            results.push(result);
        }

        Ok(results)
    })();

    to_string_error(result)
}

/// 入力フォルダからファイルを読み込む
#[tauri::command]
fn load_files_from_input_folder(
    config: Config,
    recursive: bool,
) -> std::result::Result<Vec<String>, String> {
    let result: Result<Vec<String>> = (|| {
        // 入力フォルダが設定されているか確認
        let input_folder = config
            .input_folder
            .as_ref()
            .ok_or_else(|| AppError::Custom("入力フォルダが設定されていません".to_string()))?;

        let path = Path::new(input_folder);

        // 入力フォルダの存在確認
        if !path.exists() {
            return Err(AppError::Custom(format!(
                "入力フォルダが存在しません: {}",
                input_folder
            )));
        }

        // ディレクトリかどうか確認
        if !path.is_dir() {
            return Err(AppError::Custom(format!(
                "指定されたパスはディレクトリではありません: {}",
                input_folder
            )));
        }

        let mut files = Vec::new();

        // 出力先フォルダのパスを収集
        let output_folders: Vec<PathBuf> = config
            .output_folders
            .iter()
            .map(|f| Path::new(f).to_path_buf())
            .collect();

        // カテゴリ名のリスト
        let category_names = get_category_names(&config);

        // ファイルを収集
        collect_files(
            path,
            &mut files,
            recursive,
            &output_folders,
            &category_names,
        )?;

        Ok(files)
    })();

    to_string_error(result)
}

/// ディレクトリからファイルを収集する
///
/// 指定されたディレクトリ内のファイルを再帰的または非再帰的に収集します
fn collect_files(
    dir: &Path,
    files: &mut Vec<String>,
    recursive: bool,
    output_folders: &[PathBuf],
    category_names: &[String],
) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        // 出力先フォルダの下位階層にあるカテゴリフォルダ内のファイルを除外
        let should_exclude = output_folders.iter().any(|output_folder| {
            path.starts_with(output_folder)
                && is_in_category_folder(&path, output_folder, category_names)
        });

        if should_exclude {
            continue;
        }

        if path.is_file() {
            // ファイルの場合はリストに追加
            if let Some(path_str) = path.to_str() {
                files.push(path_str.to_string());
            }
        } else if recursive && path.is_dir() {
            // ディレクトリで再帰処理が有効な場合は再帰的に収集
            collect_files(&path, files, recursive, output_folders, category_names)?;
        }
    }

    Ok(())
}

/// 非同期でファイルを整理
#[tauri::command]
fn organize_files_async(
    files: Vec<String>,
    output_folder: String,
    config: Config,
    window: tauri::Window,
) -> std::result::Result<Vec<FileResult>, String> {
    // 開始時に中断フラグをリセット
    CANCEL_FLAG.store(false, Ordering::SeqCst);

    let result: Result<Vec<FileResult>> = (|| {
        let output_path = Path::new(&output_folder);
        if !output_path.exists() {
            fs::create_dir_all(output_path)?;
        }

        // カテゴリ名のリスト
        let category_names = get_category_names(&config);

        // フィルタリング
        let filtered_files = filter_output_category_files(files, &output_folder, &category_names);

        let total_files = filtered_files.len();

        // 初期化メッセージを送信
        send_progress_notification(&window, total_files, 0, None, false);

        // 別スレッドで処理
        let window_clone = window.clone();
        let config_clone = config.clone();
        let output_folder_clone = output_folder.clone();

        std::thread::spawn(move || {
            let mut results = Vec::new();
            let mut processed = 0;
            let output_path = Path::new(&output_folder_clone);

            // バッチサイズごとに処理
            for batch in filtered_files.chunks(BATCH_SIZE) {
                // 中断フラグをチェック
                if handle_cancel(&window_clone, total_files, processed) {
                    return;
                }

                for file_path in batch {
                    // 各ファイル処理前にも中断フラグをチェック
                    if handle_cancel(&window_clone, total_files, processed) {
                        return;
                    }

                    // ファイルを処理
                    let result =
                        process_single_file(file_path, output_path, &config_clone.categories);

                    results.push(result.clone());
                    processed += 1;

                    // 進捗を通知
                    send_progress_notification(
                        &window_clone,
                        total_files,
                        processed,
                        Some(result),
                        processed == total_files,
                    );
                }

                // バッチ処理の後に少し待機してUIの更新時間を確保
                thread::sleep(Duration::from_millis(BATCH_DELAY_MS));
            }

            // 全ての処理が完了したことを通知
            send_progress_notification(&window_clone, total_files, processed, None, true);
        });

        Ok(Vec::new())
    })();

    to_string_error(result)
}

/// テスト用の挨拶関数
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// ファイルのパーミッションを変更する関数
#[tauri::command]
fn change_file_permissions(file_path: String, mode: u32) -> std::result::Result<(), String> {
    let result: Result<()> = (|| {
        let path = Path::new(&file_path);
        if !path.exists() {
            return Err(AppError::Custom("ファイルが存在しません".to_string()));
        }

        #[cfg(unix)]
        {
            // Unixシステム（macOS、Linux）でのファイルパーミッション変更
            let metadata = fs::metadata(path)?;
            let mut permissions = metadata.permissions();
            permissions.set_mode(mode);
            fs::set_permissions(path, permissions)?;
            Ok(())
        }

        #[cfg(not(unix))]
        {
            // Windowsではパーミッションの仕組みが異なるため、別の方法が必要
            let metadata = fs::metadata(path)?;
            let mut permissions = metadata.permissions();

            if mode & 0o200 != 0 {
                // 書き込み権限を付与（読み取り専用を解除）
                permissions.set_readonly(false);
            } else {
                // 書き込み権限を削除（読み取り専用に設定）
                permissions.set_readonly(true);
            }

            fs::set_permissions(path, permissions)?;
            Ok(())
        }
    })();

    to_string_error(result)
}

/// アプリケーションのエントリーポイント
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_macos_permissions::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            organize_files,
            load_config,
            save_config,
            organize_files_async,
            cancel_processing,
            add_output_folder,
            set_input_folder,
            load_files_from_input_folder,
            change_file_permissions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
