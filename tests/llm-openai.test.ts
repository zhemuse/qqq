import { describe, it, expect, mock } from "bun:test"
import { OpenAIClient } from "../src/llm/openai"
import type { Message } from "../src/llm"

const mockCreate = mock(async () => ({
  choices: [
    {
      message: {
        role: "assistant",
        content: "done",
        tool_calls: undefined,
      },
    },
  ],
}))

mock.module("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: mockCreate } }
    constructor(_opts: unknown) {}
  },
}))

const config = { model: "gpt-4o", apiKey: "test", baseURL: "https://api.openai.com/v1" }

describe("OpenAIClient", () => {
  it("应返回文字内容", async () => {
    const client = new OpenAIClient(config)
    const result = await client.chat([{ role: "user", content: "hi" }], [])
    expect(result.content).toBe("done")
    expect(result.tool_calls).toBeUndefined()
  })

  it("当模型返回 tool_calls 时应解析", async () => {
    mockCreate.mockImplementationOnce(async () => ({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "readFile",
                  arguments: JSON.stringify({ path: "src/index.ts" }),
                },
              },
            ],
          },
        },
      ],
    }))

    const client = new OpenAIClient(config)
    const result = await client.chat([{ role: "user", content: "read a file" }], [])

    expect(result.tool_calls).toHaveLength(1)
    expect(result.tool_calls![0]).toEqual({
      id: "call_1",
      type: "function",
      function: { name: "readFile", arguments: JSON.stringify({ path: "src/index.ts" }) },
    })
  })
})
