import type { Tool } from "../../foundation/tools"

export const bashTool: Tool = {
  name: "bash",
  description:
    "在当前工作目录执行一条 shell 命令，返回 stdout 和 stderr。需要观察文件或运行程序时使用。",
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

    console.log(`$ ${command}`)

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
    return (output || `(exit ${exitCode}, no output)`).slice(0, 8_000)
  },
}
