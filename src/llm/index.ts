export type { Message, ToolCall, LLMResponse, LLMConfig, ILLMClient } from "./interface"
export { OpenAIClient } from "./openai"

import type { LLMConfig, ILLMClient } from "./interface"

export async function createLLMClient(config: LLMConfig): Promise<ILLMClient> {
  const { OpenAIClient } = await import("./openai")
  return new OpenAIClient({
    ...config,
    baseURL: config.baseURL ?? "https://api.anthropic.com/v1",
  })
}
