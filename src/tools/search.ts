import { tool } from "../tool"
import { z } from "zod"

export const search = tool({
  name: "search",
  description: "在指定目录下递归搜索包含 pattern 的文件行（类似 grep -r）",
  parameters: z.object({
    pattern: z.string().describe("要搜索的文本模式"),
    path: z.string().describe("搜索的根目录或文件路径"),
  }),
  execute: async ({ pattern, path }) => {
    try {
      const proc = Bun.spawn(["grep", "-rn", "--include=*", pattern, path], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited

      if (exitCode === 1 || stdout.trim() === "") {
        return `No matches found for "${pattern}" in ${path}`
      }
      return stdout.trim()
    } catch (err) {
      return `Error searching: ${(err as Error).message}`
    }
  },
})
