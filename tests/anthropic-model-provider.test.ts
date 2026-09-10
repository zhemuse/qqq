import { expect, test } from "bun:test"

import { AnthropicModelProvider } from "../src/community/anthropic/anthropic-model-provider"
import type { Message } from "../src/foundation/messages"
import type { Tool } from "../src/foundation/tools"

test("translates Foundation messages and tools into an Anthropic request", async () => {
  const originalFetch = globalThis.fetch
  let requestURL = ""
  let requestInit: RequestInit | undefined

  const stubFetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    requestURL = String(input)
    requestInit = init

    return Response.json({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_test_2",
          name: "bash",
          input: { command: "ls" },
        },
      ],
      stop_reason: "tool_use",
    })
  }

  globalThis.fetch = Object.assign(stubFetch, {
    preconnect: originalFetch.preconnect,
  })

  const messages: Message[] = [
    {
      role: "system",
      content: [{ type: "text", text: "You are a terminal agent." }],
    },
    {
      role: "user",
      content: [{ type: "text", text: "Inspect this project." }],
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "toolu_test_1",
          name: "bash",
          input: { command: "pwd" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool_result",
          tool_call_id: "toolu_test_1",
          content: "/project",
        },
      ],
    },
  ]
  const tool: Tool = {
    name: "bash",
    description: "Run a command",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
    async invoke() {
      return "unused"
    },
  }

  try {
    const provider = new AnthropicModelProvider({
      baseURL: "https://example.test/anthropic/",
      apiKey: "test-key",
    })

    const assistant = await provider.invoke({
      model: "test-model",
      messages,
      tools: [tool],
      options: {
        max_tokens: 128,
        model: "must-not-override-model",
        system: "must-not-override-system",
        messages: [],
        tools: [],
      },
    })

    expect(assistant).toEqual({
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "toolu_test_2",
          name: "bash",
          input: { command: "ls" },
        },
      ],
    })
    expect(requestURL).toBe("https://example.test/anthropic/v1/messages")
    expect(requestInit?.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
    })
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      model: "test-model",
      system: "You are a terminal agent.",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Inspect this project." }],
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_test_1",
              name: "bash",
              input: { command: "pwd" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_test_1",
              content: "/project",
            },
          ],
        },
      ],
      tools: [
        {
          name: "bash",
          description: "Run a command",
          input_schema: {
            type: "object",
            properties: { command: { type: "string" } },
            required: ["command"],
          },
        },
      ],
      max_tokens: 128,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
