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
import type { AgentContext, AgentMiddleware } from "./agent-middleware"

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
    readonly middlewares: AgentMiddleware[] = [],
  ) {}

  async run(text: string): Promise<string> {
    this.messages.push({
      role: "user",
      content: [{ type: "text", text }],
    })

    const context: AgentContext = {
      messages: this.messages,
      step: 0,
    }
    await this.beforeAgentRun(context)

    for (let step = 1; step <= this.maxSteps; step += 1) {
      context.step = step
      await this.beforeAgentStep(context, step)
      await this.beforeModel(context)
      const assistant = await this.model.invoke({
        prompt: this.prompt,
        messages: this.messages,
        tools: this.tools,
      })
      await this.afterModel(context, assistant)
      this.messages.push(assistant)

      const toolCalls = assistant.content.filter(
        (block): block is ToolCallContent => block.type === "tool_call",
      )

      if (toolCalls.length === 0) {
        await this.afterAgentStep(context, step)
        await this.afterAgentRun(context)
        return getText(assistant)
      }

      this.messages.push(await this.act(context, toolCalls))
      await this.afterAgentStep(context, step)
    }

    throw new Error(`Agent exceeded ${this.maxSteps} steps`)
  }

  private async act(
    context: AgentContext,
    toolCalls: ToolCallContent[],
  ): Promise<ToolMessage> {
    const results: ToolResultContent[] = []

    for (const toolCall of toolCalls) {
      await this.beforeTool(context, toolCall)
      const tool = this.tools.find((candidate) => candidate.name === toolCall.name)
      let result: ToolResultContent

      if (!tool) {
        result = {
          type: "tool_result",
          tool_call_id: toolCall.id,
          content: `Error: unknown tool ${toolCall.name}`,
        }
      } else {
        try {
          result = {
            type: "tool_result",
            tool_call_id: toolCall.id,
            content: toText(await tool.invoke(toolCall.input)),
          }
        } catch (error) {
          result = {
            type: "tool_result",
            tool_call_id: toolCall.id,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      }

      await this.afterTool(context, toolCall, result)
      results.push(result)
    }

    return { role: "tool", content: results }
  }

  private async beforeAgentRun(context: AgentContext): Promise<void> {
    for (const middleware of this.middlewares) {
      await middleware.beforeAgentRun?.(context)
    }
  }

  private async afterAgentRun(context: AgentContext): Promise<void> {
    for (const middleware of this.middlewares) {
      await middleware.afterAgentRun?.(context)
    }
  }

  private async beforeAgentStep(
    context: AgentContext,
    step: number,
  ): Promise<void> {
    for (const middleware of this.middlewares) {
      await middleware.beforeAgentStep?.(context, step)
    }
  }

  private async afterAgentStep(
    context: AgentContext,
    step: number,
  ): Promise<void> {
    for (const middleware of this.middlewares) {
      await middleware.afterAgentStep?.(context, step)
    }
  }

  private async beforeModel(context: AgentContext): Promise<void> {
    for (const middleware of this.middlewares) {
      await middleware.beforeModel?.(context)
    }
  }

  private async afterModel(
    context: AgentContext,
    message: AssistantMessage,
  ): Promise<void> {
    for (const middleware of this.middlewares) {
      await middleware.afterModel?.(context, message)
    }
  }

  private async beforeTool(
    context: AgentContext,
    call: ToolCallContent,
  ): Promise<void> {
    for (const middleware of this.middlewares) {
      await middleware.beforeTool?.(context, call)
    }
  }

  private async afterTool(
    context: AgentContext,
    call: ToolCallContent,
    result: ToolResultContent,
  ): Promise<void> {
    for (const middleware of this.middlewares) {
      await middleware.afterTool?.(context, call, result)
    }
  }
}
