import { tool } from "../tool"
import { z } from "zod"

export const bash = tool({
  name: "bash",
  description: "在 shell 中执行命令并返回输出（stdout + stderr）",
  dangerous: true,
  parameters: z.object({
    command: z.string().describe("要执行的 shell 命令"),
  }),
  execute: async ({ command }) => {
    try {
      const proc = Bun.spawn(["bash", "-c", command], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const exitCode = await proc.exited

      const output = [stdout, stderr].filter(Boolean).join("\n").trim()
      if (exitCode !== 0) {
        return `${output || "(no output)"}\n[exit code: ${exitCode}]`
      }
      return output || "(no output)"
    } catch (err) {
      return `Error executing command: ${(err as Error).message}`
    }
  },
})
