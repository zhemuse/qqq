import OpenAI from "openai"
import type { ILLMClient, LLMConfig, LLMResponse, Message } from "./interface"
import type { Tool } from "../tool"

export class OpenAIClient implements ILLMClient {
  private client: OpenAI
  private model: string

  constructor(config: LLMConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })
    this.model = config.model
  }

  async chat(messages: Message[], tools: Tool[], systemPrompt?: string): Promise<LLMResponse> {
    const allMessages: Message[] = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages

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
      messages: allMessages,
      ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
    })

    const msg = response.choices[0]?.message
    if (!msg) return { content: "" }

    if (msg.tool_calls?.length) {
      return { content: "", tool_calls: msg.tool_calls }
    }

    return { content: msg.content ?? "" }
  }
}
