import { Box, Text } from "ink"

export function Header({ model }: { model: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        qqq · Coding Agent
      </Text>
      <Text color="gray">{model} · {process.cwd()}</Text>
    </Box>
  )
}
