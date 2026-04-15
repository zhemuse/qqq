import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { search } from "../../src/tools/search"
import * as fs from "fs/promises"

const TEST_DIR = "/tmp/bun-agent-search-test"

beforeAll(async () => {
  await fs.mkdir(TEST_DIR, { recursive: true })
  await fs.writeFile(`${TEST_DIR}/a.txt`, "hello world\nfoo bar")
  await fs.writeFile(`${TEST_DIR}/b.txt`, "baz qux\nhello again")
})

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true }).catch(() => {})
})

describe("search tool", () => {
  it("应返回包含关键词的行", async () => {
    const result = await search.execute({ pattern: "hello", path: TEST_DIR })
    expect(result).toContain("hello world")
    expect(result).toContain("hello again")
  })

  it("无匹配时应返回提示信息", async () => {
    const result = await search.execute({ pattern: "zzznomatch", path: TEST_DIR })
    expect(result).toContain("No matches")
  })

  it("路径不存在时应返回错误信息（而非 No matches）", async () => {
    const result = await search.execute({ pattern: "hello", path: "/tmp/definitely-nonexistent-xyz123" })
    expect(result.toLowerCase()).toContain("error")
  })
})
