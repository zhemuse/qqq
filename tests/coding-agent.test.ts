import { expect, test } from "bun:test"
import { tmpdir } from "node:os"

import { createCodingAgent } from "../src/coding/create-coding-agent"
import type { AssistantMessage } from "../src/foundation/messages"
import {
  Model,
  type ModelProvider,
  type ModelProviderInput,
} from "../src/foundation/models"

class ToolRecordingProvider implements ModelProvider {
  tools: string[] = []
  prompt = ""

  async invoke(input: ModelProviderInput): Promise<AssistantMessage> {
    this.tools = input.tools?.map((tool) => tool.name) ?? []
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

class LoggingProvider implements ModelProvider {
  calls = 0

  async invoke(_input: ModelProviderInput): Promise<AssistantMessage> {
    this.calls += 1
    if (this.calls === 1) {
      return {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "read_1",
            name: "read_file",
            input: { path: "package.json" },
          },
        ],
      }
    }

    return {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
    }
  }
}

test("a coding agent exposes coding and Todo tools with the Skill catalog", async () => {
  const provider = new ToolRecordingProvider()
  const agent = createCodingAgent(new Model("test-model", provider))
  const originalDirectory = process.cwd()

  process.chdir(tmpdir())
  try {
    await agent.run("Fix the project")
  } finally {
    process.chdir(originalDirectory)
  }

  expect(provider.tools).toEqual([
    "bash",
    "read_file",
    "write_file",
    "str_replace",
    "todo_write",
  ])
  expect(provider.prompt).toContain("<name>npm-release</name>")
  expect(provider.prompt).toMatch(
    /<path>.*\/skills\/npm-release\/SKILL\.md<\/path>/,
  )
})

test("a coding agent logs model and tool activity", async () => {
  const originalLog = console.log
  const logs: string[] = []
  console.log = (...values: unknown[]) => {
    logs.push(values.map(String).join(" "))
  }

  try {
    const agent = createCodingAgent(new Model("test-model", new LoggingProvider()))
    await agent.run("Inspect package.json")
  } finally {
    console.log = originalLog
  }

  expect(logs[0]).toBe("Agent started")
  expect(logs).toContain("Step 1")
  expect(logs).toContain("Model ← 1 messages")
  expect(logs).toContain('Tool → read_file {"path":"package.json"}')
  expect(logs.some((line) => /^Tool ← read_file \d+ms$/.test(line))).toBe(true)
  expect(logs.at(-1)).toMatch(
    /^Agent finished: 2 steps, 2 model calls, 1 tool calls, \d+ms$/,
  )
})

test("a coding agent can disable console logging for an interactive UI", async () => {
  const originalLog = console.log
  const logs: string[] = []
  console.log = (...values: unknown[]) => {
    logs.push(values.map(String).join(" "))
  }

  try {
    const agent = createCodingAgent(
      new Model("test-model", new ToolRecordingProvider()),
      { logging: false },
    )
    await agent.run("Inspect package.json")
  } finally {
    console.log = originalLog
  }

  expect(logs).toEqual([])
})
