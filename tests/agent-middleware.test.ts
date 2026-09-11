import { expect, test } from "bun:test"

import { Agent } from "../src/agent/agent"
import type { AssistantMessage } from "../src/foundation/messages"
import {
  Model,
  type ModelProvider,
  type ModelProviderInput,
} from "../src/foundation/models"
import type { Tool } from "../src/foundation/tools"

class TwoStepProvider implements ModelProvider {
  calls = 0

  async invoke(_input: ModelProviderInput): Promise<AssistantMessage> {
    this.calls += 1
    if (this.calls === 1) {
      return {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "tool_1",
            name: "inspect",
            input: { value: "hello" },
          },
        ],
      }
    }

    return {
      role: "assistant",
      content: [{ type: "text", text: "finished" }],
    }
  }
}

class EndlessToolProvider implements ModelProvider {
  async invoke(_input: ModelProviderInput): Promise<AssistantMessage> {
    return {
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "tool_forever",
          name: "inspect",
          input: {},
        },
      ],
    }
  }
}

test("runs middleware hooks around the agent, model and tool lifecycle", async () => {
  const events: string[] = []
  const tool: Tool = {
    name: "inspect",
    description: "Inspect a value",
    inputSchema: { type: "object" },
    async invoke() {
      return "observed"
    },
  }
  const agent = new Agent(
    new Model("test-model", new TwoStepProvider()),
    "Test prompt",
    [tool],
    3,
    [
      {
        beforeAgentRun(context) {
          events.push(`run:start:${context.messages.length}`)
        },
        beforeAgentStep(_context, step) {
          events.push(`step:start:${step}`)
        },
        beforeModel(context) {
          events.push(`model:start:${context.step}`)
        },
        afterModel(context) {
          events.push(`model:end:${context.step}`)
        },
        beforeTool(_context, call) {
          events.push(`tool:start:${call.name}`)
        },
        afterTool(_context, call, result) {
          events.push(`tool:end:${call.name}:${result.content}`)
        },
        afterAgentStep(_context, step) {
          events.push(`step:end:${step}`)
        },
        afterAgentRun(context) {
          events.push(`run:end:${context.step}`)
        },
      },
    ],
  )

  expect(await agent.run("Start")).toBe("finished")
  expect(events).toEqual([
    "run:start:1",
    "step:start:1",
    "model:start:1",
    "model:end:1",
    "tool:start:inspect",
    "tool:end:inspect:observed",
    "step:end:1",
    "step:start:2",
    "model:start:2",
    "model:end:2",
    "step:end:2",
    "run:end:2",
  ])
})

test("does not finish the agent lifecycle without a final answer", async () => {
  let finishedAtStep = 0
  const tool: Tool = {
    name: "inspect",
    description: "Inspect a value",
    inputSchema: { type: "object" },
    async invoke() {
      return "observed"
    },
  }
  const agent = new Agent(
    new Model("test-model", new EndlessToolProvider()),
    "Test prompt",
    [tool],
    1,
    [
      {
        afterAgentRun(context) {
          finishedAtStep = context.step
        },
      },
    ],
  )

  await expect(agent.run("Start")).rejects.toThrow("Agent exceeded 1 steps")
  expect(finishedAtStep).toBe(0)
})
