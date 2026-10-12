import { Box, Text } from "ink"
import Spinner from "ink-spinner"

export function RunningIndicator({ running }: { running: boolean }) {
  if (!running) {
    return null
  }

  return (
    <Box gap={1}>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text color="cyan">Agent is working…</Text>
    </Box>
  )
}
