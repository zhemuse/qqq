/**
 * Content Block 用结构化类型承载消息内容。
 * 延伸阅读：ACP v2 Content https://agentclientprotocol.com/protocol/v2/content
 * ToolCallContent 与 ToolResultContent 是工程内部类型，并非 ACP 类型。
 */
export type TextContent = {
  type: "text"
  text: string
}

/** 模型发出的工具调用请求。 */
export type ToolCallContent = {
  type: "tool_call"
  id: string
  name: string
  input: Record<string, unknown>
}

/** 宿主程序执行工具后返回给模型的结果。 */
export type ToolResultContent = {
  type: "tool_result"
  tool_call_id: string
  content: string
}

/** 系统指令；Provider 负责转换成具体模型协议。 */
export type SystemMessage = {
  role: "system"
  content: TextContent[]
}

/** 用户的真实输入，不包含工具执行结果。 */
export type UserMessage = {
  role: "user"
  content: string | TextContent[]
}

/** 模型输出，可以同时包含文本和工具调用请求。 */
export type AssistantMessage = {
  role: "assistant"
  content: Array<TextContent | ToolCallContent>
}

/** 工具执行产生的观察结果；Provider 负责转换成具体模型协议。 */
export type ToolMessage = {
  role: "tool"
  content: ToolResultContent[]
}

/** Agent 内部统一维护的消息历史。 */
export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage
