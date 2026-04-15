export type { Message, TextMessage, ToolCall, AssistantToolCallMessage, ToolResultMessage, LLMResponse, LLMConfig, ILLMClient } from "./types"
export { OpenAIClient } from "./openai"

import type { LLMConfig, ILLMClient } from "./types"

export async function createLLMClient(config: LLMConfig): Promise<ILLMClient> {
  const { OpenAIClient } = await import("./openai")
  return new OpenAIClient({
    ...config,
    baseURL: config.baseURL ?? "https://api.anthropic.com/v1",
  })
}
