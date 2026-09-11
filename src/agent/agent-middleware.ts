import type {
  AssistantMessage,
  Message,
  ToolCallContent,
  ToolResultContent,
} from "../foundation/messages"

export type AgentContext = {
  messages: Message[]
  step: number
}

export interface AgentMiddleware {
  beforeAgentRun?(context: AgentContext): Promise<void> | void
  afterAgentRun?(context: AgentContext): Promise<void> | void

  beforeAgentStep?(context: AgentContext, step: number): Promise<void> | void
  afterAgentStep?(context: AgentContext, step: number): Promise<void> | void

  beforeModel?(context: AgentContext): Promise<void> | void
  afterModel?(
    context: AgentContext,
    message: AssistantMessage,
  ): Promise<void> | void

  beforeTool?(
    context: AgentContext,
    call: ToolCallContent,
  ): Promise<void> | void
  afterTool?(
    context: AgentContext,
    call: ToolCallContent,
    result: ToolResultContent,
  ): Promise<void> | void
}
