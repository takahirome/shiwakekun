import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Window } from "@tauri-apps/api/window";
import "./App.css";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  checkCameraPermission,
  requestCameraPermission,
  checkMicrophonePermission,
  requestMicrophonePermission,
  checkFullDiskAccessPermission,
  requestFullDiskAccessPermission,
} from "tauri-plugin-macos-permissions-api";
import {
  AppShell,
  Text,
  Title,
  Button,
  Group,
  Tabs,
  Container,
  Box,
  Paper,
  TextInput,
  Checkbox,
  Progress,
  Stack,
  Card,
  Badge,
  Grid,
  Flex,
  ActionIcon,
  rem,
  ThemeIcon,
} from "@mantine/core";
import {
  IconFileUpload,
  IconFolderOpen,
  IconSettings,
  IconList,
  IconFileImport,
  IconCheck,
  IconX,
  IconEdit,
  IconTrash,
  IconPlus,
  IconMinimize,
  IconMaximize,
  IconX as IconClose,
  IconShieldLock,
} from "@tabler/icons-react";

interface Config {
  categories: Record<string, string[]>;
  output_folders: string[];
  input_folder?: string;
}

interface FileResult {
  file_path: string;
  success: boolean;
  message: string;
}

interface OrganizeProgress {
  total_files: number;
  processed_files: number;
  current_result?: FileResult;
  finished: boolean;
  batch_progress?: boolean;
}

type TabType = "files" | "folders" | "results" | "settings" | "permissions";

// ウィンドウ操作関数
async function minimizeWindow() {
  const appWindow = Window.getCurrent();
  await appWindow.minimize();
}

async function maximizeWindow() {
  const appWindow = Window.getCurrent();
  const isMaximized = await appWindow.isMaximized();
  if (isMaximized) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }
}

async function hideWindow() {
  const appWindow = Window.getCurrent();
  await appWindow.hide();
}

function TitleBar() {
  return (
    <Group justify="space-between" style={{ width: "100%" }}>
      <div
        data-tauri-drag-region
        style={{
          flexGrow: 1,
          height: rem(40),
          display: "flex",
          alignItems: "center",
        }}
      >
        <Title order={4}>仕分けくん for Tauri</Title>
      </div>
      <Group>
        <ActionIcon
          variant="subtle"
          onClick={minimizeWindow}
          radius="xl"
          size="md"
        >
          <IconMinimize size={18} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          onClick={maximizeWindow}
          radius="xl"
          size="md"
        >
          <IconMaximize size={18} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          onClick={hideWindow}
          radius="xl"
          size="md"
          color="red"
        >
          <IconClose size={18} />
        </ActionIcon>
      </Group>
    </Group>
  );
}

