import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Config } from "../types";

/**
 * アプリケーション設定に関するカスタムフック
 */
export function useConfig() {
  // 設定関連の状態
  const [config, setConfig] = useState<Config | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [newExtensions, setNewExtensions] = useState("");
  const [editCategory, setEditCategory] = useState<string | null>(null);

  // 初期化時に設定を読み込む
  useEffect(() => {
    loadConfig();
  }, []);

  /**
   * 設定の読み込み
   */
  async function loadConfig() {
    try {
      const config = await invoke<Config>("load_config");
      setConfig(config);
    } catch (error) {
      console.error("設定の読み込みエラー:", error);
    }
  }

  /**
   * 設定の保存
   */
  async function saveConfig() {
    if (!config) return;
    try {
      await invoke("save_config", { config });
    } catch (error) {
      console.error("設定の保存エラー:", error);
    }
  }

  /**
   * 出力フォルダの選択
   * @returns 選択されたフォルダのパス、またはキャンセルされた場合はnull
   */
  async function selectOutputFolder() {
    try {
      const folder = await open({ directory: true });
      if (folder === null) return null;

      // 出力フォルダリストに追加
      if (config && !config.output_folders.includes(folder as string)) {
        const updatedConfig = await invoke<Config>("add_output_folder", {
          folder,
          config,
        });
        setConfig(updatedConfig);
      }

      return folder as string;
    } catch (error) {
      console.error("フォルダ選択エラー:", error);
      return null;
    }
  }

  /**
   * 入力フォルダの選択
   */
  async function selectInputFolder() {
    try {
      const folder = await open({ directory: true });
      if (folder === null) return;

      if (config) {
        const updatedConfig = await invoke<Config>("set_input_folder", {
          folder,
          config,
        });
        setConfig(updatedConfig);
      }
    } catch (error) {
      console.error("入力フォルダ選択エラー:", error);
    }
  }

  /**
   * 拡張子の文字列を正規化して配列に変換
   * @param extensionsStr カンマ区切りの拡張子文字列
   * @returns 正規化された拡張子の配列
   */
  function normalizeExtensions(extensionsStr: string): string[] {
    return extensionsStr.split(",").map((ext) => {
      let trimmed = ext.trim();
      if (!trimmed.startsWith(".")) {
        trimmed = "." + trimmed;
      }
      return trimmed;
    });
  }

  /**
   * 新しいカテゴリの追加
   */
  function addCategory() {
    if (!config || !newCategory || !newExtensions) return;

    const extensions = normalizeExtensions(newExtensions);
    const updatedCategories = {
      ...config.categories,
      [newCategory]: extensions,
    };

    setConfig({
      ...config,
      categories: updatedCategories,
    });

    // 入力フィールドをクリア
    setNewCategory("");
    setNewExtensions("");

    saveConfig();
  }

  /**
   * 既存カテゴリの更新
   */
  function updateCategory() {
    if (!config || !editCategory || !newExtensions) return;

    const extensions = normalizeExtensions(newExtensions);
    const updatedCategories = {
      ...config.categories,
      [editCategory]: extensions,
    };

    setConfig({
      ...config,
      categories: updatedCategories,
    });

    // 編集モードを終了
    setEditCategory(null);
    setNewExtensions("");

    saveConfig();
  }

  /**
   * カテゴリの削除
   * @param category 削除するカテゴリ名
   */
  function deleteCategory(category: string) {
    if (!config) return;

    // 指定されたカテゴリを除外した新しいcategoriesオブジェクトを作成
    const { [category]: _, ...remainingCategories } = config.categories;

    setConfig({
      ...config,
      categories: remainingCategories,
    });

    saveConfig();
  }

  /**
   * カテゴリ編集モードの開始
   * @param category 編集するカテゴリ名
   */
  function startEditCategory(category: string) {
    if (!config) return;
    setEditCategory(category);
    setNewExtensions(config.categories[category].join(", "));
  }

  return {
    // 状態
    config,
    setConfig,
    newCategory,
    setNewCategory,
    newExtensions,
    setNewExtensions,
    editCategory,
    setEditCategory,
    
    // アクション
    loadConfig,
    saveConfig,
    selectOutputFolder,
    selectInputFolder,
    addCategory,
    updateCategory,
    deleteCategory,
    startEditCategory,
  };
} 