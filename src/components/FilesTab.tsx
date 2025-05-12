import {
  Container,
  Title,
  Paper,
  Stack,
  Group,
  Button,
  Box,
  Text,
  Tabs,
} from "@mantine/core";
import {
  IconFileUpload,
  IconFolderOpen,
  IconFileImport,
} from "@tabler/icons-react";
import { RefObject } from "react";
import { FileOrganizer } from "./FileOrganizer";

interface FilesTabProps {
  dropZoneRef: RefObject<HTMLDivElement>;
  isDragging: boolean;
  selectFiles: () => Promise<void>;
  selectOutputFolder: () => Promise<void>;
  selectedOutputFolder: string;
  selectedFiles: string[];
  organizeFiles: () => Promise<void>;
  isProcessing: boolean;
}

export function FilesTab({
  dropZoneRef,
  isDragging,
  selectFiles,
  selectOutputFolder,
  selectedOutputFolder,
  selectedFiles,
  organizeFiles,
  isProcessing,
}: FilesTabProps) {
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
          backgroundColor: isDragging ? "rgba(0, 100, 255, 0.05)" : undefined,
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
              <Paper p="xs" style={{ maxHeight: "200px", overflow: "auto" }}>
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
            isProcessing || selectedFiles.length === 0 || !selectedOutputFolder
          }
          size="lg"
          color="blue"
          leftSection={<IconFileImport size={20} />}
        >
          {isProcessing ? "処理中..." : "ファイルを整理する"}
        </Button>
      </Group>

      <Tabs defaultValue="files">
        <Tabs.List>
          <Tabs.Tab value="files">標準ファイル選択</Tabs.Tab>
          <Tabs.Tab value="advanced">権限修正機能付き</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="files">
          <Box pt="xs">
            {/* 既存のファイル選択UI */}
            {/* ... existing code ... */}
          </Box>
        </Tabs.Panel>

        <Tabs.Panel value="advanced">
          <Box pt="xs">
            <FileOrganizer
              onSuccess={() => {
                // ファイル移動成功後の処理
                // 必要に応じてファイル一覧を更新するなど
              }}
            />
          </Box>
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
