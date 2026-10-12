import type { AgentMiddleware } from "../agent-middleware"
import type { Tool } from "../../foundation/tools"

export type TodoStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"

export type TodoItem = {
  id: string
  content: string
  status: TodoStatus
}

const TODO_STATUSES = new Set<TodoStatus>([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
])

function parseTodoItem(value: unknown): TodoItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("todo must be an object")
  }

  const item = value as Record<string, unknown>
  if (typeof item.id !== "string" || item.id.length === 0) {
    throw new Error("todo id must be a non-empty string")
  }
  if (typeof item.content !== "string" || item.content.length === 0) {
    throw new Error("todo content must be a non-empty string")
  }
  if (
    typeof item.status !== "string" ||
    !TODO_STATUSES.has(item.status as TodoStatus)
  ) {
    throw new Error(`invalid todo status: ${String(item.status)}`)
  }

  return {
    id: item.id,
    content: item.content,
    status: item.status as TodoStatus,
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function formatTodoReminder(todos: TodoItem[]): string {
  const items = todos
    .map((todo) => `  [${todo.status}] ${escapeXml(todo.content)}`)
    .join("\n")

  return `<todo_reminder>\n${items}\n</todo_reminder>`
}

function createTodoWriteTool(todos: TodoItem[]): Tool {
  return {
    name: "todo_write",
    description: "创建或更新当前任务的 Todo 列表。每次提交完整列表。",
    inputSchema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              content: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "cancelled"],
              },
            },
            required: ["id", "content", "status"],
          },
        },
      },
      required: ["todos"],
    },
    async invoke(input) {
      if (!Array.isArray(input.todos)) {
        throw new Error("todos must be an array")
      }

      const nextTodos = input.todos.map(parseTodoItem)
      todos.splice(0, todos.length, ...nextTodos)

      const inProgress = todos.filter(
        (todo) => todo.status === "in_progress",
      ).length
      const pending = todos.filter((todo) => todo.status === "pending").length

      return `Todo list updated: ${todos.length} items, ${inProgress} in_progress, ${pending} pending.`
    },
  }
}

function createTodoMiddleware(todos: TodoItem[]): AgentMiddleware {
  return {
    beforeModel(_agentContext, modelContext) {
      if (todos.length === 0) {
        return
      }

      return {
        prompt:
          (modelContext.prompt ? `${modelContext.prompt}\n\n` : "") +
          formatTodoReminder(todos),
      }
    },
  }
}

export function createTodoSystem(): {
  tool: Tool
  middleware: AgentMiddleware
} {
  const todos: TodoItem[] = []

  return {
    tool: createTodoWriteTool(todos),
    middleware: createTodoMiddleware(todos),
  }
}
