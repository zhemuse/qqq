import type { Tool } from "../../foundation/tools"

export const bashTool: Tool = {
  name: "bash",
  description:
    "在当前工作目录执行一条 shell 命令，返回退出码、stdout 和 stderr。需要运行测试、构建或其他命令时使用。",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "需要执行的完整 shell 命令",
      },
    },
    required: ["command"],
  },
  async invoke(input) {
    const command = input.command
    if (typeof command !== "string" || command.length === 0) {
      throw new Error("command must be a non-empty string")
    }

    const child = Bun.spawn(["zsh", "-lc", command], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])

    const output = `${stdout}${stderr}`.trim()
    return `exit ${exitCode}\n${output || "(no output)"}`.slice(0, 8_000)
  },
}
