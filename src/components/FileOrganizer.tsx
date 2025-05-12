import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Box, Button, TextInput, Group, Text, Alert } from "@mantine/core";
import { IconAlertCircle, IconUpload } from "@tabler/icons-react";

interface FileOrganizerProps {
  onSuccess?: () => void;
}

export function FileOrganizer({ onSuccess }: FileOrganizerProps) {
  const [sourceFile, setSourceFile] = useState("");
  const [destFolder, setDestFolder] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleMoveFile = async () => {
    if (!sourceFile || !destFolder) {
      setError("ソースファイルと保存先フォルダを指定してください");
      return;
    }

    try {
      setError("");
      setIsLoading(true);
      setMessage("ファイルを移動中...");

      // ファイル名のみを取得
      const fileName = sourceFile.split("/").pop();
      const destPath = `${destFolder}/${fileName}`;

      // Rustのコマンドを呼び出す
      await invoke("move_file", {
        sourcePath: sourceFile,
        destPath: destPath,
      });

      setMessage(`ファイルを正常に移動しました: ${destPath}`);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("ファイル移動エラー:", error);
      setError(`エラー: ${error}`);
      setMessage("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box p="md">
      <Text size="lg" weight={500} mb="md">
        ファイル移動（権限修正機能付き）
      </Text>

      <TextInput
        label="ソースファイル"
        placeholder="/path/to/source/file.jpg"
        value={sourceFile}
        onChange={(e) => setSourceFile(e.target.value)}
        mb="sm"
        required
      />

      <TextInput
        label="保存先フォルダ"
        placeholder="/path/to/destination/folder"
        value={destFolder}
        onChange={(e) => setDestFolder(e.target.value)}
        mb="md"
        required
      />

      <Group position="center">
        <Button
          leftIcon={<IconUpload size={16} />}
          onClick={handleMoveFile}
          loading={isLoading}
          disabled={!sourceFile || !destFolder}
        >
          {isLoading ? "処理中..." : "ファイルを移動"}
        </Button>
      </Group>

      {error && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="エラー"
          color="red"
          mt="md"
        >
          {error}
        </Alert>
      )}

      {message && (
        <Alert title="結果" color="green" mt="md">
          {message}
        </Alert>
      )}
    </Box>
  );
}
