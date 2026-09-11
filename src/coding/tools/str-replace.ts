import type { Tool } from "../../foundation/tools"

export const strReplaceTool: Tool = {
  name: "str_replace",
  description: "替换文件中唯一匹配的一段文本。",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "需要修改的文件路径" },
      old: { type: "string", description: "需要替换的原始文本" },
      new: { type: "string", description: "替换后的文本" },
    },
    required: ["path", "old", "new"],
  },
  async invoke(input) {
    const path = input.path
    const oldText = input.old
    const newText = input.new
    if (
      typeof path !== "string" ||
      path.length === 0 ||
      typeof oldText !== "string" ||
      oldText.length === 0 ||
      typeof newText !== "string"
    ) {
      throw new Error(
        "path, old and new must be strings; path and old cannot be empty",
      )
    }

    const file = Bun.file(path)
    if (!(await file.exists())) {
      throw new Error(`File not found: ${path}`)
    }

    const content = await file.text()
    const occurrences = content.split(oldText).length - 1
    if (occurrences !== 1) {
      throw new Error(`old text must appear exactly once, found ${occurrences}`)
    }

    await Bun.write(path, content.replace(oldText, newText))
    return `Updated ${path}`
  },
}
