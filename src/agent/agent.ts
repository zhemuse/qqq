import type {
  AssistantMessage,
  Message,
  TextContent,
  ToolCallContent,
  ToolMessage,
  ToolResultContent,
} from "../foundation/messages"
import type { Model } from "../foundation/models"
import type { Tool } from "../foundation/tools"

function getText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  return JSON.stringify(value) ?? String(value)
}

export class Agent {
  private readonly messages: Message[] = []

  constructor(
    readonly model: Model,
    readonly prompt: string,
    readonly tools: Tool[],
    readonly maxSteps = 20,
  ) {}

  async run(text: string): Promise<string> {
    this.messages.push({
      role: "user",
      content: [{ type: "text", text }],
    })

    for (let step = 1; step <= this.maxSteps; step += 1) {
      const assistant = await this.model.invoke({
        prompt: this.prompt,
        messages: this.messages,
        tools: this.tools,
      })
      this.messages.push(assistant)

      const toolCalls = assistant.content.filter(
        (block): block is ToolCallContent => block.type === "tool_call",
      )

      if (toolCalls.length === 0) {
        return getText(assistant)
      }

      this.messages.push(await this.act(toolCalls))
    }

    throw new Error(`Agent exceeded ${this.maxSteps} steps`)
  }

  private async act(toolCalls: ToolCallContent[]): Promise<ToolMessage> {
    const results: ToolResultContent[] = []

    for (const toolCall of toolCalls) {
      const tool = this.tools.find((candidate) => candidate.name === toolCall.name)

      if (!tool) {
        results.push({
          type: "tool_result",
          tool_call_id: toolCall.id,
          content: `Error: unknown tool ${toolCall.name}`,
        })
        continue
      }

      try {
        results.push({
          type: "tool_result",
          tool_call_id: toolCall.id,
          content: toText(await tool.invoke(toolCall.input)),
        })
      } catch (error) {
        results.push({
          type: "tool_result",
          tool_call_id: toolCall.id,
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }

    return { role: "tool", content: results }
  }
}
