import { describe, it, expect } from "bun:test"
import { bash } from "../../src/tools/bash"

describe("bash tool", () => {
  it("应执行命令并返回 stdout", async () => {
    const result = await bash.execute({ command: "echo hello" })
    expect(result.trim()).toBe("hello")
  })

  it("命令失败时应返回 stderr 内容", async () => {
    const result = await bash.execute({ command: "cat /nonexistent-file-abc123" })
    expect(result).toContain("No such file")
  })

  it("dangerous 应为 true", () => {
    expect(bash.dangerous).toBe(true)
  })
})
