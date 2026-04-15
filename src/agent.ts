import { createLLMClient } from "./llm"
import type { LLMClient, Message, ToolCall, ToolResultMessage } from "./llm"
import type { Tool } from "./tool"
import { confirm } from "./confirm"

export class PermissionDeniedError extends Error {
  constructor(toolName: string) {
    super(`PermissionDenied: user rejected execution of tool "${toolName}"`)
    this.name = "PermissionDeniedError"
  }
}

export interface AgentOptions {
  model?: string
  apiKey?: string
  baseURL?: string
  prompt?: string
  messages?: Message[]
  tools?: Tool[]
  maxSteps?: number
  // 测试用注入点（下划线前缀表示内部/测试用途）
  _llmClient?: LLMClient
  _confirm?: (prompt: string) => Promise<boolean>
}

export class Agent {
  private options: AgentOptions

  constructor(options: AgentOptions = {}) {
    this.options = options
  }

  async run(userMessage: string): Promise<string> {
    const llm = this.options._llmClient ?? (await this.createLLM())
    const confirmFn = this.options._confirm ?? confirm
    const tools = this.options.tools ?? []
    const maxSteps = this.options.maxSteps ?? 20

    const messages: Message[] = [
      ...(this.options.messages ?? []),
      { role: "user", content: userMessage },
    ]

    for (let step = 0; step < maxSteps; step++) {
      const response = await llm.chat(messages, tools, this.options.prompt)

      if (!response.tool_calls || response.tool_calls.length === 0) {
        return response.content
      }

      // 助手调用工具的消息
      messages.push({ role: "assistant", content: response.tool_calls })

      for (const toolCall of response.tool_calls) {
        const tool = tools.find((t) => t.name === toolCall.name)
        if (!tool) throw new Error(`Unknown tool: ${toolCall.name}`)

        if (tool.dangerous) {
          const ok = await confirmFn(`执行 [${tool.name}]？`)
          if (!ok) throw new PermissionDeniedError(tool.name)
        }

        const result = await tool.execute(toolCall.args)

        const toolResult: ToolResultMessage = {
          role: "tool_result",
          tool_use_id: toolCall.id,
          content: result,
        }
        messages.push(toolResult)
      }
    }

    throw new Error(`Exceeded maxSteps (${maxSteps})`)
  }

  private async createLLM(): Promise<LLMClient> {
    return createLLMClient({
      model: this.options.model ?? "claude-sonnet-4-6",
      apiKey: this.options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
      baseURL: this.options.baseURL,
    })
  }
}
