import OpenAI from "openai"
import type { LLMClient, LLMConfig, LLMResponse, Message, ToolCall, ToolResultMessage } from "../llm"
import type { Tool } from "../tool"

export class OpenAIClient implements LLMClient {
  private client: OpenAI
  private model: string

  constructor(config: LLMConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })
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
