import OpenAI from "openai"
import { toJSONSchema } from "zod"
import type { ILLMClient, LLMConfig, LLMResponse, Message } from "./interface"
import type { FunctionTool } from "../tool"

export class OpenAIClient implements ILLMClient {
  private client: OpenAI
  private model: string

  constructor(config: LLMConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })
    this.model = config.model
  }

  async chat(messages: Message[], tools: FunctionTool[], systemPrompt?: string): Promise<LLMResponse> {
    const allMessages: Message[] = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages

    const toolDefs: OpenAI.ChatCompletionTool[] = tools.map((t) => {
      const { additionalProperties: _, ...schema } = toJSONSchema(t.parameters, { target: "openapi-3.0" }) as Record<string, unknown>
      return {
        type: "function",
        function: { name: t.name, description: t.description, parameters: schema as Record<string, unknown> },
      }
    })

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
