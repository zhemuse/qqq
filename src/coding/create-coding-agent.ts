import { fileURLToPath } from "node:url"

import { Agent } from "../agent/agent"
import { createLoggingMiddleware } from "../agent/logging-middleware"
import { createSkillsMiddleware } from "../agent/skills/skills-middleware"
import { createTodoSystem } from "../agent/todo/todo-system"
import type { Model } from "../foundation/models"
import { bashTool } from "./tools/bash"
import { readFileTool } from "./tools/read-file"
import { strReplaceTool } from "./tools/str-replace"
import { writeFileTool } from "./tools/write-file"

const CODING_PROMPT =
  "你是一个 Coding Agent。读取、写入和修改文件时使用专用文件工具；运行命令、测试或构建时使用 bash。"

const DEFAULT_SKILLS_DIRECTORY = fileURLToPath(
  new URL("../../skills", import.meta.url),
)

export function createCodingAgent(
  model: Model,
  skillsDirectory = DEFAULT_SKILLS_DIRECTORY,
): Agent {
  const todo = createTodoSystem()

  return new Agent(
    model,
    CODING_PROMPT,
    [bashTool, readFileTool, writeFileTool, strReplaceTool, todo.tool],
    20,
    [
      createSkillsMiddleware(skillsDirectory),
      todo.middleware,
      createLoggingMiddleware(),
    ],
  )
}
