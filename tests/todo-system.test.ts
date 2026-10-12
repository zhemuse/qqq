import { expect, test } from "bun:test"

import { Agent } from "../src/agent/agent"
import { createTodoSystem } from "../src/agent/todo/todo-system"
import type { AssistantMessage } from "../src/foundation/messages"
import {
  Model,
  type ModelProvider,
  type ModelProviderInput,
} from "../src/foundation/models"

class PromptProvider implements ModelProvider {
  prompt = ""

  async invoke(input: ModelProviderInput): Promise<AssistantMessage> {
    const system = input.messages[0]
    const firstBlock =
      system && Array.isArray(system.content) ? system.content[0] : undefined
    this.prompt = firstBlock?.type === "text" ? firstBlock.text : ""

    return {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
    }
  }
}

test("todo_write replaces the complete list and reports its state", async () => {
  const todo = createTodoSystem()

  await todo.tool.invoke({
    todos: [
      { id: "inspect", content: "Inspect package", status: "in_progress" },
      { id: "test", content: "Run tests", status: "pending" },
    ],
  })
  const result = await todo.tool.invoke({
    todos: [
      { id: "release", content: "Prepare release", status: "completed" },
    ],
  })

  expect(result).toBe(
    "Todo list updated: 1 items, 0 in_progress, 0 pending.",
  )

  const provider = new PromptProvider()
  const agent = new Agent(
    new Model("test-model", provider),
    "Base prompt",
    [],
    1,
    [todo.middleware],
  )
  await agent.run("Continue")

  expect(provider.prompt).toContain("[completed] Prepare release")
  expect(provider.prompt).not.toContain("Inspect package")
  expect(provider.prompt).not.toContain("Run tests")
})

test("todo_write rejects malformed Todo items", async () => {
  const todo = createTodoSystem()

  await expect(
    todo.tool.invoke({
      todos: [
        {
          id: "release",
          content: "Prepare release",
          status: "unknown",
        },
      ],
    }),
  ).rejects.toThrow("invalid todo status: unknown")
})
