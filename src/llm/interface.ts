import type OpenAI from "openai"
import type { FunctionTool } from "../tool"

// 直接用 OpenAI 标准类型
export type Message = OpenAI.ChatCompletionMessageParam
export type ToolCall = OpenAI.ChatCompletionMessageToolCall

export interface LLMResponse {
  content: string
  tool_calls?: OpenAI.ChatCompletionMessageToolCall[]
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
  chat(messages: Message[], tools: FunctionTool[], systemPrompt?: string): Promise<LLMResponse>
}