function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedOutputFolder, setSelectedOutputFolder] = useState<string>("");
  const [results, setResults] = useState<FileResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newExtensions, setNewExtensions] = useState("");
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [isRecursive, setIsRecursive] = useState(true);
  const [progress, setProgress] = useState<OrganizeProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("files");
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [permissionStatus, setPermissionStatus] = useState({
    accessibility: "未確認",
    camera: "未確認",
    microphone: "未確認",
    fullDiskAccess: "未確認",
  });

  // 設定の読み込み
  useEffect(() => {
    loadConfig();

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

  async function selectFiles() {
    try {
      const selected = await open({ multiple: true });
      if (Array.isArray(selected)) {
        setSelectedFiles(selected);
      } else if (selected !== null) {
        setSelectedFiles([selected]);
      }
    } catch (error) {
      console.error("ファイル選択エラー:", error);
    }
  }

  async function selectOutputFolder() {
    try {
      const folder = await open({ directory: true });
      if (folder === null) return;

      setSelectedOutputFolder(folder as string);

      // 出力フォルダリストに追加
      if (config && !config.output_folders.includes(folder as string)) {
        const updatedConfig = await invoke<Config>("add_output_folder", {
          folder,
          config,
        });
        setConfig(updatedConfig);
      }
    } catch (error) {
      console.error("フォルダ選択エラー:", error);
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

  async function loadFilesFromInputFolder() {
    if (!config || !config.input_folder) {
      alert("入力フォルダが設定されていません");
      return;
    }

    try {
      const files = await invoke<string[]>("load_files_from_input_folder", {
        config,
        recursive: isRecursive,
      });
      setSelectedFiles(files);
      // ファイルが読み込まれたらファイル選択タブに切り替える
      setActiveTab("files");
    } catch (error) {
      console.error("ファイル読み込みエラー:", error);
      alert(`エラーが発生しました: ${error}`);
    }
  }

  async function organizeFiles() {
    if (!config || selectedFiles.length === 0 || !selectedOutputFolder) {
      alert("ファイルと出力フォルダを選択してください");
      return;
    }

    setIsProcessing(true);
    setResults([]);
    setProgress({
      total_files: selectedFiles.length,
      processed_files: 0,
      finished: false,
    });
    // 処理開始時に結果タブに切り替える
    setActiveTab("results");

    try {
      // ファイル整理を実行
      // 処理完了は progress イベント経由で通知される
      await invoke("organize_files_async", {
        files: selectedFiles,
        outputFolder: selectedOutputFolder,
        config,
      });

      // 非同期処理のため、ファイル選択をクリアしない
      // 実際の処理結果はイベントリスナーで取得
    } catch (error) {
      console.error("ファイル整理エラー:", error);
      alert(`エラーが発生しました: ${error}`);
      setIsProcessing(false);
    }
  }

  async function cancelProcessing() {
    try {
      await invoke("cancel_processing");
      // キャンセル要求を送信。実際の処理中断はRust側で行われる
    } catch (error) {
      console.error("処理中断エラー:", error);
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

  // タブコンテンツのレンダリング
  const renderTabContent = () => {
    switch (activeTab) {
      case "files":
        return (
          <Container>
            <Title order={2} mb="md">
              ファイル選択
            </Title>
            <Paper
              p="lg"
              withBorder
              ref={dropZoneRef}
              style={{
                borderStyle: isDragging ? "dashed" : "solid",
                borderColor: isDragging ? "blue" : undefined,
                backgroundColor: isDragging
                  ? "rgba(0, 100, 255, 0.05)"
                  : undefined,
              }}
            >
              <Stack>
                <Group justify="center">
                  <Button
                    leftSection={<IconFileUpload size={20} />}
                    onClick={selectFiles}
                  >
                    個別にファイルを選択
                  </Button>

                  <Button
                    leftSection={<IconFolderOpen size={20} />}
                    onClick={selectOutputFolder}
                  >
                    出力フォルダを選択: {selectedOutputFolder || "未選択"}
                  </Button>
                </Group>

                <Text ta="center" c="dimmed" fz="sm">
                  ファイルをここにドロップすることもできます
                </Text>

                {selectedFiles.length > 0 && (
                  <Box>
                    <Text fw={500} mb="xs">
                      選択済み: {selectedFiles.length}ファイル
                    </Text>
                    <Paper
                      p="xs"
                      style={{ maxHeight: "200px", overflow: "auto" }}
                    >
                      {selectedFiles.map((file, index) => (
                        <Box key={index} py="xs">
                          {file.split("/").pop()}
                        </Box>
                      ))}
                    </Paper>
                  </Box>
                )}
              </Stack>
            </Paper>

            <Group mt="xl" justify="center">
              <Button
                onClick={organizeFiles}
                disabled={
                  isProcessing ||
                  selectedFiles.length === 0 ||
                  !selectedOutputFolder
                }
                size="lg"
                color="blue"
                leftSection={<IconFileImport size={20} />}
              >
                {isProcessing ? "処理中..." : "ファイルを整理する"}
              </Button>
            </Group>
          </Container>
        );

      case "folders":
        return (
          <Container>
            <Title order={2} mb="md">
              仕分け元フォルダ設定
            </Title>
            <Paper p="lg" withBorder>
              <Stack>
                <Button
                  leftSection={<IconFolderOpen size={20} />}
                  onClick={selectInputFolder}
                >
                  仕分け元フォルダを設定
                </Button>

                {config?.input_folder && (
                  <Box>
                    <Text fw={500} mb="md">
                      仕分け元フォルダ: {config.input_folder}
                    </Text>
                    <Stack>
                      <Checkbox
                        label="サブフォルダも含めて検索する"
                        checked={isRecursive}
                        onChange={(e) => setIsRecursive(e.target.checked)}
                      />
                      <Button onClick={loadFilesFromInputFolder}>
                        フォルダからファイルを読み込む
                      </Button>
                    </Stack>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Container>
        );

      case "settings":
        return (
          <Container>
            <Title order={2} mb="md">
              カテゴリ設定
            </Title>
            <Stack>
              {config &&
                Object.entries(config.categories).map(
                  ([category, extensions]) => (
                    <Card key={category} withBorder shadow="sm" p="md">
                      {editCategory === category ? (
                        <Stack>
                          <Text fw={700}>{category}</Text>
                          <TextInput
                            label="拡張子"
                            value={newExtensions}
                            onChange={(e) => setNewExtensions(e.target.value)}
                            placeholder="拡張子（カンマ区切り）"
                          />
                          <Group>
                            <Button
                              size="xs"
                              leftSection={<IconCheck size={16} />}
                              onClick={updateCategory}
                            >
                              更新
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              leftSection={<IconX size={16} />}
                              onClick={() => setEditCategory(null)}
                            >
                              キャンセル
                            </Button>
                          </Group>
                        </Stack>
                      ) : (
                        <Flex justify="space-between" align="flex-start">
                          <Box>
                            <Text fw={700}>{category}</Text>
                            <Flex gap="xs" wrap="wrap" mt="xs">
                              {extensions.map((ext, i) => (
                                <Badge key={i} color="blue" variant="light">
                                  {ext}
                                </Badge>
                              ))}
                            </Flex>
                          </Box>
                          <Group>
                            <ActionIcon
                              color="blue"
                              variant="subtle"
                              onClick={() => startEditCategory(category)}
                            >
                              <IconEdit size={18} />
                            </ActionIcon>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => deleteCategory(category)}
                            >
                              <IconTrash size={18} />
                            </ActionIcon>
                          </Group>
                        </Flex>
                      )}
                    </Card>
                  )
                )}

              <Card withBorder shadow="sm" p="md">
                <Title order={4} mb="md">
                  新しいカテゴリを追加
                </Title>
                <Stack>
                  <TextInput
                    label="カテゴリ名"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="カテゴリ名"
                  />
                  <TextInput
                    label="拡張子（カンマ区切り）"
                    value={newExtensions}
                    onChange={(e) => setNewExtensions(e.target.value)}
                    placeholder=".jpg, .png, ..."
                  />
                  <Button
                    leftSection={<IconPlus size={18} />}
                    onClick={addCategory}
                    disabled={!newCategory || !newExtensions}
                  >
                    追加
                  </Button>
                </Stack>
              </Card>
            </Stack>
          </Container>
        );

      case "results":
        return (
          <Container>
            <Title order={2} mb="md">
              処理結果
            </Title>
            <Paper p="lg" withBorder>
              {isProcessing && (
                <Box mb="lg">
                  <Group mb="xs" justify="space-between">
                    <Text>
                      処理中... {progress?.processed_files || 0} /{" "}
                      {progress?.total_files || 0}
                    </Text>
                    <Button
                      variant="outline"
                      color="red"
                      size="xs"
                      onClick={cancelProcessing}
                    >
                      処理を中止
                    </Button>
                  </Group>
                  <Progress
                    value={
                      progress
                        ? (progress.processed_files / progress.total_files) *
                          100
                        : 0
                    }
                    size="xl"
                    striped
                    animated={isProcessing}
                  />
                </Box>
              )}

              {results.length > 0 ? (
                <Stack>
                  {results.map((result, index) => (
                    <Card key={index} withBorder shadow="xs" p="sm">
                      <Flex justify="space-between" align="center">
                        <Box style={{ flex: 1, overflow: "hidden" }}>
                          <Text truncate>
                            {result.file_path.split("/").pop()}
                          </Text>
                          <Text
                            size="xs"
                            c="dimmed"
                            truncate
                            title={result.file_path}
                          >
                            {result.file_path}
                          </Text>
                        </Box>
                        <Box ml="md">
                          {result.success ? (
                            <Badge color="green">{result.message}</Badge>
                          ) : (
                            <Badge color="red">{result.message}</Badge>
                          )}
                        </Box>
                      </Flex>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text ta="center" c="dimmed">
                  まだ処理結果はありません
                </Text>
              )}
            </Paper>
          </Container>
        );

      case "permissions":
        return (
          <Container>
            <Title order={2} mb="md">
              パーミッション設定
            </Title>
            <Paper p="lg" withBorder>
              <Stack>
                <Text>
                  アプリが正常に動作するには、以下のパーミッションが必要です。
                </Text>

                <Grid>
                  <Grid.Col span={6}>
                    <Card withBorder shadow="sm" p="md">
                      <Flex align="center" gap="md">
                        <ThemeIcon
                          size="lg"
                          radius="xl"
                          color={
                            permissionStatus.fullDiskAccess === "許可"
                              ? "green"
                              : "orange"
                          }
                        >
                          {permissionStatus.fullDiskAccess === "許可" ? (
                            <IconCheck size={20} />
                          ) : (
                            <IconX size={20} />
                          )}
                        </ThemeIcon>
                        <Box>
                          <Text fw={500}>フルディスクアクセス</Text>
                          <Text size="sm" c="dimmed">
                            {permissionStatus.fullDiskAccess}
                          </Text>
                        </Box>
                      </Flex>
                      <Button
                        mt="md"
                        size="sm"
                        onClick={() => requestPermission("fullDiskAccess")}
                        disabled={permissionStatus.fullDiskAccess === "許可"}
                      >
                        権限を要求
                      </Button>
                    </Card>
                  </Grid.Col>

                  <Grid.Col span={6}>
                    <Card withBorder shadow="sm" p="md">
                      <Flex align="center" gap="md">
                        <ThemeIcon
                          size="lg"
                          radius="xl"
                          color={
                            permissionStatus.accessibility === "許可"
                              ? "green"
                              : "orange"
                          }
                        >
                          {permissionStatus.accessibility === "許可" ? (
                            <IconCheck size={20} />
                          ) : (
                            <IconX size={20} />
                          )}
                        </ThemeIcon>
                        <Box>
                          <Text fw={500}>アクセシビリティ</Text>
                          <Text size="sm" c="dimmed">
                            {permissionStatus.accessibility}
                          </Text>
                        </Box>
                      </Flex>
                      <Button
                        mt="md"
                        size="sm"
                        onClick={() => requestPermission("accessibility")}
                        disabled={permissionStatus.accessibility === "許可"}
                      >
                        権限を要求
                      </Button>
                    </Card>
                  </Grid.Col>

                  <Grid.Col span={6}>
                    <Card withBorder shadow="sm" p="md">
                      <Flex align="center" gap="md">
                        <ThemeIcon
                          size="lg"
                          radius="xl"
                          color={
                            permissionStatus.camera === "許可"
                              ? "green"
                              : "orange"
                          }
                        >
                          {permissionStatus.camera === "許可" ? (
                            <IconCheck size={20} />
                          ) : (
                            <IconX size={20} />
                          )}
                        </ThemeIcon>
                        <Box>
                          <Text fw={500}>カメラ</Text>
                          <Text size="sm" c="dimmed">
                            {permissionStatus.camera}
                          </Text>
                        </Box>
                      </Flex>
                      <Button
                        mt="md"
                        size="sm"
                        onClick={() => requestPermission("camera")}
                        disabled={permissionStatus.camera === "許可"}
                      >
                        権限を要求
                      </Button>
                    </Card>
                  </Grid.Col>

                  <Grid.Col span={6}>
                    <Card withBorder shadow="sm" p="md">
                      <Flex align="center" gap="md">
                        <ThemeIcon
                          size="lg"
                          radius="xl"
                          color={
                            permissionStatus.microphone === "許可"
                              ? "green"
                              : "orange"
                          }
                        >
                          {permissionStatus.microphone === "許可" ? (
                            <IconCheck size={20} />
                          ) : (
                            <IconX size={20} />
                          )}
                        </ThemeIcon>
                        <Box>
                          <Text fw={500}>マイク</Text>
                          <Text size="sm" c="dimmed">
                            {permissionStatus.microphone}
                          </Text>
                        </Box>
                      </Flex>
                      <Button
                        mt="md"
                        size="sm"
                        onClick={() => requestPermission("microphone")}
                        disabled={permissionStatus.microphone === "許可"}
                      >
                        権限を要求
                      </Button>
                    </Card>
                  </Grid.Col>
                </Grid>

                <Button mt="md" onClick={checkPermissions}>
                  パーミッションを確認
                </Button>
              </Stack>
            </Paper>
          </Container>
        );

      default:
        return null;
    }
  };

  async function checkPermissions() {
    try {
      const accessibility = await checkAccessibilityPermission();
      const camera = await checkCameraPermission();
      const microphone = await checkMicrophonePermission();
      const fullDiskAccess = await checkFullDiskAccessPermission();

      setPermissionStatus({
        accessibility: accessibility ? "許可" : "未許可",
        camera: camera ? "許可" : "未許可",
        microphone: microphone ? "許可" : "未許可",
        fullDiskAccess: fullDiskAccess ? "許可" : "未許可",
      });
    } catch (error) {
      console.error("パーミッション確認エラー:", error);
    }
  }

  async function requestPermission(
    type: "accessibility" | "camera" | "microphone" | "fullDiskAccess"
  ) {
    try {
      switch (type) {
        case "accessibility":
          await requestAccessibilityPermission();
          break;
        case "camera":
          await requestCameraPermission();
          break;
        case "microphone":
          await requestMicrophonePermission();
          break;
        case "fullDiskAccess":
          await requestFullDiskAccessPermission();
          break;
      }

      // 要求後に状態を更新
      await checkPermissions();
    } catch (error) {
      console.error(`${type}パーミッション要求エラー:`, error);
    }
  }

  // 画面全体のレンダリング
  return (
    <AppShell header={{ height: 60 }} padding="md">
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
                onClick={selectOutputFolder}
                color="blue"
                style={{ color: "#000" }}
              >
                出力フォルダを選択
              </Button>
              <Text style={{ color: "#000" }}>
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
                value="files"
                leftSection={<IconFileUpload size={16} />}
                style={{ color: "#000" }}
              >
                ファイル
              </Tabs.Tab>
              <Tabs.Tab
                value="folders"
                leftSection={<IconFolderOpen size={16} />}
                style={{ color: "#000" }}
              >
                フォルダ
              </Tabs.Tab>
              <Tabs.Tab
                value="results"
                leftSection={<IconList size={16} />}
                style={{ color: "#000" }}
              >
                結果
              </Tabs.Tab>
              <Tabs.Tab
                value="settings"
                leftSection={<IconSettings size={16} />}
                style={{ color: "#000" }}
              >
                設定
              </Tabs.Tab>
              <Tabs.Tab
                value="permissions"
                leftSection={<IconShieldLock size={16} />}
                style={{ color: "#000" }}
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
