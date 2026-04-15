import type { Tool } from "./tool"

// 用户/助手消息
export interface TextMessage {
  role: "user" | "assistant"
  content: string
}

// 工具调用（模型返回）
export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

// 助手调用工具时的消息
export interface AssistantToolCallMessage {
  role: "assistant"
  content: ToolCall[]
}

// 工具执行结果
export interface ToolResultMessage {
  role: "tool_result"
  tool_use_id: string
  content: string
}

export type Message = TextMessage | AssistantToolCallMessage | ToolResultMessage

// LLM 响应
export interface LLMResponse {
  content: string           // 最终文字回答（当无 tool_calls 时有效）
  tool_calls?: ToolCall[]   // 模型想要调用的工具列表
}

// 统一 LLM 客户端接口
export interface LLMClient {
  chat(messages: Message[], tools: Tool[], systemPrompt?: string): Promise<LLMResponse>
}

export interface LLMConfig {
  model: string
  apiKey: string
  baseURL?: string
}

// 工厂函数：根据 baseURL 决定用哪个客户端
export async function createLLMClient(config: LLMConfig): Promise<LLMClient> {
  if (config.baseURL) {
    const { OpenAIClient } = await import("./llm/openai")
    return new OpenAIClient(config)
  }
  const { AnthropicClient } = await import("./llm/anthropic")
  return new AnthropicClient(config)
}
