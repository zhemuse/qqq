import { describe, it, expect } from "bun:test"
import { Agent } from "../src/agent"
import { defineTool } from "../src/tool"
import { z } from "zod"
import type { ILLMClient, LLMResponse, Message } from "../src/llm"
import type { FunctionTool } from "../src/tool"

function makeMockLLM(responses: LLMResponse[]): ILLMClient {
  let i = 0
  return {
    async chat(_messages: Message[], _tools: FunctionTool[], _systemPrompt?: string): Promise<LLMResponse> {
      return responses[i++] ?? { content: "done" }
    },
  }
}

const toolCall = (id: string, name: string, args: Record<string, unknown>) => ({
  id,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
})

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

    const greet = defineTool({
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
        { content: "", tool_calls: [toolCall("c1", "greet", { name: "World" })] },
        { content: "Done!" },
      ]),
    })

    const result = await agent.run("greet someone")
    expect(executed).toEqual(["World"])
    expect(result).toBe("Done!")
  })

  it("超过 maxSteps 应抛出错误", async () => {
    const loopTool = defineTool({
      name: "loop",
      description: "always calls itself",
      parameters: z.object({}),
      execute: async () => "result",
    })

    const agent = new Agent({
      tools: [loopTool],
      maxSteps: 2,
      _llmClient: makeMockLLM(
        Array(10).fill({ content: "", tool_calls: [toolCall("c1", "loop", {})] })
      ),
    })

    await expect(agent.run("loop")).rejects.toThrow("maxSteps")
  })
})
