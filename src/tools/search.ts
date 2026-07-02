import { defineTool } from "../tool"
import { z } from "zod"

export const search = defineTool({
  name: "search",
  description: "在指定目录下递归搜索包含 pattern 的文件行（类似 grep -r）",
  parameters: z.object({
    pattern: z.string().describe("要搜索的文本模式"),
    path: z.string().describe("搜索的根目录或文件路径"),
  }),
  execute: async ({ pattern, path }) => {
    try {
      const proc = Bun.spawn(["grep", "-rn", pattern, path], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const exitCode = await proc.exited

      if (exitCode === 0) return stdout.trim()
      if (exitCode === 1) return `No matches found for "${pattern}" in ${path}`
      return `Search error: ${stderr.trim() || stdout.trim()}`
    } catch (err) {
      return `Error searching: ${(err as Error).message}`
    }
  },
})
