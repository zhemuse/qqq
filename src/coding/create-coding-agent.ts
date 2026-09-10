import { Agent } from "../agent/agent"
import type { Model } from "../foundation/models"
import { bashTool } from "./tools/bash"

const CODING_PROMPT =
  "你是一个终端 Agent。需要了解环境或完成任务时使用 bash 工具。"

export function createCodingAgent(model: Model): Agent {
  return new Agent(model, CODING_PROMPT, [bashTool])
}
