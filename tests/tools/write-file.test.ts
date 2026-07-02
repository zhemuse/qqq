import { describe, it, expect, afterAll } from "bun:test"
import { writeFile } from "../../src/tools/write-file"
import * as fs from "fs/promises"

const TEST_FILE = "/tmp/bun-agent-test-write.txt"

afterAll(async () => {
  await fs.unlink(TEST_FILE).catch(() => {})
})

describe("writeFile tool", () => {
  it("应写入内容到文件并返回确认信息", async () => {
    const result = await writeFile.execute({ path: TEST_FILE, content: "test content" })
    expect(result).toContain("written")

    const written = await fs.readFile(TEST_FILE, "utf-8")
    expect(written).toBe("test content")
  })
})
