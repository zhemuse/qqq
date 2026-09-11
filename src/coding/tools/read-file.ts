import type { Tool } from "../../foundation/tools"

export const readFileTool: Tool = {
  name: "read_file",
  description: "读取指定文件的文本内容。",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "需要读取的文件路径" },
    },
    required: ["path"],
  },
  async invoke(input) {
    const path = input.path
    if (typeof path !== "string" || path.length === 0) {
      throw new Error("path must be a non-empty string")
    }

    const file = Bun.file(path)
    if (!(await file.exists())) {
      throw new Error(`File not found: ${path}`)
    }

    return file.text()
  },
}
