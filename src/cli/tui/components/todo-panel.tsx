import { Box, Text } from "ink"

import type { TodoItem, TodoStatus } from "../../../agent/todo/todo-system"

function getIcon(status: TodoStatus): string {
  if (status === "completed") {
    return "✓"
  }

  if (status === "in_progress") {
    return "●"
  }

  if (status === "cancelled") {
    return "✕"
  }

  return "○"
}

export function TodoPanel({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) {
    return null
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text bold color="cyan">
        Todo
      </Text>
      {todos.map((todo) => (
        <Text key={todo.id} color={todo.status === "completed" ? "gray" : undefined}>
          {getIcon(todo.status)} {todo.content}
        </Text>
      ))}
    </Box>
  )
}
