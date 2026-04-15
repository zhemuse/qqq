import { describe, it, expect, mock } from "bun:test"
import { Agent } from "../src/agent"
import { tool } from "../src/tool"
import { z } from "zod"
import type { LLMClient, LLMResponse, Message } from "../src/llm"

// Mock LLM：直接返回文字答案，不调用工具
function makeMockLLM(responses: LLMResponse[]): LLMClient {
  let i = 0
  return {
    async chat(_messages: Message[], _tools: unknown[], _systemPrompt?: string): Promise<LLMResponse> {
      return responses[i++] ?? { content: "done" }
    },
  }
}

describe("Agent", () => {
  it("run() 应返回 LLM 的文字回答", async () => {
    const agent = new Agent({
      _llmClient: makeMockLLM([{ content: "Hello from LLM" }]),
    })
    const result = await agent.run("hi")
    expect(result).toBe("Hello from LLM")
  })

  it("run() 应执行工具并将结果追加到 messages 再次调用 LLM", async () => {
    const executed: string[] = []

    const greet = tool({
      name: "greet",
      description: "问好",
      parameters: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        executed.push(name)
        return `Hello, ${name}!`
      },
    })

    const agent = new Agent({
      tools: [greet],
      _llmClient: makeMockLLM([
        { content: "", tool_calls: [{ id: "c1", name: "greet", args: { name: "World" } }] },
        { content: "Done!" },
      ]),
    })

    const result = await agent.run("greet someone")
    expect(executed).toEqual(["World"])
    expect(result).toBe("Done!")
  })

  it("超过 maxSteps 应抛出错误", async () => {
    const loopTool = tool({
      name: "loop",
      description: "always calls itself",
      parameters: z.object({}),
      execute: async () => "result",
    })

    const agent = new Agent({
      tools: [loopTool],
      maxSteps: 2,
      _llmClient: makeMockLLM(
        Array(10).fill({ content: "", tool_calls: [{ id: "c1", name: "loop", args: {} }] })
      ),
    })

    await expect(agent.run("loop")).rejects.toThrow("maxSteps")
  })

  it("dangerous 工具被拒绝时应抛出 PermissionDeniedError", async () => {
    const dangerTool = tool({
      name: "danger",
      description: "危险",
      parameters: z.object({}),
      dangerous: true,
      execute: async () => "done",
    })

    const agent = new Agent({
      tools: [dangerTool],
      _llmClient: makeMockLLM([
        { content: "", tool_calls: [{ id: "c1", name: "danger", args: {} }] },
      ]),
      _confirm: async () => false,  // 模拟用户拒绝
    })

    await expect(agent.run("do danger")).rejects.toThrow("PermissionDenied")
  })
})
