import { expect, test } from "bun:test"

import { runAgent } from "./agent"

test("feeds a bash result back to the model before returning the final answer", async () => {
  const requests: Array<Record<string, unknown>> = []
  const originalFetch = globalThis.fetch
  let callCount = 0

  process.env.ANTHROPIC_BASE_URL = "https://example.test"
  process.env.ANTHROPIC_API_KEY = "test-key"
  process.env.ANTHROPIC_MODEL = "test-model"

  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    callCount += 1

    if (callCount === 1) {
      return Response.json({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_test_1",
            name: "bash",
            input: { command: "printf blue-rabbit" },
          },
        ],
        stop_reason: "tool_use",
      })
    }

    return Response.json({
      role: "assistant",
      content: [{ type: "text", text: "I am the minimal agent." }],
      stop_reason: "end_turn",
    })
  }

  try {
    const answer = await runAgent("Who are you?")

    expect(answer).toBe("I am the minimal agent.")
    expect(requests).toHaveLength(2)
    expect(requests[1]?.messages).toEqual([
      { role: "user", content: "Who are you?" },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_test_1",
            name: "bash",
            input: { command: "printf blue-rabbit" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_test_1",
            content: "blue-rabbit",
          },
        ],
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})
