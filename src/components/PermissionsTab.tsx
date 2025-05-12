import {
  Container,
  Title,
  Paper,
  Stack,
  Text,
  Grid,
  Card,
  Flex,
  ThemeIcon,
  Box,
  Button,
} from "@mantine/core";
import { IconCheck, IconX, IconShieldLock } from "@tabler/icons-react";
import { PermissionStatus } from "../types";

interface PermissionsTabProps {
  permissionStatus: PermissionStatus;
  checkPermissions: () => Promise<void>;
  requestPermission: (
    type: "accessibility" | "fullDiskAccess"
  ) => Promise<void>;
}

export function PermissionsTab({
  permissionStatus,
  checkPermissions,
  requestPermission,
}: PermissionsTabProps) {
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
          </Grid>

          <Button mt="md" onClick={checkPermissions}>
            パーミッションを確認
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
