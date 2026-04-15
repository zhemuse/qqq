import { describe, it, expect, mock } from "bun:test"
import { AnthropicClient } from "../src/llm/anthropic"
import type { Message } from "../src/llm"

// Mock Anthropic SDK
const mockCreate = mock(async () => ({
  content: [{ type: "text", text: "done" }],
  stop_reason: "end_turn",
}))

mock.module("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate }
    constructor(_opts: unknown) {}
  },
}))

const config = { model: "claude-sonnet-4-6", apiKey: "test-key" }

describe("AnthropicClient", () => {
  it("应将 TextMessage 转换为 Anthropic messages 格式并返回内容", async () => {
    const client = new AnthropicClient(config)
    const messages: Message[] = [{ role: "user", content: "hello" }]
    const result = await client.chat(messages, [])

    expect(result.content).toBe("done")
    expect(result.tool_calls).toBeUndefined()
  })

  it("当模型返回 tool_use block 时应解析 tool_calls", async () => {
    mockCreate.mockImplementationOnce(async () => ({
      content: [
        {
          type: "tool_use",
          id: "call_1",
          name: "readFile",
          input: { path: "src/index.ts" },
        },
      ],
      stop_reason: "tool_use",
    }))

    const client = new AnthropicClient(config)
    const result = await client.chat([{ role: "user", content: "read a file" }], [])

    expect(result.tool_calls).toHaveLength(1)
    expect(result.tool_calls![0]).toEqual({
      id: "call_1",
      name: "readFile",
      args: { path: "src/index.ts" },
    })
  })
})
