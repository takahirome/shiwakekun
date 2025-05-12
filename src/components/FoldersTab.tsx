import {
  Container,
  Title,
  Paper,
  Stack,
  Button,
  Box,
  Text,
  Checkbox,
} from "@mantine/core";
import { IconFolderOpen } from "@tabler/icons-react";
import { Config } from "../types";

interface FoldersTabProps {
  config: Config | null;
  selectInputFolder: () => Promise<void>;
  isRecursive: boolean;
  setIsRecursive: (value: boolean) => void;
  loadFilesFromInputFolder: () => Promise<void>;
}

export function FoldersTab({
  config,
  selectInputFolder,
  isRecursive,
  setIsRecursive,
  loadFilesFromInputFolder,
}: FoldersTabProps) {
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
}
