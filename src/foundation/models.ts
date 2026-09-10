import type { AssistantMessage, Message } from "./messages"
import type { Tool } from "./tools"

export type ModelProviderInput = {
  model: string
  messages: Message[]
  tools?: Tool[]
  options?: Record<string, unknown>
  signal?: AbortSignal
}

export interface ModelProvider {
  invoke(input: ModelProviderInput): Promise<AssistantMessage>
}

export type ModelContext = {
  prompt?: string
  messages: Message[]
  tools?: Tool[]
  signal?: AbortSignal
}

export class Model {
  constructor(
    readonly name: string,
    readonly provider: ModelProvider,
    readonly options?: Record<string, unknown>,
  ) {}

  invoke(context: ModelContext): Promise<AssistantMessage> {
    const messages: Message[] = []

    if (context.prompt) {
      messages.push({
        role: "system",
        content: [{ type: "text", text: context.prompt }],
      })
    }

    messages.push(...context.messages)

    return this.provider.invoke({
      model: this.name,
      messages,
      tools: context.tools,
      options: this.options,
      signal: context.signal,
    })
  }
}
