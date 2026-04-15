import { createLLMClient } from "./llm"
import type { ILLMClient, Message } from "./llm"
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
  _llmClient?: ILLMClient
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

      if (!response.tool_calls?.length) {
        return response.content
      }

      messages.push({ role: "assistant", content: null, tool_calls: response.tool_calls })

      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
        const tool = tools.find((t) => t.name === toolName)
        if (!tool) throw new Error(`Unknown tool: ${toolName}`)

        if (tool.dangerous) {
          const ok = await confirmFn(`执行 [${toolName}]？`)
          if (!ok) throw new PermissionDeniedError(toolName)
        }

        const result = await tool.execute(toolArgs)

        messages.push({ role: "tool", tool_call_id: toolCall.id, content: result })
      }
    }

    throw new Error(`Exceeded maxSteps (${maxSteps})`)
  }

  private async createLLM(): Promise<ILLMClient> {
    return createLLMClient({
      model: this.options.model ?? "claude-sonnet-4-6",
      apiKey: this.options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
      baseURL: this.options.baseURL,
    })
  }
}
