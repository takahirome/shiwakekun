import { Title, Group, ActionIcon, rem } from "@mantine/core";
import {
  IconMinimize,
  IconMaximize,
  IconX as IconClose,
} from "@tabler/icons-react";
import { minimizeWindow, maximizeWindow, hideWindow } from "../utils/window";

export function TitleBar() {
  return (
    <Group justify="space-between" style={{ width: "100%" }}>
      <div
        data-tauri-drag-region
        style={{
          flexGrow: 1,
          blockSize: rem(32),
          display: "flex",
          alignItems: "center",
        }}
      >
        <Title order={5}>仕分けくん</Title>
      </div>
      <Group>
        <ActionIcon
          variant="subtle"
          onClick={minimizeWindow}
          radius="xl"
          size="sm"
        >
          <IconMinimize size={14} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          onClick={maximizeWindow}
          radius="xl"
          size="sm"
        >
          <IconMaximize size={14} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          onClick={hideWindow}
          radius="xl"
          size="sm"
          color="red"
        >
          <IconClose size={14} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
