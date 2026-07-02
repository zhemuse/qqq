import { defineTool } from "../tool"
import { z } from "zod"

export const writeFile = defineTool({
  name: "write_file",
  description: "将内容写入文件（会覆盖已存在的文件）",
  parameters: z.object({
    path: z.string().describe("目标文件路径"),
    content: z.string().describe("要写入的文件内容"),
  }),
  execute: async ({ path, content }) => {
    try {
      await Bun.write(path, content)
      return `Successfully written ${content.length} bytes to ${path}`
    } catch (err) {
      return `Error writing file: ${(err as Error).message}`
    }
  },
})
