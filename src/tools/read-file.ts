import { tool } from "../tool"
import { z } from "zod"

export const readFile = tool({
  name: "read_file",
  description: "读取文件内容并返回文本",
  parameters: z.object({
    path: z.string().describe("要读取的文件路径"),
  }),
  execute: async ({ path }) => {
    try {
      return await Bun.file(path).text()
    } catch (err) {
      return `Error reading file: ${(err as Error).message}`
    }
  },
})
