import { expect, test } from "bun:test"
import { render, renderToString } from "ink"
import { Writable } from "node:stream"
import { createElement } from "react"

import { Agent } from "../src/agent/agent"
import { App } from "../src/cli/tui/app"
import { MessageHistory } from "../src/cli/tui/components/message-history"
import { TodoPanel } from "../src/cli/tui/components/todo-panel"
import type { AssistantMessage, Message } from "../src/foundation/messages"
import {
  Model,
  type ModelProvider,
  type ModelProviderInput,
} from "../src/foundation/models"

class StaticProvider implements ModelProvider {
  async invoke(_input: ModelProviderInput): Promise<AssistantMessage> {
    return {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
    }
  }
}

test("renders conversation text and tool activity", () => {
  const messages: Message[] = [
    {
      role: "user",
      content: [{ type: "text", text: "Inspect package.json" }],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "I will inspect the project." },
        {
          type: "tool_call",
          id: "read_1",
          name: "read_file",
          input: { path: "package.json" },
        },
        {
          type: "tool_call",
          id: "todo_1",
          name: "todo_write",
          input: {
            todos: [{ id: "one", content: "Inspect project", status: "in_progress" }],
          },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool_result",
          tool_call_id: "read_1",
          content: "package contents",
        },
      ],
    },
  ]

  const output = renderToString(createElement(MessageHistory, { messages }))

  expect(output).toContain("Inspect package.json")
  expect(output).toContain("I will inspect the project.")
  expect(output).toContain("read_file")
  expect(output).toContain("package.json")
  expect(output).toContain("read_file completed")
  expect(output).not.toContain("package contents")
  expect(output).toContain("Update task plan")
  expect(output).not.toContain("Inspect project")
})

test("renders Todo progress", () => {
  const output = renderToString(
    createElement(TodoPanel, {
      todos: [
        { id: "one", content: "Read package.json", status: "completed" },
        { id: "two", content: "Run tests", status: "in_progress" },
        { id: "three", content: "Pack project", status: "pending" },
      ],
    }),
  )

  expect(output).toContain("Todo")
  expect(output).toContain("✓ Read package.json")
  expect(output).toContain("● Run tests")
  expect(output).toContain("○ Pack project")
})

test("renders a malformed tool call without crashing the TUI", () => {
  const messages = [
    {
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "broken_1",
          name: "bash",
          input: undefined,
        },
      ],
    },
  ] as unknown as Message[]

  const output = renderToString(createElement(MessageHistory, { messages }))

  expect(output).toContain("bash")
})

test("prints completed history messages only once", async () => {
  let output = ""
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      output += String(chunk)
      callback()
    },
  }) as NodeJS.WriteStream
  stdout.columns = 80
  stdout.rows = 24
  stdout.isTTY = true

  const first: Message = {
    role: "user",
    content: [{ type: "text", text: "FIRST MESSAGE" }],
  }
  const second: Message = {
    role: "assistant",
    content: [{ type: "text", text: "SECOND MESSAGE" }],
  }

  const instance = render(
    createElement(MessageHistory, { messages: [first] }),
    {
      stdout,
      interactive: true,
      patchConsole: false,
      maxFps: 1_000,
    },
  )
  await instance.waitUntilRenderFlush()
  instance.rerender(
    createElement(MessageHistory, { messages: [first, second] }),
  )
  await instance.waitUntilRenderFlush()
  instance.unmount()
  await instance.waitUntilExit()

  expect(output.match(/FIRST MESSAGE/g)).toHaveLength(1)
  expect(output.match(/SECOND MESSAGE/g)).toHaveLength(1)
})

test("renders the initial interactive shell", () => {
  const agent = new Agent(
    new Model("test-model", new StaticProvider()),
    "Test prompt",
    [],
  )

  const output = renderToString(createElement(App, { agent }))

  expect(output).toContain("qqq · Coding Agent")
  expect(output).toContain("test-model")
  expect(output).toContain("Ask qqq to work on this project")
  expect(output).toContain("/exit")
})
