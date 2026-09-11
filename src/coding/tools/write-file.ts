import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import type { Tool } from "../../foundation/tools"

export const writeFileTool: Tool = {
  name: "write_file",
  description: "将完整内容写入指定文件。",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "需要写入的文件路径" },
      content: { type: "string", description: "需要写入的完整内容" },
    },
    required: ["path", "content"],
  },
  async invoke(input) {
    const path = input.path
    const content = input.content
    if (
      typeof path !== "string" ||
      path.length === 0 ||
      typeof content !== "string"
    ) {
      throw new Error("path must be non-empty and content must be a string")
    }

    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, content)
    return `Wrote ${path}`
  },
}
