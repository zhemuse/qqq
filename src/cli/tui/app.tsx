import { Box, Text } from "ink"

import type { Agent } from "../../agent/agent"
import { Footer } from "./components/footer"
import { Header } from "./components/header"
import { InputBox } from "./components/input-box"
import { MessageHistory } from "./components/message-history"
import { RunningIndicator } from "./components/running-indicator"
import { TodoPanel } from "./components/todo-panel"
import { useAgentLoop } from "./hooks/use-agent-loop"
import { getLatestTodos } from "./todo-view"

export function App({ agent }: { agent: Agent }) {
  const { messages, running, error, submit } = useAgentLoop(agent)
  const todos = getLatestTodos(messages)

  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      <Header model={agent.model.name} />
      <MessageHistory messages={messages} />
      <TodoPanel todos={todos} />
      <RunningIndicator running={running} />
      {error ? <Text color="red">Error: {error}</Text> : null}
      <InputBox disabled={running} onSubmit={submit} />
      <Footer />
    </Box>
  )
}
