import type {
  AssistantMessage,
  Message,
  ToolCallContent,
  ToolResultContent,
} from "../foundation/messages"
import type { ModelContext } from "../foundation/models"

export type AgentContext = {
  messages: Message[]
  step: number
}

export interface AgentMiddleware {
  beforeAgentRun?(context: AgentContext): Promise<void> | void
  afterAgentRun?(context: AgentContext): Promise<void> | void

  beforeAgentStep?(context: AgentContext, step: number): Promise<void> | void
  afterAgentStep?(context: AgentContext, step: number): Promise<void> | void

  beforeModel?(
    context: AgentContext,
    modelContext: ModelContext,
  ):
    | Promise<Partial<ModelContext> | void>
    | Partial<ModelContext>
    | void
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
