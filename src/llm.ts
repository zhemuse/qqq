import OpenAI from "openai"
import type { Tool } from "./tool"

// ── 消息类型 ────────────────────────────────────────────────────────────────

export interface TextMessage {
  role: "user" | "assistant"
  content: string
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface AssistantToolCallMessage {
  role: "assistant"
  content: ToolCall[]
}

export interface ToolResultMessage {
  role: "tool_result"
  tool_use_id: string
  content: string
}

export type Message = TextMessage | AssistantToolCallMessage | ToolResultMessage

export interface LLMResponse {
  content: string
  tool_calls?: ToolCall[]
}

// ── 客户端 ──────────────────────────────────────────────────────────────────

export interface LLMConfig {
  model: string
  apiKey: string
  // Anthropic 兼容端点：https://api.anthropic.com/v1
  // DeepSeek：https://api.deepseek.com
  // Ollama：http://localhost:11434/v1
  baseURL?: string
}

export class LLMClient {
  private client: OpenAI
  private model: string

  constructor(config: LLMConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? "https://api.anthropic.com/v1",
    })
    this.model = config.model
  }

  async chat(messages: Message[], tools: Tool[], systemPrompt?: string): Promise<LLMResponse> {
    const openaiMessages = this.toOpenAIMessages(messages, systemPrompt)

    const toolDefs: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }))

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
    })

    const msg = response.choices[0]?.message
    if (!msg) return { content: "" }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        content: "",
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        })),
      }
    }

    return { content: msg.content ?? "" }
  }

  private toOpenAIMessages(messages: Message[], systemPrompt?: string): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = []

    if (systemPrompt) {
      result.push({ role: "system", content: systemPrompt })
    }

    for (const m of messages) {
      if (m.role === "user" && typeof m.content === "string") {
        result.push({ role: "user", content: m.content })
        continue
      }
      if (m.role === "assistant" && typeof m.content === "string") {
        result.push({ role: "assistant", content: m.content })
        continue
      }
      if (m.role === "assistant" && Array.isArray(m.content)) {
        result.push({
          role: "assistant",
          content: null,
          tool_calls: (m.content as ToolCall[]).map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        })
        continue
      }
      if (m.role === "tool_result") {
        const tr = m as ToolResultMessage
        result.push({ role: "tool", tool_call_id: tr.tool_use_id, content: tr.content })
        continue
      }
    }

    return result
  }
}
