import { describe, it, expect } from "bun:test"

describe("confirm()", () => {
  it("输入 y 时应返回 true", async () => {
    const { parseAnswer } = await import("../src/confirm")
    expect(parseAnswer("y")).toBe(true)
    expect(parseAnswer("Y")).toBe(true)
    expect(parseAnswer("yes")).toBe(true)
  })

  it("输入非 y 时应返回 false", async () => {
    const { parseAnswer } = await import("../src/confirm")
    expect(parseAnswer("n")).toBe(false)
    expect(parseAnswer("N")).toBe(false)
    expect(parseAnswer("no")).toBe(false)
    expect(parseAnswer("")).toBe(false)
  })
})
