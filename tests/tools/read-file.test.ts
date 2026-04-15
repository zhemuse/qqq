import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { readFile } from "../../src/tools/read-file"
import * as fs from "fs/promises"

const TEST_FILE = "/tmp/bun-agent-test-read.txt"

beforeAll(async () => {
  await fs.writeFile(TEST_FILE, "hello world")
})

afterAll(async () => {
  await fs.unlink(TEST_FILE).catch(() => {})
})

describe("readFile tool", () => {
  it("应返回文件内容", async () => {
    const result = await readFile.execute({ path: TEST_FILE })
    expect(result).toBe("hello world")
  })

  it("文件不存在时应返回错误信息", async () => {
    const result = await readFile.execute({ path: "/tmp/nonexistent-abc123.txt" })
    expect(result).toContain("Error")
  })
})
