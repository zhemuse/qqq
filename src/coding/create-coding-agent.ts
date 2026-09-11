import { Agent } from "../agent/agent"
import { createLoggingMiddleware } from "../agent/logging-middleware"
import type { Model } from "../foundation/models"
import { bashTool } from "./tools/bash"
import { readFileTool } from "./tools/read-file"
import { strReplaceTool } from "./tools/str-replace"
import { writeFileTool } from "./tools/write-file"

const CODING_PROMPT =
  "你是一个 Coding Agent。读取、写入和修改文件时使用专用文件工具；运行命令、测试或构建时使用 bash。"

export function createCodingAgent(model: Model): Agent {
  return new Agent(
    model,
    CODING_PROMPT,
    [bashTool, readFileTool, writeFileTool, strReplaceTool],
    20,
    [createLoggingMiddleware()],
  )
}
