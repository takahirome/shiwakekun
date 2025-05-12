import {
  Container,
  Title,
  Paper,
  Box,
  Group,
  Text,
  Button,
  Progress,
  Stack,
  Card,
  Badge,
  Flex,
} from "@mantine/core";
import { FileResult, OrganizeProgress } from "../types";

interface ResultsTabProps {
  isProcessing: boolean;
  progress: OrganizeProgress | null;
  cancelProcessing: () => Promise<void>;
  results: FileResult[];
}

export function ResultsTab({
  isProcessing,
  progress,
  cancelProcessing,
  results,
}: ResultsTabProps) {
  return (
    <Container>
      <Title order={2} mb="md">
        処理結果
      </Title>
      <Paper p="lg" withBorder>
        {isProcessing && (
          <Box mb="lg">
            <Group mb="xs" justify="space-between">
              <Text c="black">
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
                  ? (progress.processed_files / progress.total_files) * 100
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
                    <Text truncate c="black">
                      {result.file_path.split("/").pop()}
                    </Text>
                    <Text size="xs" c="black" truncate title={result.file_path}>
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
          <Text ta="center" c="black">
            まだ処理結果はありません
          </Text>
        )}
      </Paper>
    </Container>
  );
}
