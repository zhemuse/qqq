import type {
  AssistantMessage,
  Message,
  SystemMessage,
} from "../../foundation/messages"
import type {
  ModelProvider,
  ModelProviderInput,
} from "../../foundation/models"
import type { Tool } from "../../foundation/tools"

type AnthropicAssistantMessage = {
  role: "assistant"
  content: unknown[]
}

function toAnthropicMessage(message: Exclude<Message, SystemMessage>) {
  if (message.role === "assistant") {
    return {
      role: message.role,
      content: message.content.map((content) =>
        content.type === "tool_call"
          ? { ...content, type: "tool_use" as const }
          : content,
      ),
    }
  }

  if (message.role === "tool") {
    return {
      role: "user" as const,
      content: message.content.map(({ tool_call_id, ...content }) => ({
        ...content,
        tool_use_id: tool_call_id,
      })),
    }
  }

  return message
}

function fromAnthropicMessage(
  message: AnthropicAssistantMessage,
): AssistantMessage {
  return {
    role: "assistant",
    content: message.content.flatMap<AssistantMessage["content"][number]>((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return []
      }

      const content = value as Record<string, unknown>
      if (content.type === "text" && typeof content.text === "string") {
        return [{ type: "text" as const, text: content.text }]
      }

      if (
        content.type !== "tool_use" ||
        typeof content.id !== "string" ||
        typeof content.name !== "string"
      ) {
        return []
      }

      const input =
        content.input &&
        typeof content.input === "object" &&
        !Array.isArray(content.input)
          ? content.input as Record<string, unknown>
          : {}

      return [{
        type: "tool_call" as const,
        id: content.id,
        name: content.name,
        input,
      }]
    }),
  }
}

function toAnthropicRequest(messages: Message[]) {
  const system = messages
    .filter((message): message is SystemMessage => message.role === "system")
    .flatMap((message) => message.content)
    .map((block) => block.text)
    .join("\n\n")

  // Anthropic 要求把客户端工具结果作为 user-role message 发送：
  // https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
  const conversation = messages
    .filter(
      (message): message is Exclude<Message, SystemMessage> =>
        message.role !== "system",
    )
    .map(toAnthropicMessage)

  return {
    system: system || undefined,
    conversation,
  }
}

function toAnthropicTool(tool: Tool) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }
}

export class AnthropicModelProvider implements ModelProvider {
  private readonly baseURL: string
  private readonly apiKey: string

  constructor(input: { baseURL: string; apiKey: string }) {
    this.baseURL = input.baseURL.replace(/\/+$/, "")
    this.apiKey = input.apiKey
  }

  async invoke(input: ModelProviderInput): Promise<AssistantMessage> {
    const { system, conversation } = toAnthropicRequest(input.messages)

    const response = await fetch(`${this.baseURL}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        ...input.options,
        model: input.model,
        system,
        messages: conversation,
        tools: input.tools?.map(toAnthropicTool),
      }),
      signal: input.signal,
    })

    if (!response.ok) {
      throw new Error(
        `Model request failed: ${response.status} ${await response.text()}`,
      )
    }

    const result = (await response.json()) as AnthropicAssistantMessage
    return fromAnthropicMessage(result)
  }
}
