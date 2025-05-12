import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FileResult, OrganizeProgress, Config, TabType } from "../types";

/**
 * ファイル操作に関するカスタムフック
 */
export function useFiles() {
  // ファイル関連の状態
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedOutputFolder, setSelectedOutputFolder] = useState<string>("");
  const [results, setResults] = useState<FileResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<OrganizeProgress | null>(null);
  const [isRecursive, setIsRecursive] = useState(true);

  /**
   * ファイル選択ダイアログを表示して、ファイルを選択する
   */
  async function selectFiles() {
    try {
      const selected = await open({ multiple: true });
      if (!selected) return;
      
      if (Array.isArray(selected)) {
        setSelectedFiles(selected);
      } else {
        setSelectedFiles([selected]);
      }
    } catch (error) {
      console.error("ファイル選択エラー:", error);
    }
  }

  /**
   * 入力フォルダからファイルを読み込む
   * @param config アプリケーション設定
   * @returns 読み込まれたファイルパスの配列
   */
  async function loadFilesFromInputFolder(config: Config | null) {
    if (!config?.input_folder) {
      alert("入力フォルダが設定されていません");
      return [];
    }

    try {
      const files = await invoke<string[]>("load_files_from_input_folder", {
        config,
        recursive: isRecursive,
      });
      setSelectedFiles(files);
      return files;
    } catch (error) {
      console.error("ファイル読み込みエラー:", error);
      alert(`エラーが発生しました: ${error}`);
      return [];
    }
  }

  /**
   * ファイルを整理する
   * @param config アプリケーション設定
   * @param onComplete 完了時のコールバック
   */
  async function organizeFiles(config: Config | null, onComplete?: (tab: TabType) => void) {
    // バリデーション
    if (!config || selectedFiles.length === 0 || !selectedOutputFolder) {
      alert("ファイルと出力フォルダを選択してください");
      return;
    }

    // 状態の初期化
    setIsProcessing(true);
    setResults([]);
    setProgress({
      total_files: selectedFiles.length,
      processed_files: 0,
      finished: false,
    });
    
    // 結果タブへの切り替え
    if (onComplete) {
      onComplete("results");
    }

    try {
      // ファイル整理を実行
      await invoke("organize_files_async", {
        files: selectedFiles,
        outputFolder: selectedOutputFolder,
        config,
      });
    } catch (error) {
      console.error("ファイル整理エラー:", error);
      alert(`エラーが発生しました: ${error}`);
      setIsProcessing(false);
    }
  }

  /**
   * 処理をキャンセルする
   */
  async function cancelProcessing() {
    try {
      await invoke("cancel_processing");
    } catch (error) {
      console.error("処理中断エラー:", error);
    }
  }

  /**
   * ファイルのパーミッションを変更する
   * @param filePath ファイルパス
   * @param writable 書き込み可能にするかどうか
   * @returns 成功したかどうか
   */
  async function changeFilePermissions(filePath: string, writable = true) {
    try {
      // Unix系のパーミッション値（8進数）
      // 0o644: 自分は読み書き可能、グループとその他は読み取りのみ
      // 0o444: 全員が読み取りのみ
      const mode = writable ? 0o644 : 0o444;
      
      await invoke("change_file_permissions", {
        filePath,
        mode,
      });
      
      return true;
    } catch (error) {
      console.error("パーミッション変更エラー:", error);
      return false;
    }
  }

  return {
    // 状態
    selectedFiles,
    setSelectedFiles,
    selectedOutputFolder,
    setSelectedOutputFolder,
    results,
    setResults,
    isProcessing,
    setIsProcessing,
    progress,
    setProgress,
    isRecursive,
    setIsRecursive,
    
    // アクション
    selectFiles,
    loadFilesFromInputFolder,
    organizeFiles,
    cancelProcessing,
    changeFilePermissions,
  };
} 