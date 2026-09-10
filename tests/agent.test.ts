import { expect, test } from "bun:test"

import { Agent } from "../src/agent/agent"
import { bashTool } from "../src/coding/tools/bash"
import { Model, type ModelProvider, type ModelProviderInput } from "../src/foundation/models"
import type { AssistantMessage } from "../src/foundation/messages"

class RecordingProvider implements ModelProvider {
  readonly calls: ModelProviderInput[] = []

  async invoke(input: ModelProviderInput): Promise<AssistantMessage> {
    this.calls.push(input)

    if (this.calls.length === 1) {
      return {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "toolu_test_1",
            name: "bash",
            input: { command: "printf blue-rabbit" },
          },
        ],
      }
    }

    return {
      role: "assistant",
      content: [{ type: "text", text: "I am the layered agent." }],
    }
  }
}

test("turns the prompt into a system message and feeds tool results back", async () => {
  const provider = new RecordingProvider()
  const model = new Model("test-model", provider, { temperature: 0 })
  const agent = new Agent(
    model,
    "You are a terminal agent.",
    [bashTool],
    3,
  )

  const answer = await agent.run("Who are you?")

  expect(answer).toBe("I am the layered agent.")
  expect(provider.calls).toHaveLength(2)
  expect(provider.calls[0]).toMatchObject({
    model: "test-model",
    options: { temperature: 0 },
    messages: [
      {
        role: "system",
        content: [{ type: "text", text: "You are a terminal agent." }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Who are you?" }],
      },
    ],
  })
  expect(provider.calls[1]?.messages).toEqual([
    {
      role: "system",
      content: [{ type: "text", text: "You are a terminal agent." }],
    },
    {
      role: "user",
      content: [{ type: "text", text: "Who are you?" }],
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "toolu_test_1",
          name: "bash",
          input: { command: "printf blue-rabbit" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool_result",
          tool_call_id: "toolu_test_1",
          content: "blue-rabbit",
        },
      ],
    },
  ])
})
