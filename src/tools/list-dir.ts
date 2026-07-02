import { defineTool } from "../tool"
import { z } from "zod"
import * as fs from "fs/promises"

export const listDir = defineTool({
  name: "list_dir",
  description: "列出目录下的文件和子目录",
  parameters: z.object({
    path: z.string().describe("要列出的目录路径"),
  }),
  execute: async ({ path: dirPath }) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const lines = entries.map((e) => {
        const prefix = e.isDirectory() ? "📁" : "📄"
        return `${prefix} ${e.name}`
      })
      return lines.join("\n")
    } catch (err) {
      return `Error listing directory: ${(err as Error).message}`
    }
  },
})
