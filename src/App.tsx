import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/api/os";
import "./App.css";
import {
  AppShell,
  Text,
  Button,
  Group,
  Tabs,
  Container,
  Box,
} from "@mantine/core";
import {
  IconFileUpload,
  IconFolderOpen,
  IconSettings,
  IconList,
  IconShieldLock,
} from "@tabler/icons-react";

// 型定義のインポート
import { TabType, OrganizeProgress, Config } from "./types";

// フックのインポート
import { useConfig } from "./hooks/useConfig";
import { useFiles } from "./hooks/useFiles";
import { usePermissions } from "./hooks/usePermissions";

// コンポーネントのインポート
import { TitleBar } from "./components/TitleBar";
import { FilesTab } from "./components/FilesTab";
import { FoldersTab } from "./components/FoldersTab";
import { ResultsTab } from "./components/ResultsTab";
import { SettingsTab } from "./components/SettingsTab";
import { PermissionsTab } from "./components/PermissionsTab";

function App() {
  // フックの使用
  const {
    config,
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
    selectInputFolder,
  } = useConfig();

  const {
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
    selectFiles,
    loadFilesFromInputFolder,
    organizeFiles,
    cancelProcessing,
  } = useFiles();

  const { permissionStatus, checkPermissions, requestPermission } =
    usePermissions();

  // コンポーネント内の状態
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("folders");
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // イベントリスナーの設定
  useEffect(() => {
    // イベントリスナーを設定
    const unlistenFn = listen("organize-progress", (event) => {
      const progress = event.payload as OrganizeProgress;
      setProgress(progress);

      if (progress.current_result) {
        setResults((prevResults) => [...prevResults, progress.current_result!]);
      }

      if (progress.finished) {
        setIsProcessing(false);
        // 処理完了時に結果タブに切り替える
        setActiveTab("results");
      }
    });

    // ファイルドロップイベントリスナーを設定
    const fileDropListener = listen<{ paths: string[] }>(
      "tauri://drag-drop",
      (event) => {
        const files = event.payload.paths;
        if (files && files.length > 0) {
          setSelectedFiles(files);
          setIsDragging(false);
        }
      }
    );

    // ドラッグエンターイベントリスナー
    const dragEnterListener = listen("tauri://drag-enter", () => {
      setIsDragging(true);
    });

    // ドラッグリーブイベントリスナー
    const dragLeaveListener = listen("tauri://drag-leave", () => {
      setIsDragging(false);
    });

    return () => {
      unlistenFn.then((unlisten) => unlisten());
      fileDropListener.then((unlisten) => unlisten());
      dragEnterListener.then((unlisten) => unlisten());
      dragLeaveListener.then((unlisten) => unlisten());
    };
  }, []);

  // 出力フォルダの選択処理
  const handleSelectOutputFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const folder = await open({ directory: true });

      if (folder) {
        // 選択されたフォルダが配列の場合は最初の要素を使用
        const selectedFolder = Array.isArray(folder) ? folder[0] : folder;
        setSelectedOutputFolder(selectedFolder);
      }
    } catch (error) {
      console.error("出力フォルダ選択エラー:", error);
    }
  };

  // ファイルのロード処理
  const handleLoadFilesFromInputFolder = async () => {
    const files = await loadFilesFromInputFolder(config);
    if (files && files.length > 0) {
      // ファイルが読み込まれたらファイル選択タブに切り替える
      setActiveTab("files");
    }
  };

  // 整理処理の実行
  const handleOrganizeFiles = async () => {
    await organizeFiles(config, setActiveTab);
  };

  // タブコンテンツのレンダリング
  const renderTabContent = () => {
    switch (activeTab) {
      case "files":
        return (
          <FilesTab
            dropZoneRef={dropZoneRef}
            isDragging={isDragging}
            selectFiles={selectFiles}
            selectOutputFolder={handleSelectOutputFolder}
            selectedOutputFolder={selectedOutputFolder}
            selectedFiles={selectedFiles}
            organizeFiles={handleOrganizeFiles}
            isProcessing={isProcessing}
          />
        );

      case "folders":
        return (
          <FoldersTab
            config={config}
            selectInputFolder={selectInputFolder}
            isRecursive={isRecursive}
            setIsRecursive={setIsRecursive}
            loadFilesFromInputFolder={handleLoadFilesFromInputFolder}
          />
        );

      case "settings":
        return (
          <SettingsTab
            config={config}
            newCategory={newCategory}
            setNewCategory={setNewCategory}
            newExtensions={newExtensions}
            setNewExtensions={setNewExtensions}
            editCategory={editCategory}
            setEditCategory={setEditCategory}
            addCategory={addCategory}
            updateCategory={updateCategory}
            deleteCategory={deleteCategory}
            startEditCategory={startEditCategory}
          />
        );

      case "results":
        return (
          <ResultsTab
            isProcessing={isProcessing}
            progress={progress}
            cancelProcessing={cancelProcessing}
            results={results}
          />
        );

      case "permissions":
        return (
          <PermissionsTab
            permissionStatus={permissionStatus}
            checkPermissions={checkPermissions}
            requestPermission={requestPermission}
          />
        );

      default:
        return null;
    }
  };

  // 画面全体のレンダリング
  return (
    <AppShell header={{ height: 32 }} padding="md">
      <AppShell.Header>
        <Container fluid>
          <TitleBar />
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container>
          {/* 出力フォルダ選択UIをタブの上に移動 */}
          <Box mb="md">
            <Group>
              <Button
                leftSection={<IconFolderOpen size={20} />}
                onClick={handleSelectOutputFolder}
                color="blue"
                c="black"
              >
                出力フォルダを選択
              </Button>
              <Text c="black">
                {selectedOutputFolder
                  ? `選択中: ${selectedOutputFolder}`
                  : "未選択"}
              </Text>
            </Group>
          </Box>

          <Tabs
            value={activeTab}
            onChange={(value) => setActiveTab(value as TabType)}
            mt="md"
          >
            <Tabs.List grow>
              <Tabs.Tab
                value="folders"
                leftSection={<IconFolderOpen size={16} />}
                c="black"
              >
                フォルダ
              </Tabs.Tab>
              <Tabs.Tab
                value="files"
                leftSection={<IconFileUpload size={16} />}
                c="black"
              >
                ファイル
              </Tabs.Tab>
              <Tabs.Tab
                value="results"
                leftSection={<IconList size={16} />}
                c="black"
              >
                結果
              </Tabs.Tab>
              <Tabs.Tab
                value="settings"
                leftSection={<IconSettings size={16} />}
                c="black"
              >
                設定
              </Tabs.Tab>
              <Tabs.Tab
                value="permissions"
                leftSection={<IconShieldLock size={16} />}
                c="black"
              >
                権限
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>

          <Box mt="lg">{renderTabContent()}</Box>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
