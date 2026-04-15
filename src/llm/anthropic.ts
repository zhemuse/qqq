import Anthropic from "@anthropic-ai/sdk"
import type { LLMClient, LLMConfig, LLMResponse, Message, ToolCall, ToolResultMessage } from "../llm"
import type { Tool } from "../tool"

export class AnthropicClient implements LLMClient {
  private client: Anthropic
  private model: string

  constructor(config: LLMConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey })
    this.model = config.model
  }

  async chat(messages: Message[], tools: Tool[], systemPrompt?: string): Promise<LLMResponse> {
    const anthropicMessages = this.toAnthropicMessages(messages)

    const toolDefs = tools.map((t) => {
      const { additionalProperties: _, ...schema } = t.parameters as Record<string, unknown>
      return {
        name: t.name,
        description: t.description,
        input_schema: schema as Anthropic.Messages.Tool["input_schema"],
      }
    })

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: anthropicMessages,
      ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
    })

    return this.fromAnthropicResponse(response)
  }

  private toAnthropicMessages(
    messages: Message[]
  ): Anthropic.Messages.MessageParam[] {
    const result: Anthropic.Messages.MessageParam[] = []
    let i = 0

    while (i < messages.length) {
      const m = messages[i]

      if (m.role === "user" && typeof m.content === "string") {
        result.push({ role: "user", content: m.content })
        i++
        continue
      }

      if (m.role === "assistant" && typeof m.content === "string") {
        result.push({ role: "assistant", content: m.content })
        i++
        continue
      }

      if (m.role === "assistant" && Array.isArray(m.content)) {
        const toolUseContent = (m.content as ToolCall[]).map((tc) => ({
          type: "tool_use" as const,
          id: tc.id,
          name: tc.name,
          input: tc.args,
        }))

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
        let j = i + 1
        while (j < messages.length && messages[j].role === "tool_result") {
          const tr = messages[j] as ToolResultMessage
          toolResults.push({
            type: "tool_result",
            tool_use_id: tr.tool_use_id,
            content: tr.content,
          })
          j++
        }

        result.push({ role: "assistant", content: toolUseContent })
        if (toolResults.length > 0) {
          result.push({ role: "user", content: toolResults })
        }
        i = j
        continue
      }

      // Skip standalone tool_result messages (already consumed above)
      i++
    }

    return result
  }

  private fromAnthropicResponse(
    response: Anthropic.Messages.Message
  ): LLMResponse {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    )

    if (toolUseBlocks.length > 0) {
      return {
        content: "",
        tool_calls: toolUseBlocks.map((b) => ({
          id: b.id,
          name: b.name,
          args: b.input as Record<string, unknown>,
        })),
      }
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    )
    return { content: textBlock?.text ?? "" }
  }
}
