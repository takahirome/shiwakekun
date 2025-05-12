import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Config } from "../types";

export function useConfig() {
  const [config, setConfig] = useState<Config | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [newExtensions, setNewExtensions] = useState("");
  const [editCategory, setEditCategory] = useState<string | null>(null);

  // 設定の読み込み
  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const config = await invoke<Config>("load_config");
      setConfig(config);
    } catch (error) {
      console.error("設定の読み込みエラー:", error);
    }
  }

  async function saveConfig() {
    if (!config) return;
    try {
      await invoke("save_config", { config });
    } catch (error) {
      console.error("設定の保存エラー:", error);
    }
  }

  async function selectOutputFolder() {
    try {
      const folder = await open({ directory: true });
      if (folder === null) return folder;

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

  async function selectInputFolder() {
    try {
      const folder = await open({ directory: true });
      if (folder === null) return;

      // 入力フォルダを設定
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

  function addCategory() {
    if (!config || !newCategory || !newExtensions) return;

    const extensions = newExtensions.split(",").map((ext) => {
      let trimmed = ext.trim();
      if (!trimmed.startsWith(".")) {
        trimmed = "." + trimmed;
      }
      return trimmed;
    });

    const updatedCategories = {
      ...config.categories,
      [newCategory]: extensions,
    };

    setConfig({
      ...config,
      categories: updatedCategories,
    });

    setNewCategory("");
    setNewExtensions("");

    saveConfig();
  }

  function updateCategory() {
    if (!config || !editCategory || !newExtensions) return;

    const extensions = newExtensions.split(",").map((ext) => {
      let trimmed = ext.trim();
      if (!trimmed.startsWith(".")) {
        trimmed = "." + trimmed;
      }
      return trimmed;
    });

    const updatedCategories = {
      ...config.categories,
      [editCategory]: extensions,
    };

    setConfig({
      ...config,
      categories: updatedCategories,
    });

    setEditCategory(null);
    setNewExtensions("");

    saveConfig();
  }

  function deleteCategory(category: string) {
    if (!config) return;

    const { [category]: _, ...remainingCategories } = config.categories;

    setConfig({
      ...config,
      categories: remainingCategories,
    });

    saveConfig();
  }

  function startEditCategory(category: string) {
    if (!config) return;
    setEditCategory(category);
    setNewExtensions(config.categories[category].join(", "));
  }

  return {
    config,
    setConfig,
    loadConfig,
    saveConfig,
    selectOutputFolder,
    selectInputFolder,
    newCategory,
    setNewCategory,
    newExtensions,
    setNewExtensions,
    editCategory,
    setEditCategory,
    addCategory,
    updateCategory,
    deleteCategory,
    startEditCategory,
  };
} 