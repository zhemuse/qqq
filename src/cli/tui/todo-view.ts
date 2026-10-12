import type { Message } from "../../foundation/messages"
import type { TodoItem, TodoStatus } from "../../agent/todo/todo-system"

const TODO_STATUSES = new Set<TodoStatus>([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
])

function parseTodos(input: Record<string, unknown>): TodoItem[] {
  if (!Array.isArray(input.todos)) {
    return []
  }

  return input.todos.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return []
    }

    const item = value as Record<string, unknown>
    if (
      typeof item.id !== "string" ||
      typeof item.content !== "string" ||
      typeof item.status !== "string" ||
      !TODO_STATUSES.has(item.status as TodoStatus)
    ) {
      return []
    }

    return [
      {
        id: item.id,
        content: item.content,
        status: item.status as TodoStatus,
      },
    ]
  })
}

export function getLatestTodos(messages: Message[]): TodoItem[] {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    if (message?.role !== "assistant") {
      continue
    }

    for (let contentIndex = message.content.length - 1; contentIndex >= 0; contentIndex -= 1) {
      const content = message.content[contentIndex]
      if (content?.type === "tool_call" && content.name === "todo_write") {
        return parseTodos(content.input)
      }
    }
  }

  return []
}
