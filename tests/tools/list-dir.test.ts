import { describe, it, expect } from "bun:test"
import { listDir } from "../../src/tools/list-dir"

describe("listDir tool", () => {
  it("应返回目录内容列表", async () => {
    const result = await listDir.execute({ path: "/tmp" })
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })

  it("目录不存在时应返回错误信息", async () => {
    const result = await listDir.execute({ path: "/tmp/nonexistent-dir-abc123" })
    expect(result).toContain("Error")
  })
})
