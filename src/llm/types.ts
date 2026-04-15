import type { Tool } from "../tool"

export interface TextMessage {
  role: "user" | "assistant"
  content: string
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface AssistantToolCallMessage {
  role: "assistant"
  content: ToolCall[]
}

export interface ToolResultMessage {
  role: "tool_result"
  tool_use_id: string
  content: string
}

export type Message = TextMessage | AssistantToolCallMessage | ToolResultMessage

export interface LLMResponse {
  content: string
  tool_calls?: ToolCall[]
}

export interface LLMConfig {
  model: string
  apiKey: string
  // Anthropic 兼容端点：https://api.anthropic.com/v1
  // DeepSeek：https://api.deepseek.com
  // Ollama：http://localhost:11434/v1
  baseURL?: string
}

export interface ILLMClient {
  chat(messages: Message[], tools: Tool[], systemPrompt?: string): Promise<LLMResponse>
}
