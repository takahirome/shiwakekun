import {
  Container,
  Title,
  Stack,
  Card,
  Text,
  Flex,
  Box,
  Group,
  TextInput,
  Button,
  ActionIcon,
  Badge,
} from "@mantine/core";
import {
  IconCheck,
  IconX,
  IconEdit,
  IconTrash,
  IconPlus,
} from "@tabler/icons-react";
import { Config } from "../types";

interface SettingsTabProps {
  config: Config | null;
  newCategory: string;
  setNewCategory: (value: string) => void;
  newExtensions: string;
  setNewExtensions: (value: string) => void;
  editCategory: string | null;
  setEditCategory: (value: string | null) => void;
  addCategory: () => void;
  updateCategory: () => void;
  deleteCategory: (category: string) => void;
  startEditCategory: (category: string) => void;
}

export function SettingsTab({
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
}: SettingsTabProps) {
  return (
    <Container>
      <Title order={2} mb="md">
        カテゴリ設定
      </Title>
      <Stack>
        {config &&
          Object.entries(config.categories).map(([category, extensions]) => (
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
          ))}

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
}
