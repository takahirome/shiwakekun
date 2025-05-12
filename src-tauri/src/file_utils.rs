use std::fs;
use std::io::{self, Error, ErrorKind};
use std::path::{Path, PathBuf};
use std::process::Command;

/// ファイルの権限を修正する関数
pub fn fix_file_permissions(file_path: &Path) -> io::Result<()> {
    // macOSの場合
    #[cfg(target_os = "macos")]
    {
        // ファイル自体に書き込み権限を付与
        Command::new("chmod")
            .arg("u+w")
            .arg(file_path.to_str().unwrap())
            .output()?;

        // 親ディレクトリに書き込み権限を付与
        if let Some(parent) = file_path.parent() {
            Command::new("chmod")
                .arg("u+w")
                .arg(parent.to_str().unwrap())
                .output()?;
        }

        // 拡張属性を削除（オプション）
        Command::new("xattr")
            .arg("-d")
            .arg("com.apple.provenance")
            .arg(file_path.to_str().unwrap())
            .output()
            .ok(); // エラーは無視（属性がない場合もあるため）
    }

    // Windowsの場合は別の処理が必要かもしれません
    #[cfg(target_os = "windows")]
    {
        // Windowsでの権限処理（必要に応じて実装）
    }

    Ok(())
}

/// 安全なファイル移動関数（移動前に権限を修正）
pub fn safe_move_file(source: &Path, destination: &Path) -> io::Result<()> {
    // 移動前に権限を修正
    fix_file_permissions(source)?;

    // 親ディレクトリが存在しない場合は作成
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }

    // ファイルを移動
    fs::rename(source, destination).or_else(|_| {
        // renameが失敗した場合は、コピー後に削除を試みる
        fs::copy(source, destination)?;
        fs::remove_file(source)
    })
}
